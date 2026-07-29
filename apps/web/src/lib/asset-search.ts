import type { SubmitAssetSearchInput } from "@marketing-ai/database";
import { z } from "zod";

const requestSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(12),
    offering_id: z.uuid().nullable().optional(),
    query: z.string().trim().min(1).max(500),
    scene: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

export class InvalidAssetSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAssetSearchError";
  }
}

export function parseAssetSearchRequest(
  value: unknown,
): SubmitAssetSearchInput {
  const result = requestSchema.safeParse(value);
  if (!result.success) {
    throw new InvalidAssetSearchError("Invalid asset search request");
  }
  return {
    limit: result.data.limit,
    offeringId: result.data.offering_id ?? null,
    query: result.data.query,
    scene: result.data.scene ?? null,
  };
}
