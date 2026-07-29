import {
  containsPersonalInformation,
  type ConfirmKnowledgeDraftInput,
  type KnowledgeDraftEntityType,
} from "@marketing-ai/database";
import {
  validateOfferingFields,
  type VerticalPack,
} from "@marketing-ai/vertical-packs";
import { z } from "zod";

const requiredText = z.string().trim().min(1).max(2_000);
const optionalText = z.string().trim().max(5_000);
const brandColor = z.string().regex(/^#[0-9A-F]{6}$/i);
const outerRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject") }).strict(),
  z
    .object({
      action: z.literal("confirm"),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);

const brandProfile = z
  .object({
    accentColor: brandColor.optional(),
    fontStyle: z.enum(["modern", "warm", "editorial"]).optional(),
    persona: requiredText,
    primaryColor: brandColor.optional(),
    story: requiredText,
    tabooExpressions: z
      .array(z.string().trim().min(1).max(100))
      .max(100),
    tone: requiredText,
  })
  .strict();
const audience = z
  .object({
    addressStyle: requiredText,
    motivations: requiredText,
    name: requiredText.max(120),
    painPoints: requiredText,
  })
  .strict();
const campaign = z
  .object({
    endsAt: z.iso.datetime().nullable(),
    name: requiredText.max(120),
    offerDetails: requiredText,
    rules: requiredText,
    startsAt: z.iso.datetime().nullable(),
  })
  .strict()
  .refine(
    ({ endsAt, startsAt }) =>
      !endsAt || !startsAt || Date.parse(endsAt) >= Date.parse(startsAt),
    { message: "活动结束时间不能早于开始时间" },
  );
const memberSegment = z
  .object({
    communicationGoal: requiredText,
    definition: requiredText,
    name: requiredText.max(120),
    triggerScenarios: requiredText,
  })
  .strict();
const offering = z
  .object({
    description: optionalText,
    fieldValues: z.record(z.string(), z.unknown()),
    name: requiredText.max(120),
  })
  .strict();
const assetMetadata = z
  .object({
    isEffectImage: z.boolean(),
    notes: optionalText,
    originalName: optionalText.max(200),
    scene: optionalText.max(120),
  })
  .strict();

export type AssetDraftMetadata = z.infer<typeof assetMetadata>;

export class InvalidKnowledgeDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKnowledgeDraftError";
  }
}

function parseMemberSegment(payload: unknown) {
  const parsed = memberSegment.parse(payload);
  const serialized = Object.values(parsed).join("\n");
  if (containsPersonalInformation(serialized)) {
    throw new InvalidKnowledgeDraftError(
      "会员分层定义不得包含个人信息",
    );
  }
  return parsed;
}

export function parseKnowledgeDraftRequest(
  value: unknown,
  entityType: KnowledgeDraftEntityType,
  pack: VerticalPack,
):
  | { readonly action: "reject" }
  | {
      readonly action: "confirm";
      readonly assetMetadata: AssetDraftMetadata;
    }
  | {
      readonly action: "confirm";
      readonly confirmation: ConfirmKnowledgeDraftInput;
    } {
  try {
    const request = outerRequest.parse(value);
    if (request.action === "reject") {
      return request;
    }
    if (entityType === "asset") {
      return {
        action: "confirm",
        assetMetadata: assetMetadata.parse(request.payload),
      };
    }
    if (entityType === "brandProfile") {
      const input = brandProfile.parse(request.payload);
      return {
        action: "confirm",
        confirmation: {
          entityType,
          input: {
            ...input,
            accentColor: input.accentColor ?? "#F4C7AB",
            fontStyle: input.fontStyle ?? "modern",
            primaryColor: input.primaryColor ?? "#7655FF",
          },
        },
      };
    }
    if (entityType === "offering") {
      const input = offering.parse(request.payload);
      const fields = validateOfferingFields(pack, input.fieldValues);
      const fieldError = Object.values(fields.errors)[0];
      if (fieldError) {
        throw new InvalidKnowledgeDraftError(fieldError);
      }
      return {
        action: "confirm",
        confirmation: {
          entityType,
          input: { ...input, fieldValues: fields.values },
        },
      };
    }
    if (entityType === "audience") {
      return {
        action: "confirm",
        confirmation: { entityType, input: audience.parse(request.payload) },
      };
    }
    if (entityType === "campaign") {
      const input = campaign.parse(request.payload);
      return {
        action: "confirm",
        confirmation: {
          entityType,
          input: {
            ...input,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
          },
        },
      };
    }
    return {
      action: "confirm",
      confirmation: {
        entityType,
        input: parseMemberSegment(request.payload),
      },
    };
  } catch (error) {
    if (error instanceof InvalidKnowledgeDraftError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new InvalidKnowledgeDraftError("草稿字段格式不正确");
    }
    throw error;
  }
}
