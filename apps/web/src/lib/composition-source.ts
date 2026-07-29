import type { Asset, BrandProfile } from "@marketing-ai/database";
import {
  type CompositionDocument,
} from "@marketing-ai/template-composition";
import { buildCompositionDocumentFromSource } from "@marketing-ai/template-composition/source";

import type { CompositionRequest } from "./composition-request";

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
  return buildCompositionDocumentFromSource({
    asset: {
      alt: `${asset.scene} · ${asset.originalName}`,
      bytes,
      mimeType: asset.mimeType,
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
