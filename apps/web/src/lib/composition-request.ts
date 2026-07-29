import { z } from "zod";

export const compositionRequestSchema = z
  .object({
    assetId: z.uuid(),
    body: z.string().trim().min(1).max(600),
    headline: z.string().trim().min(1).max(80),
    templateId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    usage: z.enum(["effect", "general"]),
  })
  .strict();

export type CompositionRequest = z.infer<typeof compositionRequestSchema>;

export function parseCompositionRequest(input: unknown): CompositionRequest {
  return compositionRequestSchema.parse(input);
}
