import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  FailingTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "./database";
import { ConversationBusyError } from "./tenant-agent-data-access";
import { tenantId } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("agent persistence", () => {
  const merchantAId = randomUUID();
  const merchantBId = randomUUID();
  const memberAId = randomUUID();
  const memberBId = randomUUID();
  const pool = new Pool({ connectionString: databaseUrl });
  const database = new Database(databaseUrl);

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO merchants (id, slug, name)
       VALUES ($1, $2, 'Agent Test A'), ($3, $4, 'Agent Test B')`,
      [
        merchantAId,
        `agent-test-a-${merchantAId.slice(0, 8)}`,
        merchantBId,
        `agent-test-b-${merchantBId.slice(0, 8)}`,
      ],
    );
    await pool.query(
      `INSERT INTO members
         (id, merchant_id, email, password_hash, role)
       VALUES
         ($1, $2, $3, 'unused', 'owner'),
         ($4, $5, $6, 'unused', 'owner')`,
      [
        memberAId,
        merchantAId,
        `${memberAId}@example.test`,
        memberBId,
        merchantBId,
        `${memberBId}@example.test`,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM merchants WHERE id = ANY($1::uuid[])", [
      [merchantAId, merchantBId],
    ]);
    await database.close();
    await pool.end();
  });

  it("submits without running, isolates tenants, persists fallback, and continues", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const tenantB = database.agentForTenant(tenantId(merchantBId));
    const submitted = await tenantA.submitTask(memberAId, {
      capability: "text",
      prompt: "first turn",
    });

    expect(submitted).toMatchObject({
      conversationId: expect.any(String),
      status: "queued",
    });
    await expect(tenantA.getTask(submitted.id)).resolves.toMatchObject({
      attemptCount: 0,
      result: null,
      status: "queued",
    });
    await expect(tenantB.getTask(submitted.id)).resolves.toBeNull();
    await expect(
      tenantB.getConversation(submitted.conversationId!),
    ).resolves.toBeNull();
    await expect(
      tenantA.submitTask(memberAId, {
        capability: "text",
        conversationId: submitted.conversationId!,
        prompt: "too early",
      }),
    ).rejects.toBeInstanceOf(ConversationBusyError);

    const claimed = await database.agentQueue.claimNextTask("worker-test");
    expect(claimed).toMatchObject({
      attemptCount: 1,
      id: submitted.id,
      status: "running",
    });
    const messages = await database.agentQueue.getConversationMessages(
      claimed!,
    );
    const router = new ProviderRouter(
      {
        embedding: [new DeterministicEmbeddingProvider()],
        image: [new DeterministicImageProvider()],
        text: [
          new FailingTextProvider("primary"),
          new DeterministicTextProvider("fallback"),
        ],
      },
      database.agentQueue,
    );
    const result = await router.execute({
      request: {
        capability: "text",
        request: { messages },
      },
      taskAttempt: claimed!.attemptCount,
      taskId: claimed!.id,
    });
    await database.agentQueue.completeTask(
      claimed!,
      "worker-test",
      result.output,
    );

    await expect(tenantA.getTask(submitted.id)).resolves.toMatchObject({
      providerAttempts: [
        {
          errorCode: "TEST_PROVIDER_FAILED",
          providerId: "primary",
          status: "failed",
        },
        { providerId: "fallback", status: "succeeded" },
      ],
      result: { text: "[test] first turn" },
      status: "succeeded",
    });

    const continued = await tenantA.submitTask(memberAId, {
      capability: "text",
      conversationId: submitted.conversationId!,
      prompt: "second turn",
    });
    const claimedContinuation =
      await database.agentQueue.claimNextTask("worker-test");
    const continuedMessages =
      await database.agentQueue.getConversationMessages(
        claimedContinuation!,
      );
    expect(continuedMessages.map(({ content, role }) => ({ content, role })))
      .toEqual([
        { content: "first turn", role: "user" },
        { content: "[test] first turn", role: "assistant" },
        { content: "second turn", role: "user" },
      ]);
    const continuedResult = await router.execute({
      request: {
        capability: "text",
        request: { messages: continuedMessages },
      },
      taskAttempt: claimedContinuation!.attemptCount,
      taskId: claimedContinuation!.id,
    });
    await database.agentQueue.completeTask(
      claimedContinuation!,
      "worker-test",
      continuedResult.output,
    );

    await expect(
      tenantA.getConversation(continued.conversationId!),
    ).resolves.toMatchObject({
      messages: [
        { content: "first turn", role: "user" },
        { content: "[test] first turn", role: "assistant" },
        { content: "second turn", role: "user" },
        { content: "[test] second turn", role: "assistant" },
      ],
    });
  });

  it("retries only to max_attempts and then persists a terminal failure", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, {
      capability: "image",
      prompt: "retry boundary",
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const claimed = await database.agentQueue.claimNextTask("retry-worker");
      expect(claimed).toMatchObject({
        attemptCount: attempt,
        id: submitted.id,
      });
      const status = await database.agentQueue.failOrRetryTask(
        claimed!,
        "retry-worker",
        {
          code: "TEMPORARY_PROVIDER_FAILURE",
          message: "retry me",
          retryable: true,
        },
      );
      expect(status).toBe(attempt < 3 ? "queued" : "failed");
      if (status === "queued") {
        await pool.query(
          "UPDATE agent_tasks SET available_at = now() WHERE id = $1",
          [submitted.id],
        );
      }
    }

    await expect(tenantA.getTask(submitted.id)).resolves.toMatchObject({
      attemptCount: 3,
      errorCode: "TEMPORARY_PROVIDER_FAILURE",
      status: "failed",
    });
  });
});
