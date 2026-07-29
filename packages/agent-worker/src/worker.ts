import {
  EMBEDDING_DIMENSIONS,
  ProvidersExhaustedError,
  ProviderRouter,
  type AgentRequest,
} from "@marketing-ai/agent-service";
import { readAssetFile } from "@marketing-ai/asset-storage";
import { SkillProtocolError } from "@marketing-ai/content-skills";
import type {
  AssetEmbeddingSource,
  ClaimedAgentTask,
  ConversationMessage,
} from "@marketing-ai/database";

import type { SkillRuntime } from "./skill-runtime";
import { SkillWorkflowError } from "./xiaohongshu-runtime";

export interface WorkerQueue {
  claimNextTask(workerId: string): Promise<ClaimedAgentTask | null>;
  completeTask(
    task: ClaimedAgentTask,
    workerId: string,
    result: unknown,
  ): Promise<void>;
  failOrRetryTask(
    task: ClaimedAgentTask,
    workerId: string,
    error: { code: string; message: string; retryable: boolean },
  ): Promise<"queued" | "failed">;
  getConversationMessages(
    task: ClaimedAgentTask,
  ): Promise<ConversationMessage[]>;
  getAssetEmbeddingSource(
    task: ClaimedAgentTask,
  ): Promise<AssetEmbeddingSource | null>;
}

function prompt(input: ClaimedAgentTask["input"]): string {
  if (!("prompt" in input) || typeof input.prompt !== "string") {
    throw new Error("Task input did not contain a prompt");
  }
  return input.prompt;
}

async function requestForTask(
  task: ClaimedAgentTask,
  messages: readonly ConversationMessage[],
  queue: WorkerQueue,
  readAsset: (storageKey: string) => Promise<Uint8Array>,
): Promise<AgentRequest> {
  if ("kind" in task.input) {
    throw new Error("Skill tasks require the configured Skill runtime");
  }
  switch (task.capability) {
    case "text":
      return {
        capability: "text",
        request: {
          messages: messages.map(({ content, role }) => ({ content, role })),
        },
      };
    case "image":
      return {
        capability: "image",
        request: { prompt: prompt(task.input) },
      };
    case "embedding":
      if (
        "purpose" in task.input &&
        task.input.purpose === "asset-index"
      ) {
        const source = await queue.getAssetEmbeddingSource(task);
        if (!source) {
          throw new Error(
            "Asset embedding source was missing or belonged to another merchant",
          );
        }
        if (!source.mimeType.startsWith("image/")) {
          throw new Error(
            "Only image assets support local multimodal embedding",
          );
        }
        return {
          capability: "embedding",
          request: {
            dimensions: EMBEDDING_DIMENSIONS,
            inputs: [
              {
                data: await readAsset(source.storageKey),
                mediaType: source.mimeType,
                type: "image",
              },
            ],
          },
        };
      }
      if (
        !("texts" in task.input) ||
        !Array.isArray(task.input.texts) ||
        task.input.texts.some((text) => typeof text !== "string")
      ) {
        throw new Error("Task input did not contain texts");
      }
      return {
        capability: "embedding",
        request: {
          dimensions: EMBEDDING_DIMENSIONS,
          inputs: task.input.texts.map((text) => ({ text, type: "text" })),
        },
      };
  }
}

export class AgentWorker {
  constructor(
    private readonly workerId: string,
    private readonly queue: WorkerQueue,
    private readonly router: ProviderRouter,
    private readonly skillRuntime?: SkillRuntime,
    private readonly readAsset: (
      storageKey: string,
    ) => Promise<Uint8Array> = readAssetFile,
  ) {}

  async runOnce(): Promise<boolean> {
    const task = await this.queue.claimNextTask(this.workerId);
    if (!task) {
      return false;
    }

    try {
      const prepared =
        "kind" in task.input && task.input.kind === "skill"
          ? await this.skillRuntime?.prepare(task)
          : undefined;
      if ("kind" in task.input && !prepared) {
        throw new Error("Skill runtime is not configured");
      }
      const messages = prepared
        ? []
        : await this.queue.getConversationMessages(task);
      const executeProvider = (request: AgentRequest) =>
        this.router.execute({
          request,
          taskAttempt: task.attemptCount,
          taskId: task.id,
        });
      const output = prepared
        ? await prepared.execute(executeProvider)
        : (
            await executeProvider(
              await requestForTask(
              task,
              messages,
              this.queue,
              this.readAsset,
              ),
            )
          ).output;
      await this.queue.completeTask(task, this.workerId, output);
    } catch (error) {
      if (error instanceof ProvidersExhaustedError) {
        await this.queue.failOrRetryTask(task, this.workerId, {
          code: "PROVIDERS_EXHAUSTED",
          message: error.failures
            .map((failure) => `${failure.code}: ${failure.message}`)
            .join("; "),
          retryable: error.retryable,
        });
      } else if (error instanceof SkillProtocolError) {
        await this.queue.failOrRetryTask(task, this.workerId, {
          code: error.code,
          message: error.message,
          retryable: false,
        });
      } else if (error instanceof SkillWorkflowError) {
        await this.queue.failOrRetryTask(task, this.workerId, {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        });
      } else {
        await this.queue.failOrRetryTask(task, this.workerId, {
          code: "WORKER_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: false,
        });
      }
    }

    return true;
  }
}
