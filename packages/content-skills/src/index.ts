import { validateContent } from "@marketing-ai/compliance";

import { SkillProtocolError } from "./errors";
import {
  SKILL_PROTOCOL,
  SKILL_RESULT_PROTOCOL,
  type ConfiguredSkillPreset,
  type FinalizeSkillInput,
  type RawSkillItem,
  type RawSkillOutput,
  type SkillAssetSuggestion,
  type SkillKnowledgeSnapshot,
  type SkillPromptMessage,
  type SkillRunResult,
  type SkillTaskInput,
} from "./types";

export { SkillProtocolError } from "./errors";
export {
  buildMemberTouchPrompt,
  finalizeMemberTouchRun,
  MEMBER_TOUCH_PROTOCOL,
  MEMBER_TOUCH_RESULT_PROTOCOL,
  parseMemberTouchOutput,
  resolveMemberTouchScenarios,
} from "./member-touch";
export type * from "./types";

function taskInstruction(
  task: SkillTaskInput,
  preset: ConfiguredSkillPreset,
): Record<string, unknown> {
  if (task.action === "generate") {
    return {
      action: task.action,
      contentTypes: preset.contentTypes,
      intent: task.intent,
      selectedKnowledgeTypes: task.selectedKnowledgeTypes,
    };
  }
  return {
    action: task.action,
    contentTypes: preset.contentTypes.filter(
      (contentType) => contentType.id === task.contentType,
    ),
    instruction: task.instruction,
    sourceText: task.sourceText,
  };
}

/**
 * Builds a provider-neutral JSON contract. The snapshot intentionally contains
 * all structured entities; selectedKnowledgeTypes is a creative emphasis only.
 */
