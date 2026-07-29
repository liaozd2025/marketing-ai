import beautyV1 from "../config/beauty-v1.json";

import type {
  OfferingFieldDefinition,
  SkillPreset,
  VerticalPack,
} from "./types";

export type {
  ComplianceLexiconEntry,
  OfferingFieldDefinition,
  OfferingFieldOption,
  OfferingFieldType,
  ScenarioVocabulary,
  SkillPreset,
  VerticalPack,
} from "./types";

const packs: readonly VerticalPack[] = [beautyV1 as VerticalPack];
const packById = new Map(packs.map((pack) => [pack.id, pack]));

function assertPack(pack: VerticalPack): void {
  if (!pack.id || !pack.label || pack.version < 1) {
    throw new Error("Vertical pack must have an id, label, and version");
  }

  const keys = new Set<string>();
  for (const field of pack.offeringFields) {
    if (!field.key || !field.label || keys.has(field.key)) {
      throw new Error(`Invalid Offering field in vertical pack ${pack.id}`);
    }
    keys.add(field.key);
  }

  const skillIds = new Set<string>();
  for (const preset of pack.skillPresets) {
    if (
      !preset.id ||
      !preset.systemInstruction ||
      preset.contentTypes.length === 0 ||
      skillIds.has(preset.id)
    ) {
      throw new Error(`Invalid Skill preset in vertical pack ${pack.id}`);
    }
    skillIds.add(preset.id);
    const contentTypeIds = preset.contentTypes.map(({ id }) => id);
    if (new Set(contentTypeIds).size !== contentTypeIds.length) {
      throw new Error(`Duplicate content type in Skill preset ${preset.id}`);
    }
  }
}

for (const pack of packs) {
  assertPack(pack);
}

export function getVerticalPack(id: string): VerticalPack {
  const pack = packById.get(id);
  if (!pack) {
    throw new Error(`Unknown vertical pack: ${id}`);
  }

  return pack;
}

export function listVerticalPacks(): readonly VerticalPack[] {
  return packs;
}

export function getSkillPreset(
  pack: VerticalPack,
  skillId: string,
): SkillPreset {
  const preset = pack.skillPresets.find((candidate) => candidate.id === skillId);
  if (!preset) {
    throw new Error(`Unknown Skill preset ${skillId} in ${pack.id}`);
  }
  return preset;
}

export interface OfferingFieldValidationResult {
  readonly errors: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string | number>>;
}

function validateOfferingField(
  field: OfferingFieldDefinition,
  rawValue: unknown,
): { error?: string; value?: number | string } {
  const value =
    typeof rawValue === "string" ? rawValue.trim() : rawValue;

  if (value === "" || value === null || value === undefined) {
    return field.required ? { error: `${field.label}为必填项` } : {};
  }

  if (field.type === "number") {
    const numericValue =
      typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return { error: `${field.label}必须是数字` };
    }
    if (field.min !== undefined && numericValue < field.min) {
      return { error: `${field.label}不能小于 ${field.min}` };
    }
    if (field.max !== undefined && numericValue > field.max) {
      return { error: `${field.label}不能大于 ${field.max}` };
    }
    return { value: numericValue };
  }

  if (typeof value !== "string") {
    return { error: `${field.label}格式不正确` };
  }

  if (
    field.type === "select" &&
    !field.options?.some((option) => option.value === value)
  ) {
    return { error: `${field.label}选项无效` };
  }

  return { value };
}

export function validateOfferingFields(
  pack: VerticalPack,
  input: Readonly<Record<string, unknown>>,
): OfferingFieldValidationResult {
  const errors: Record<string, string> = {};
  const values: Record<string, string | number> = {};

  for (const field of pack.offeringFields) {
    const result = validateOfferingField(field, input[field.key]);
    if (result.error) {
      errors[field.key] = result.error;
    } else if (result.value !== undefined) {
      values[field.key] = result.value;
    }
  }

  return { errors, values };
}

export function offeringCompleteness(
  pack: VerticalPack,
  input: Readonly<Record<string, unknown>>,
): number {
  const requiredFields = pack.offeringFields.filter(
    (field) => field.required,
  );
  if (requiredFields.length === 0) {
    return 100;
  }

  const completed = requiredFields.filter((field) => {
    const value = input[field.key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).length;

  return Math.round((completed / requiredFields.length) * 100);
}
