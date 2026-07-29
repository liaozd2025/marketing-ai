"use server";

import { tenantId } from "@marketing-ai/database";
import { getVerticalPack } from "@marketing-ai/vertical-packs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getAssetFile,
  parseAssetMetadata,
  parseAudience,
  parseBrandProfile,
  parseCampaign,
  parseMemberSegment,
  parseOffering,
  parseRecordId,
} from "@/lib/knowledge-base-input";
import {
  removeAssetFile,
  storeAssetFile,
  validateAssetFile,
} from "@/lib/asset-storage";
import { requireTenantContext } from "@/lib/tenant-context";

const entityTypeSchema = z.enum([
  "audience",
  "campaign",
  "memberSegment",
  "offering",
]);

function resultUrl(
  section: string,
  result: "deleted" | "invalid-input" | "not-found" | "saved",
): string {
  const parameter = result === "invalid-input" || result === "not-found"
    ? "error"
    : "status";
  return `/workspace/knowledge-base?section=${encodeURIComponent(section)}&${parameter}=${result}`;
}

function refreshAndRedirect(
  section: string,
  result: "deleted" | "invalid-input" | "not-found" | "saved",
): never {
  revalidatePath("/workspace");
  revalidatePath("/workspace/knowledge-base");
  redirect(resultUrl(section, result));
}

function parseOrRedirect<T>(section: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error &&
        ["asset-size", "asset-type"].includes(error.message))
    ) {
      refreshAndRedirect(section, "invalid-input");
    }
    throw error;
  }
}

export async function saveBrandProfileAction(
  formData: FormData,
): Promise<void> {
  const input = parseOrRedirect("brandProfile", () =>
    parseBrandProfile(formData),
  );
  const { tenant } = await requireTenantContext();
  await tenant.knowledgeBase.saveBrandProfile(input);
  refreshAndRedirect("brandProfile", "saved");
}

export async function deleteBrandProfileAction(): Promise<void> {
  const { tenant } = await requireTenantContext();
  await tenant.knowledgeBase.deleteBrandProfile();
  refreshAndRedirect("brandProfile", "deleted");
}

export async function saveOfferingAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const { merchant, tenant } = await requireTenantContext();
  const pack = getVerticalPack(merchant.verticalPackId);
  const input = parseOrRedirect("offering", () =>
    parseOffering(formData, pack),
  );

  if (id) {
    const recordId = parseOrRedirect("offering", () => parseRecordId(id));
    const offering = await tenant.knowledgeBase.updateOffering(
      recordId,
      input,
    );
    if (!offering) {
      refreshAndRedirect("offering", "not-found");
    }
  } else {
    await tenant.knowledgeBase.createOffering(input);
  }
  refreshAndRedirect("offering", "saved");
}

export async function saveAudienceAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const input = parseOrRedirect("audience", () => parseAudience(formData));
  const { tenant } = await requireTenantContext();

  if (id) {
    const record = await tenant.knowledgeBase.updateAudience(
      parseOrRedirect("audience", () => parseRecordId(id)),
      input,
    );
    if (!record) {
      refreshAndRedirect("audience", "not-found");
    }
  } else {
    await tenant.knowledgeBase.createAudience(input);
  }
  refreshAndRedirect("audience", "saved");
}

export async function saveCampaignAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const input = parseOrRedirect("campaign", () => parseCampaign(formData));
  const { tenant } = await requireTenantContext();

  if (id) {
    const record = await tenant.knowledgeBase.updateCampaign(
      parseOrRedirect("campaign", () => parseRecordId(id)),
      input,
    );
    if (!record) {
      refreshAndRedirect("campaign", "not-found");
    }
  } else {
    await tenant.knowledgeBase.createCampaign(input);
  }
  refreshAndRedirect("campaign", "saved");
}

export async function saveMemberSegmentAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const input = parseOrRedirect("memberSegment", () =>
    parseMemberSegment(formData),
  );
  const { tenant } = await requireTenantContext();

  if (id) {
    const record = await tenant.knowledgeBase.updateMemberSegment(
      parseOrRedirect("memberSegment", () => parseRecordId(id)),
      input,
    );
    if (!record) {
      refreshAndRedirect("memberSegment", "not-found");
    }
  } else {
    await tenant.knowledgeBase.createMemberSegment(input);
  }
  refreshAndRedirect("memberSegment", "saved");
}

export async function createAssetAction(formData: FormData): Promise<void> {
  const metadata = parseOrRedirect("asset", () =>
    parseAssetMetadata(formData),
  );
  const file = parseOrRedirect("asset", () => getAssetFile(formData));
  parseOrRedirect("asset", () => validateAssetFile(file));
  const { session, tenant } = await requireTenantContext();

  if (
    metadata.offeringId &&
    !(await tenant.knowledgeBase.getOffering(metadata.offeringId))
  ) {
    refreshAndRedirect("asset", "not-found");
  }

  const storageKey = await storeAssetFile(
    tenantId(session.merchantId),
    file,
  );
  try {
    await tenant.knowledgeBase.createAsset({
      ...metadata,
      byteSize: file.size,
      mimeType: file.type,
      originalName: file.name.replaceAll(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 200) ||
        "asset",
      storageKey,
    });
  } catch (error) {
    await removeAssetFile(storageKey);
    throw error;
  }
  refreshAndRedirect("asset", "saved");
}

export async function updateAssetAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const metadata = parseOrRedirect("asset", () =>
    parseAssetMetadata(formData),
  );
  const recordId = parseOrRedirect("asset", () => parseRecordId(id));
  const { tenant } = await requireTenantContext();

  if (
    metadata.offeringId &&
    !(await tenant.knowledgeBase.getOffering(metadata.offeringId))
  ) {
    refreshAndRedirect("asset", "not-found");
  }
  const record = await tenant.knowledgeBase.updateAssetMetadata(
    recordId,
    metadata,
  );
  if (!record) {
    refreshAndRedirect("asset", "not-found");
  }
  refreshAndRedirect("asset", "saved");
}

export async function deleteAssetAction(id: string): Promise<void> {
  const recordId = parseOrRedirect("asset", () => parseRecordId(id));
  const { tenant } = await requireTenantContext();
  const deleted = await tenant.knowledgeBase.deleteAsset(recordId);
  if (!deleted) {
    refreshAndRedirect("asset", "not-found");
  }
  await removeAssetFile(deleted.storageKey);
  refreshAndRedirect("asset", "deleted");
}

export async function deleteEntityAction(
  type: string,
  id: string,
): Promise<void> {
  const entityType = parseOrRedirect(type, () => entityTypeSchema.parse(type));
  const recordId = parseOrRedirect(type, () => parseRecordId(id));
  const { tenant } = await requireTenantContext();

  const deleted =
    entityType === "offering"
      ? await tenant.knowledgeBase.deleteOffering(recordId)
      : entityType === "audience"
        ? await tenant.knowledgeBase.deleteAudience(recordId)
        : entityType === "campaign"
          ? await tenant.knowledgeBase.deleteCampaign(recordId)
          : await tenant.knowledgeBase.deleteMemberSegment(recordId);

  refreshAndRedirect(entityType, deleted ? "deleted" : "not-found");
}
