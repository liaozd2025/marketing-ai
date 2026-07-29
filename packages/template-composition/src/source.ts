import { Buffer } from "node:buffer";

import {
  parseCompositionDocument,
} from "./schema";
import type {
  BrandFontStyle,
  CompositionDocument,
  CompositionUsage,
} from "./types";

export function verifiedRasterMime(
  declaredMime: string,
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  const buffer = Buffer.from(bytes);
  if (
    declaredMime === "image/png" &&
    buffer.byteLength >= 8 &&
    buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
  ) {
    return declaredMime;
  }
  if (
    declaredMime === "image/jpeg" &&
    buffer.byteLength >= 3 &&
    buffer.subarray(0, 3).toString("hex") === "ffd8ff"
  ) {
    return declaredMime;
  }
  if (
    declaredMime === "image/webp" &&
    buffer.byteLength >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return declaredMime;
  }
  return null;
}

export function buildCompositionDocumentFromSource(input: {
  readonly asset: {
    readonly alt: string;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
  };
  readonly brand: {
    readonly accentColor: string;
    readonly fontStyle: BrandFontStyle;
    readonly merchantName: string;
    readonly primaryColor: string;
  };
  readonly copy: {
    readonly body: string;
    readonly headline: string;
  };
  readonly templateId: string;
  readonly usage: CompositionUsage;
}): CompositionDocument {
  const mimeType = verifiedRasterMime(
    input.asset.mimeType,
    input.asset.bytes,
  );
  if (!mimeType) {
    throw new Error("raster-asset-required");
  }
  return parseCompositionDocument({
    asset: {
      alt: input.asset.alt,
      dataUrl: `data:${mimeType};base64,${Buffer.from(input.asset.bytes).toString("base64")}`,
    },
    brand: input.brand,
    copy: input.copy,
    templateId: input.templateId,
    usage: input.usage,
  });
}
