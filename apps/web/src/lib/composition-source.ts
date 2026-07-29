import type { Asset, BrandProfile } from "@marketing-ai/database";
import {
  parseCompositionDocument,
  type CompositionDocument,
} from "@marketing-ai/template-composition";

import type { CompositionRequest } from "./composition-request";

function verifiedRasterMime(
  declaredMime: string,
  bytes: Buffer,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    declaredMime === "image/png" &&
    bytes.byteLength >= 8 &&
    bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
  ) {
    return declaredMime;
  }
  if (
    declaredMime === "image/jpeg" &&
    bytes.byteLength >= 3 &&
    bytes.subarray(0, 3).toString("hex") === "ffd8ff"
  ) {
    return declaredMime;
  }
  if (
    declaredMime === "image/webp" &&
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return declaredMime;
  }
  return null;
}

export function buildCompositionDocument({
  asset,
  brandProfile,
  bytes,
  merchantName,
  request,
}: {
  readonly asset: Asset;
  readonly brandProfile: BrandProfile;
  readonly bytes: Buffer;
  readonly merchantName: string;
  readonly request: CompositionRequest;
}): CompositionDocument {
  if (request.usage === "effect" && (!asset.isReal || !asset.isEffectImage)) {
    throw new Error("effect-asset-required");
  }
  const mimeType = verifiedRasterMime(asset.mimeType, bytes);
  if (!mimeType) {
    throw new Error("raster-asset-required");
  }

  return parseCompositionDocument({
    asset: {
      alt: `${asset.scene} · ${asset.originalName}`,
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    },
    brand: {
      accentColor: brandProfile.accentColor,
      fontStyle: brandProfile.fontStyle,
      merchantName,
      primaryColor: brandProfile.primaryColor,
    },
    copy: {
      body: request.body,
      headline: request.headline,
    },
    templateId: request.templateId,
    usage: request.usage,
  });
}
