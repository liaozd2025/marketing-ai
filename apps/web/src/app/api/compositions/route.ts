import {
  tenantId,
  type CompositionRecord,
} from "@marketing-ai/database";
import { ChromiumRenderer } from "@marketing-ai/html-renderer";
import { builtinTemplateRegistry } from "@marketing-ai/template-composition";
import { z } from "zod";

import { readAssetFile } from "@/lib/asset-storage";
import {
  parseCompositionRequest,
  type CompositionRequest,
} from "@/lib/composition-request";
import { buildCompositionDocument } from "@/lib/composition-source";
import {
  removeCompositionFile,
  storeCompositionFile,
} from "@/lib/composition-storage";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 16 * 1024;

function errorResponse(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function publicComposition(composition: CompositionRecord) {
  return {
    assetId: composition.assetId,
    body: composition.body,
    byteSize: composition.byteSize,
    createdAt: composition.createdAt.toISOString(),
    headline: composition.headline,
    height: composition.height,
    id: composition.id,
    imageUrl: `/api/compositions/${composition.id}/image`,
    templateId: composition.templateId,
    usage: composition.usage,
    width: composition.width,
  };
}

async function requestBody(request: Request): Promise<CompositionRequest> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) {
    throw new Error("request-too-large");
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("request-too-large");
  }
  return parseCompositionRequest(JSON.parse(body));
}

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return errorResponse("unauthorized", 401);
  }
  const compositions = await context.tenant.compositions.list();
  return Response.json({
    compositions: compositions.map(publicComposition),
  });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) {
    return errorResponse("unauthorized", 401);
  }

  let input: CompositionRequest;
  try {
    input = await requestBody(request);
    builtinTemplateRegistry.resolve(input.templateId);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return errorResponse("invalid-input", 400);
    }
    if (
      error instanceof Error &&
      error.message === "request-too-large"
    ) {
      return errorResponse("request-too-large", 413);
    }
    if (
      error instanceof Error &&
      error.message.startsWith("Unknown composition template")
    ) {
      return errorResponse("unknown-template", 400);
    }
    throw error;
  }

  const [asset, brandProfile] = await Promise.all([
    context.tenant.knowledgeBase.getAsset(input.assetId),
    context.tenant.knowledgeBase.getBrandProfile(),
  ]);
  if (!asset) {
    return errorResponse("asset-not-found", 404);
  }
  if (!brandProfile) {
    return errorResponse("brand-profile-required", 409);
  }

  let document;
  try {
    const bytes = await readAssetFile(asset.storageKey);
    document = buildCompositionDocument({
      asset,
      brandProfile,
      bytes,
      merchantName: context.merchant.name,
      request: input,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["effect-asset-required", "raster-asset-required"].includes(
        error.message,
      )
    ) {
      return errorResponse(error.message, 422);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return errorResponse("asset-file-not-found", 404);
    }
    throw error;
  }

  const renderer = new ChromiumRenderer();
  let png: Buffer;
  try {
    png = await renderer.compose(document);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Template overflowed")
    ) {
      return errorResponse("copy-overflow", 422);
    }
    throw error;
  } finally {
    await renderer.close();
  }

  const template = builtinTemplateRegistry.resolve(input.templateId);
  const storageKey = await storeCompositionFile(
    tenantId(context.session.merchantId),
    png,
  );
  try {
    const composition = await context.tenant.compositions.create({
      assetId: asset.id,
      body: input.body,
      byteSize: png.byteLength,
      createdByMemberId: context.member.id,
      headline: input.headline,
      height: template.height,
      storageKey,
      templateId: input.templateId,
      usage: input.usage,
      width: template.width,
    });
    return Response.json(
      {
        composition: publicComposition(composition),
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201,
      },
    );
  } catch (error) {
    await removeCompositionFile(storageKey);
    throw error;
  }
}
