import type { SubmitAgentTaskInput } from "@marketing-ai/database";

export class InvalidAgentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAgentRequestError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidAgentRequestError("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function prompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 20_000) {
    throw new InvalidAgentRequestError(
      "prompt must be between 1 and 20000 characters",
    );
  }
  return value.trim();
}

export function parseAgentTaskRequest(
  value: unknown,
): SubmitAgentTaskInput {
  const input = record(value);
  if ("merchant_id" in input || "merchantId" in input || "tenant_id" in input) {
    throw new InvalidAgentRequestError(
      "Tenant identity must come from the signed session",
    );
  }

  switch (input.capability) {
    case "text":
      if (
        input.conversation_id !== undefined &&
        typeof input.conversation_id !== "string"
      ) {
        throw new InvalidAgentRequestError(
          "conversation_id must be a string",
        );
      }
      return {
        capability: "text",
        ...(input.conversation_id
          ? { conversationId: input.conversation_id }
          : {}),
        prompt: prompt(input.prompt),
      };
    case "image":
      return { capability: "image", prompt: prompt(input.prompt) };
    case "embedding":
      if (
        !Array.isArray(input.texts) ||
        input.texts.length === 0 ||
        input.texts.length > 100 ||
        input.texts.some(
          (text) =>
            typeof text !== "string" ||
            !text.trim() ||
            text.length > 20_000,
        )
      ) {
        throw new InvalidAgentRequestError(
          "texts must contain 1 to 100 non-empty strings",
        );
      }
      return {
        capability: "embedding",
        texts: input.texts.map((text) => (text as string).trim()),
      };
    default:
      throw new InvalidAgentRequestError(
        "capability must be text, image, or embedding",
      );
  }
}