export function buildSkillPrompt(input: {
  readonly complianceLexicon?: readonly {
    readonly category: string;
    readonly replacement: string;
    readonly severity: "block" | "warn";
    readonly term: string;
  }[];
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly preset: ConfiguredSkillPreset;
  readonly task: SkillTaskInput;
}): readonly SkillPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "MARKETING_AI_SKILL_PROTOCOL_V1",
        input.preset.systemInstruction,
        "只输出 JSON，不要 Markdown。不得编造知识库中没有的价格、活动、疗效、资质或用户反馈。",
        `输出协议：{"protocolVersion":"${SKILL_PROTOCOL}","items":[{"contentType":"配置中的 id","text":"可直接发布的完整文案","assetQuery":{"sceneTags":["素材场景标签"],"offeringNames":["Offering 名称"],"effectImage":false,"reason":"选择理由"}}]}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        complianceLexicon: input.complianceLexicon ?? [],
        instruction: taskInstruction(input.task, input.preset),
        knowledge: input.knowledge,
      }),
    },
  ];
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SkillProtocolError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strings(value: unknown, path: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new SkillProtocolError(`${path} must be a string array`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function item(value: unknown, index: number): RawSkillItem {
  const input = record(value, `items[${index}]`);
  const assetQuery = record(input.assetQuery, `items[${index}].assetQuery`);
  if (
    typeof input.contentType !== "string" ||
    !input.contentType.trim() ||
    typeof input.text !== "string" ||
    !input.text.trim() ||
    typeof assetQuery.reason !== "string" ||
    typeof assetQuery.effectImage !== "boolean"
  ) {
    throw new SkillProtocolError(`items[${index}] is incomplete`);
  }
  return {
    assetQuery: {
      effectImage: assetQuery.effectImage,
      offeringNames: strings(
        assetQuery.offeringNames,
        `items[${index}].assetQuery.offeringNames`,
      ),
      reason: assetQuery.reason.trim(),
      sceneTags: strings(
        assetQuery.sceneTags,
        `items[${index}].assetQuery.sceneTags`,
      ),
    },
    contentType: input.contentType.trim(),
    text: input.text.trim(),
  };
}

export function parseSkillOutput(text: string): RawSkillOutput {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new SkillProtocolError("Provider output was not valid JSON", {
      cause: error,
    });
  }
  const output = record(parsed, "output");
  if (output.protocolVersion !== SKILL_PROTOCOL || !Array.isArray(output.items)) {
    throw new SkillProtocolError("Provider output protocol is unsupported");
  }
  return {
    items: output.items.map(item),
    protocolVersion: SKILL_PROTOCOL,
  };
}

function assetSuggestions(
  item: RawSkillItem,
  knowledge: SkillKnowledgeSnapshot,
): readonly SkillAssetSuggestion[] {
  const offeringIds = new Set(
    knowledge.offerings
      .filter((offering) =>
        item.assetQuery.offeringNames.some(
          (name) => name === offering.name || offering.name.includes(name),
        ),
      )
      .map((offering) => offering.id),
  );
  const scored = knowledge.assets
    .filter(
      (asset) => asset.isEffectImage === item.assetQuery.effectImage,
    )
    .map((asset) => {
      const searchable =
        `${asset.scene} ${asset.notes} ${asset.originalName}`.toLowerCase();
      const sceneScore = item.assetQuery.sceneTags.reduce(
        (score, tag) =>
          score + (searchable.includes(tag.toLowerCase()) ? 3 : 0),
        0,
      );
      const offeringScore =
        asset.offeringId && offeringIds.has(asset.offeringId) ? 5 : 0;
      return { asset, score: sceneScore + offeringScore };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.asset.originalName.localeCompare(right.asset.originalName),
    )
    .slice(0, 3);

  return scored.map(({ asset }) => ({
    assetId: asset.id,
    isEffectImage: asset.isEffectImage,
    label: asset.isEffectImage ? "效果类实拍" : "实拍",
    originalName: asset.originalName,
    reason: item.assetQuery.reason,
    scene: asset.scene,
  }));
}

export function finalizeSkillRun(input: FinalizeSkillInput): SkillRunResult {
  const task = input.task;
  const expectedTypes =
    task.action === "generate"
      ? input.preset.contentTypes
      : input.preset.contentTypes.filter(
          (contentType) => contentType.id === task.contentType,
        );
  if (
    input.raw.items.length !== expectedTypes.length ||
    new Set(input.raw.items.map((entry) => entry.contentType)).size !==
      expectedTypes.length
  ) {
    throw new SkillProtocolError(
      `Expected exactly ${expectedTypes.length} configured content items`,
    );
  }
  const rawByType = new Map(
    input.raw.items.map((entry) => [entry.contentType, entry]),
  );
  const merchantRules = (input.knowledge.brandProfile?.tabooExpressions ?? [])
    .filter(Boolean)
    .map((term) => ({
      category: "商家禁忌表达",
      replacement: "",
      severity: "block" as const,
      term,
    }));

  const items = expectedTypes.map((contentType) => {
    const raw = rawByType.get(contentType.id);
    if (!raw) {
      throw new SkillProtocolError(
        `Missing configured content type: ${contentType.id}`,
      );
    }
    const compliance = validateContent(raw.text, [
      ...input.complianceLexicon,
      ...merchantRules,
    ]);
    const suggestions = assetSuggestions(raw, input.knowledge);
    return {
      assetAdvice: suggestions.length
        ? raw.assetQuery.reason
        : `${raw.assetQuery.reason}；知识库暂无匹配素材，建议按标签补拍，不使用虚构图片。`,
      assetSuggestions: suggestions,
      compliance,
      contentType: contentType.id,
      label: contentType.label,
      publishReady: !compliance.blocked,
      text: raw.text,
    };
  });

  return {
    action: task.action,
    context: {
      assets: input.knowledge.assets.length,
      audiences: input.knowledge.audiences.length,
      brandProfile: input.knowledge.brandProfile ? 1 : 0,
      campaigns: input.knowledge.campaigns.length,
      memberSegments: input.knowledge.memberSegments.length,
      offerings: input.knowledge.offerings.length,
    },
    items,
    protocolVersion: SKILL_RESULT_PROTOCOL,
    skillId: task.skillId,
  };
}
