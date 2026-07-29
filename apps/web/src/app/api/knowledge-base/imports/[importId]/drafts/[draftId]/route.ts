import {
  removeAssetFile,
  storeAssetFile,
  validateAssetFile,
} from "@marketing-ai/asset-storage";
import { database, tenantId } from "@marketing-ai/database";
import { getVerticalPack } from "@marketing-ai/vertical-packs";
import { NextResponse } from "next/server";

import {
  InvalidKnowledgeDraftError,
  parseKnowledgeDraftRequest,
} from "@/lib/knowledge-draft-input";
import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ draftId: string; importId: string }>;
}

function draftResponse(draft: {
  readonly confirmedEntityId: string | null;
  readonly entityType: string;
  readonly id: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: string;
}) {
  return {
    confirmed_entity_id: draft.confirmedEntityId,
    entity_type: draft.entityType,
    id: draft.id,
    payload: draft.payload,
    status: draft.status,
  };
}

function assetOriginalName(file: File): string {
  return (
    file.name.replaceAll(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 200) ||
    "asset"
  );
}

async function readDraftRequest(request: Request, isAsset: boolean) {
  if (
    isAsset &&
    request.headers.get("content-type")?.startsWith("multipart/form-data")
  ) {
    const form = await request.formData();
    const action = form.get("action");
    if (action === "reject") {
      return { body: { action }, file: null };
    }
    const payload = form.get("payload");
    if (action !== "confirm" || typeof payload !== "string") {
      throw new InvalidKnowledgeDraftError("素材草稿请求格式不正确");
    }
    const file = form.get("file");
    return {
      body: { action, payload: JSON.parse(payload) as unknown },
      file: file instanceof File && file.size > 0 ? file : null,
    };
  }
  return { body: await request.json(), file: null };
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { draftId, importId } = await context.params;
  const tenant = database.forTenant(tenantId(session.merchantId));
  const draft = await tenant.coldStart.getDraft(importId, draftId);
  if (!draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }
  try {
    const merchant = await tenant.getMerchant();
    if (!merchant) {
      return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
    }
    const parsedRequest = await readDraftRequest(
      request,
      draft.entityType === "asset",
    );
    const input = parseKnowledgeDraftRequest(
      parsedRequest.body,
      draft.entityType,
      getVerticalPack(merchant.verticalPackId),
    );
    let updated;
    if (input.action === "reject") {
      updated = await tenant.coldStart.rejectDraft(draftId);
    } else if ("assetMetadata" in input) {
      const file = parsedRequest.file;
      if (!file) {
        throw new InvalidKnowledgeDraftError(
          "确认素材草稿时必须上传真实图片或视频文件",
        );
      }
      try {
        validateAssetFile(file);
      } catch {
        throw new InvalidKnowledgeDraftError(
          "素材文件必须是 20 MB 以内的图片或视频",
        );
      }
      const originalName = assetOriginalName(file);
      const storageKey = await storeAssetFile(session.merchantId, file);
      try {
        updated = await tenant.coldStart.confirmDraft(
          draftId,
          {
            draftPayload: {
              ...input.assetMetadata,
              originalName,
            },
            entityType: "asset",
            input: {
              byteSize: file.size,
              isEffectImage: input.assetMetadata.isEffectImage,
              mimeType: file.type,
              notes: input.assetMetadata.notes,
              offeringId: null,
              originalName,
              scene: input.assetMetadata.scene,
              storageKey,
            },
          },
          session.memberId,
        );
      } catch (error) {
        await removeAssetFile(storageKey).catch(() => undefined);
        throw error;
      }
    } else {
      updated = await tenant.coldStart.confirmDraft(
        draftId,
        input.confirmation,
      );
    }
    return NextResponse.json(draftResponse(updated));
  } catch (error) {
    if (
      error instanceof InvalidKnowledgeDraftError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      (error.message === "Draft was not found" ||
        error.message === "Draft is not pending")
    ) {
      return NextResponse.json(
        {
          error:
            error.message === "Draft was not found"
              ? "draft_not_found"
              : "draft_already_resolved",
        },
        { status: error.message === "Draft was not found" ? 404 : 409 },
      );
    }
    throw error;
  }
}
