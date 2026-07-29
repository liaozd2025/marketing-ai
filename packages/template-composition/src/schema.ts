import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9A-F]{6}$/i);
const rasterDataUrl = z
  .string()
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

export const compositionDocumentSchema = z
  .object({
    asset: z
      .object({
        alt: z.string().trim().min(1).max(200),
        dataUrl: rasterDataUrl.max(30_000_000),
      })
      .strict(),
    brand: z
      .object({
        accentColor: hexColor,
        fontStyle: z.enum(["editorial", "modern", "warm"]),
        merchantName: z.string().trim().min(1).max(120),
        primaryColor: hexColor,
      })
      .strict(),
    copy: z
      .object({
        body: z.string().trim().min(1).max(600),
        headline: z.string().trim().min(1).max(80),
      })
      .strict(),
    templateId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    usage: z.enum(["effect", "general"]),
  })
  .strict();

export function parseCompositionDocument(input: unknown) {
  return compositionDocumentSchema.parse(input);
}
