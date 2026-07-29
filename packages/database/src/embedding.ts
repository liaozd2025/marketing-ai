import { EMBEDDING_DIMENSIONS } from "@marketing-ai/agent-service";

export function embeddingVector(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSIONS ||
    value.some(
      (coordinate) =>
        typeof coordinate !== "number" || !Number.isFinite(coordinate),
    )
  ) {
    throw new Error(
      `Embedding must contain ${EMBEDDING_DIMENSIONS} finite coordinates`,
    );
  }
  return value;
}

export function embeddingVectorLiteral(value: unknown): string {
  return `[${embeddingVector(value).join(",")}]`;
}
