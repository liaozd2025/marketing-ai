import {
  validateOfferingFields,
  type VerticalPack,
} from "@marketing-ai/vertical-packs";
import { z } from "zod";

const recordIdSchema = z.uuid();
const requiredText = z.string().trim().min(1).max(2_000);
const optionalText = z.string().trim().max(5_000);
const brandColor = z.string().regex(/^#[0-9A-F]{6}$/i);

const brandProfileSchema = z.object({
  accentColor: brandColor,
  fontStyle: z.enum(["modern", "warm", "editorial"]),
  persona: requiredText,
  primaryColor: brandColor,
  story: requiredText,
  tabooExpressions: z.array(z.string().trim().min(1).max(100)).max(100),
  tone: requiredText,
});

const audienceSchema = z.object({
  addressStyle: requiredText,
  motivations: requiredText,
  name: requiredText.max(120),
  painPoints: requiredText,
});

const campaignSchema = z
  .object({
    endsAt: z.date().nullable(),
    name: requiredText.max(120),
    offerDetails: requiredText,
    rules: requiredText,
    startsAt: z.date().nullable(),
  })
  .refine(
    ({ endsAt, startsAt }) =>
      !endsAt || !startsAt || endsAt.getTime() >= startsAt.getTime(),
    { message: "活动结束时间不能早于开始时间" },
  );

// ADR-0003: only a segment definition and its communication context are
// accepted. There is deliberately no catch-all object or PII-bearing field.
const memberSegmentSchema = z
  .object({
    communicationGoal: requiredText,
    definition: requiredText,
    name: requiredText.max(120),
    triggerScenarios: requiredText,
  })
  .strict();

const assetMetadataSchema = z.object({
  isEffectImage: z.boolean(),
  notes: optionalText,
  offeringId: z.uuid().nullable(),
  scene: requiredText.max(120),
});

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(Number.NaN) : parsed;
}

export function parseRecordId(value: string): string {
  return recordIdSchema.parse(value);
}

export function parseBrandProfile(formData: FormData) {
  return brandProfileSchema.parse({
    accentColor: formText(formData, "accentColor"),
    fontStyle: formText(formData, "fontStyle"),
    persona: formText(formData, "persona"),
    primaryColor: formText(formData, "primaryColor"),
    story: formText(formData, "story"),
    tabooExpressions: formText(formData, "tabooExpressions")
      .split(/[,\n，]/)
      .map((item) => item.trim())
      .filter(Boolean),
    tone: formText(formData, "tone"),
  });
}

export function parseOffering(
  formData: FormData,
  pack: VerticalPack,
) {
  const rawFields = Object.fromEntries(
    pack.offeringFields.map((field) => [
      field.key,
      formText(formData, `field.${field.key}`),
    ]),
  );
  const result = validateOfferingFields(pack, rawFields);
  if (Object.keys(result.errors).length > 0) {
    throw new z.ZodError(
      Object.entries(result.errors).map(([path, message]) => ({
        code: "custom",
        message,
        path: ["fieldValues", path],
      })),
    );
  }

  return {
    description: optionalText.parse(formText(formData, "description")),
    fieldValues: result.values,
    name: requiredText.max(120).parse(formText(formData, "name")),
  };
}

export function parseAudience(formData: FormData) {
  return audienceSchema.parse({
    addressStyle: formText(formData, "addressStyle"),
    motivations: formText(formData, "motivations"),
    name: formText(formData, "name"),
    painPoints: formText(formData, "painPoints"),
  });
}

export function parseCampaign(formData: FormData) {
  return campaignSchema.parse({
    endsAt: nullableDate(formText(formData, "endsAt")),
    name: formText(formData, "name"),
    offerDetails: formText(formData, "offerDetails"),
    rules: formText(formData, "rules"),
    startsAt: nullableDate(formText(formData, "startsAt")),
  });
}

export function parseMemberSegment(formData: FormData) {
  const allowedFields = new Set([
    "communicationGoal",
    "definition",
    "name",
    "triggerScenarios",
  ]);
  const piiField = [...formData.keys()].find(
    (key) =>
      !allowedFields.has(key) &&
      !key.startsWith("$ACTION_") &&
      /(?:name|phone|mobile|email|address|birthday|birth|id.?card|member.?id|wechat|姓名|手机|邮箱|地址|生日|身份证|微信)/i.test(
        key,
      ),
  );
  if (piiField) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "会员分层不得包含个人信息字段",
        path: [piiField],
      },
    ]);
  }
  const input = {
    communicationGoal: formText(formData, "communicationGoal"),
    definition: formText(formData, "definition"),
    name: formText(formData, "name"),
    triggerScenarios: formText(formData, "triggerScenarios"),
  };
  const serialized = Object.values(input).join("\n");
  if (
    /(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])/.test(serialized) ||
    /\b\d{17}[\dXx]\b/.test(serialized) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized)
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        message: "会员分层定义不得包含个人信息",
        path: ["memberSegment"],
      },
    ]);
  }
  return memberSegmentSchema.parse(input);
}

export function parseAssetMetadata(formData: FormData) {
  const offeringId = formText(formData, "offeringId");
  return assetMetadataSchema.parse({
    isEffectImage: formData.get("isEffectImage") === "on",
    notes: formText(formData, "notes"),
    offeringId: offeringId || null,
    scene: formText(formData, "scene"),
  });
}

export function getAssetFile(formData: FormData): File {
  const value = formData.get("file");
  if (!(value instanceof File)) {
    throw new z.ZodError([
      { code: "custom", message: "请选择素材文件", path: ["file"] },
    ]);
  }
  return value;
}
