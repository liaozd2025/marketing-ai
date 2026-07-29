import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import { Database, tenantId } from "@marketing-ai/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConfiguredSkillRuntime } from "./skill-runtime";
import { AgentWorker } from "./worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("knowledge cold-start through the shared worker", () => {
  const database = new Database(databaseUrl);
  let merchantAId: string;
  let memberAId: string;
  let merchantBId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const accountA = await database.identity.registerMerchant({
      email: `cold-worker-a-${suffix}@example.test`,
      merchantName: "溪岚护理",
      passwordHash: "unused",
    });
    const accountB = await database.identity.registerMerchant({
      email: `cold-worker-b-${suffix}@example.test`,
      merchantName: "另一商家",
      passwordHash: "unused",
    });
    merchantAId = accountA.merchant.id;
    memberAId = accountA.member.id;
    merchantBId = accountB.merchant.id;
  });

  afterAll(async () => {
    await database.close();
  });

  it("uses the shared text provider and persists only tenant-bound drafts", async () => {
    const tenantA = database.forTenant(tenantId(merchantAId));
    const queued = await tenantA.coldStart.createImportAndQueueExtraction(
      memberAId,
      {
        sourceHash: "b".repeat(64),
        sourceKind: "paste",
        sourceMediaType: "text/plain",
        sourceName: "seed-merchant.md",
        sourceSize: 256,
        sourceText: [
          "[[fixture:knowledge-cold-start]]",
          "品牌人设：社区护理主理人",
          "Offering 名称：肩颈舒缓护理",
          "日常价格：298",
        ].join("\n"),
      },
    );
    const worker = new AgentWorker(
      "knowledge-cold-start-integration",
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database),
    );

    expect(await worker.runOnce()).toBe(true);
    await expect(
      database
        .agentForTenant(tenantId(merchantAId))
        .getTask(queued.taskId),
    ).resolves.toMatchObject({
      providerAttempts: [
        expect.objectContaining({
          capability: "text",
          providerId: "test-text",
          status: "succeeded",
        }),
      ],
      result: {
        counts: {
          asset: 1,
          audience: 1,
          brandProfile: 1,
          campaign: 1,
          memberSegment: 1,
          offering: 1,
        },
        draftCount: 6,
        importId: queued.id,
        protocolVersion: "marketing-ai.knowledge-extraction-result.v1",
      },
      status: "succeeded",
    });
    await expect(tenantA.coldStart.listDrafts(queued.id)).resolves.toHaveLength(6);
    await expect(tenantA.knowledgeBase.getBrandProfile()).resolves.toBeNull();
    await expect(tenantA.knowledgeBase.listOfferings()).resolves.toEqual([]);
    await expect(
      database
        .forTenant(tenantId(merchantBId))
        .coldStart.getImport(queued.id),
    ).resolves.toBeNull();
  });
});
