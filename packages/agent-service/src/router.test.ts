import { describe, expect, it } from "vitest";

import { ProviderRouter } from "./router";
import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  FailingTextProvider,
} from "./test-providers";
import type {
  ProviderAttemptFinish,
  ProviderAttemptRecorder,
  ProviderAttemptStart,
} from "./types";
import { EMBEDDING_DIMENSIONS } from "./types";

class MemoryAttempts implements ProviderAttemptRecorder {
  readonly finished = new Map<string, ProviderAttemptFinish>();
  readonly started: ProviderAttemptStart[] = [];

  async startProviderAttempt(attempt: ProviderAttemptStart) {
    this.started.push(attempt);
    return `attempt-${this.started.length}`;
  }

  async finishProviderAttempt(
    attemptId: string,
    result: ProviderAttemptFinish,
  ) {
    this.finished.set(attemptId, result);
  }
}

function routes(text = [new DeterministicTextProvider()]) {
  return {
    embedding: [new DeterministicEmbeddingProvider()],
    image: [new DeterministicImageProvider()],
    text,
  };
}

describe("ProviderRouter", () => {
  it("falls back after a provider failure and records both attempts", async () => {
    const attempts = new MemoryAttempts();
    const router = new ProviderRouter(
      routes([
        new FailingTextProvider("primary"),
        new DeterministicTextProvider("fallback"),
      ]),
      attempts,
    );

    await expect(
      router.execute({
        request: {
          capability: "text",
          request: { messages: [{ content: "hello", role: "user" }] },
        },
        taskAttempt: 1,
        taskId: "task-1",
      }),
    ).resolves.toEqual({
      capability: "text",
      output: { text: "[test] hello" },
    });
    expect(attempts.started.map((attempt) => attempt.providerId)).toEqual([
      "primary",
      "fallback",
    ]);
    expect([...attempts.finished.values()]).toEqual([
      expect.objectContaining({
        errorCode: "TEST_PROVIDER_FAILED",
        status: "failed",
      }),
      { status: "succeeded" },
    ]);
  });

  it("uses independent image and embedding provider contracts", async () => {
    const router = new ProviderRouter(routes(), new MemoryAttempts());

    await expect(
      router.execute({
        request: {
          capability: "image",
          request: { prompt: "brand card" },
        },
        taskAttempt: 1,
        taskId: "task-image",
      }),
    ).resolves.toMatchObject({ capability: "image" });
    await expect(
      router.execute({
        request: {
          capability: "embedding",
          request: {
            dimensions: EMBEDDING_DIMENSIONS,
            inputs: [{ text: "asset", type: "text" }],
          },
        },
        taskAttempt: 1,
        taskId: "task-embedding",
      }),
    ).resolves.toMatchObject({
      capability: "embedding",
      output: { embeddings: [expect.any(Array)] },
    });
  });
});
