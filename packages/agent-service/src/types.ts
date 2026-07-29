export type ProviderCapability = "text" | "image" | "embedding";

export interface ConversationMessage {
  readonly content: string;
  readonly role: "system" | "user" | "assistant";
}

export interface TextRequest {
  readonly messages: readonly ConversationMessage[];
}

export interface TextResult {
  readonly text: string;
}

export interface ImageRequest {
  readonly prompt: string;
}

export interface ImageResult {
  readonly revisedPrompt?: string;
  readonly url: string;
}

export interface EmbeddingRequest {
  readonly texts: readonly string[];
}

export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];
}

export interface TextProvider {
  readonly capability: "text";
  readonly id: string;
  generate(request: TextRequest): Promise<TextResult>;
}

export interface ImageProvider {
  readonly capability: "image";
  readonly id: string;
  generate(request: ImageRequest): Promise<ImageResult>;
}

export interface EmbeddingProvider {
  readonly capability: "embedding";
  readonly id: string;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export type AgentProvider =
  | TextProvider
  | ImageProvider
  | EmbeddingProvider;

export type AgentRequest =
  | { readonly capability: "text"; readonly request: TextRequest }
  | { readonly capability: "image"; readonly request: ImageRequest }
  | { readonly capability: "embedding"; readonly request: EmbeddingRequest };

export type AgentResult =
  | { readonly capability: "text"; readonly output: TextResult }
  | { readonly capability: "image"; readonly output: ImageResult }
  | { readonly capability: "embedding"; readonly output: EmbeddingResult };

export interface ProviderAttemptStart {
  readonly capability: ProviderCapability;
  readonly providerId: string;
  readonly routePosition: number;
  readonly taskAttempt: number;
  readonly taskId: string;
}

export interface ProviderAttemptFinish {
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly status: "succeeded" | "failed";
}

export interface ProviderAttemptRecorder {
  finishProviderAttempt(
    attemptId: string,
    result: ProviderAttemptFinish,
  ): Promise<void>;
  startProviderAttempt(attempt: ProviderAttemptStart): Promise<string>;
}

export interface ProviderRoutes {
  readonly embedding: readonly EmbeddingProvider[];
  readonly image: readonly ImageProvider[];
  readonly text: readonly TextProvider[];
}
