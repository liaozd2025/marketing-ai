import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  FailingTextProvider,
  ProviderRouter,
  type ProviderAttemptFinish,
  type ProviderAttemptStart,
} from "@marketing-ai/agent-service";
import type {
  ClaimedAgentTask,
  ConversationMessage,
} from "@marketing-ai/database";
import { describe, expect, it } from "vitest";

import { AgentWorker, type WorkerQueue } from "./worker";

const task: ClaimedAgentTask = {
  attemptCount: 1,
  capability: "text",
  completedAt: null,
  conversationId: "conversation-1",
  createdAt: new Date(),
  errorCode: null,
  errorMessage: null,
  id: "task-1",
  input: { prompt: "hello" },
  maxAttempts: 3,
  merchantId: "merchant-1",
  result: null,
  status: "running",
  updatedAt: new Date(),
};

class MemoryQueue implements WorkerQueue {
  completed: unknown;
  failed: unknown;
  private claimed = false;
  readonly attempts: Array<
    ProviderAttemptStart & { finish?: ProviderAttemptFinish }
  > = [];

  async claimNextTask() {
    if (this.claimed) return null;
    this.claimed = true;
    return task;
  }

  async getConversationMessages(): Promise<ConversationMessage[]> {
    return [
      {
        content: "hello",
        createdAt: new Date(),
        id: "message-1",
        role: "user",
      },
    ];
  }

  async getAssetEmbeddingSource() {
    return null;
  }

  async completeTask(
    _task: ClaimedAgentTask,
    _workerId: string,
    result: unknown,
  ) {
    this.completed = result;
  }

  async failOrRetryTask(
    _task: ClaimedAgentTask,
    _workerId: string,
    error: unknown,
  ): Promise<"queued"> {
    this.failed = error;
    return "queued";
  }

  async startProviderAttempt(input: ProviderAttemptStart) {
    this.attempts.push(input);
    return String(this.attempts.length - 1);
  }

  async finishProviderAttempt(
    attemptId: string,
    finish: ProviderAttemptFinish,
  ) {
    this.attempts[Number(attemptId)].finish = finish;
  }
}

describe("AgentWorker", () => {
  it("claims independently, falls back, and completes the persisted task", async () => {
    const queue = new MemoryQueue();
    const worker = new AgentWorker(
      "worker-1",
      queue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [
            new FailingTextProvider("primary"),
            new DeterministicTextProvider("fallback"),
          ],
        },
        queue,
      ),
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(queue.completed).toEqual({ text: "[test] hello" });
    expect(queue.failed).toBeUndefined();
    expect(queue.attempts).toEqual([
      expect.objectContaining({
        finish: expect.objectContaining({ status: "failed" }),
        providerId: "primary",
      }),
      expect.objectContaining({
        finish: { status: "succeeded" },
        providerId: "fallback",
      }),
    ]);
    await expect(worker.runOnce()).resolves.toBe(false);
  });
});
