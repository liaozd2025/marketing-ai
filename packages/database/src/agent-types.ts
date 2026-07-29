export type AgentCapability = "text" | "image" | "embedding";
export type AgentTaskStatus = "queued" | "running" | "succeeded" | "failed";

export interface AssetIndexTaskInput {
  readonly assetId: string;
  readonly purpose: "asset-index";
}

export interface AssetEmbeddingSource {
  readonly assetId: string;
  readonly mimeType: string;
  readonly storageKey: string;
}

export interface AssetSearchTaskInput {
  readonly filters: {
    readonly limit: number;
    readonly offeringId: string | null;
    readonly scene: string | null;
  };
  readonly purpose: "asset-search";
  readonly texts: readonly [string];
}

export type AgentTaskInput =
  | { readonly prompt: string }
  | { readonly purpose?: "generic"; readonly texts: readonly string[] }
  | AssetIndexTaskInput
  | AssetSearchTaskInput
  | SkillTaskInput;

export interface AgentTask {
  readonly attemptCount: number;
  readonly capability: AgentCapability;
  readonly completedAt: Date | null;
  readonly conversationId: string | null;
  readonly createdAt: Date;
  readonly createdByMemberId: string;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly id: string;
  readonly input: AgentTaskInput;
  readonly maxAttempts: number;
  readonly result: unknown | null;
  readonly status: AgentTaskStatus;
  readonly updatedAt: Date;
}

export interface ClaimedAgentTask extends AgentTask {
  readonly merchantId: string;
}

export interface Conversation {
  readonly createdAt: Date;
  readonly id: string;
  readonly messages: readonly ConversationMessage[];
  readonly status: "active" | "archived";
  readonly updatedAt: Date;
}

export interface ConversationMessage {
  readonly content: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly role: "user" | "assistant";
}

export interface ProviderAttempt {
  readonly capability: AgentCapability;
  readonly completedAt: Date | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly providerId: string;
  readonly routePosition: number;
  readonly startedAt: Date;
  readonly status: "running" | "succeeded" | "failed";
  readonly taskAttempt: number;
}

export type SubmitAgentTaskInput =
  | {
      readonly capability: "text";
      readonly conversationId?: string;
      readonly prompt: string;
    }
  | {
      readonly capability: "image";
      readonly prompt: string;
    }
  | {
      readonly capability: "embedding";
      readonly texts: readonly string[];
    }
  | ({ readonly capability: "text" } & SkillTaskInput);

export interface SubmittedAgentTask {
  readonly conversationId: string | null;
  readonly id: string;
  readonly status: "queued";
}

export interface SubmitAssetSearchInput {
  readonly limit: number;
  readonly offeringId: string | null;
  readonly query: string;
  readonly scene: string | null;
}

export interface AgentTaskView extends AgentTask {
  readonly providerAttempts: readonly ProviderAttempt[];
}
import type { SkillTaskInput } from "@marketing-ai/content-skills";
