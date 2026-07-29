import { validateContent } from "@marketing-ai/compliance";

import { SkillProtocolError } from "./errors";
import type {
  FinalizeMemberTouchInput,
  MemberTouchConfiguration,
  MemberTouchRunResult,
  RawMemberTouchCell,
  RawMemberTouchOutput,
  SkillKnowledgeSnapshot,
  SkillPromptMessage,
  SkillTaskInput,
} from "./types";

export const MEMBER_TOUCH_PROTOCOL =
  "marketing-ai.member-touch-output.v1" as const;
export const MEMBER_TOUCH_RESULT_PROTOCOL =
  "marketing-ai.member-touch-result.v1" as const;

const PLACEHOLDER = /\{\{([a-z][a-z0-9_]*)\}\}/g;
const LIKELY_PERSONAL_DATA = [
  /(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])/,
  /\b\d{17}[\dXx]\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SkillProtocolError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new SkillProtocolError(`${path} contains unsupported fields`);
  }
}

function nonEmptyText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SkillProtocolError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function parseCell(value: unknown, index: number): RawMemberTouchCell {
  const path = `cells[${index}]`;
  const input = object(value, path);
  exactKeys(input, ["alternatives", "scenario", "segmentKey"], path);
  if (
    !Array.isArray(input.alternatives) ||
    input.alternatives.some((alternative) => typeof alternative !== "string")
  ) {
    throw new SkillProtocolError(`${path}.alternatives must be a string array`);
  }
  return {
    alternatives: input.alternatives.map((alternative, alternativeIndex) =>
      nonEmptyText(alternative, `${path}.alternatives[${alternativeIndex}]`),
    ),
    scenario: nonEmptyText(input.scenario, `${path}.scenario`),
    segmentKey: nonEmptyText(input.segmentKey, `${path}.segmentKey`),
  };
}

export function parseMemberTouchOutput(text: string): RawMemberTouchOutput {
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
  const output = object(parsed, "output");
  exactKeys(output, ["cells", "protocolVersion"], "output");
  if (
    output.protocolVersion !== MEMBER_TOUCH_PROTOCOL ||
    !Array.isArray(output.cells)
  ) {
    throw new SkillProtocolError(
      "Member-touch provider output protocol is unsupported",
    );
  }
  return {
    cells: output.cells.map(parseCell),
    protocolVersion: MEMBER_TOUCH_PROTOCOL,
  };
}

function splitScenarios(value: string): readonly string[] {
  return value
    .split(/[,，、;；/\n]+/)
    .map((scenario) => scenario.trim())
    .filter(Boolean);
}

export function resolveMemberTouchScenarios(
  configuredScenarios: readonly string[],
  segments: SkillKnowledgeSnapshot["memberSegments"],
): readonly string[] {
  const scenarios = [
    ...configuredScenarios,
    ...segments.flatMap((segment) => splitScenarios(segment.triggerScenarios)),
  ]
    .map((scenario) => scenario.trim())
    .filter(Boolean);
  return [...new Set(scenarios)];
}

function segmentsForProtocol(knowledge: SkillKnowledgeSnapshot) {
  for (const segment of knowledge.memberSegments) {
    const serialized = [
      segment.communicationGoal,
      segment.definition,
      segment.name,
      segment.triggerScenarios,
    ].join("\n");
    if (LIKELY_PERSONAL_DATA.some((pattern) => pattern.test(serialized))) {
      throw new SkillProtocolError(
        "Member segment definitions must not contain personal data",
      );
    }
  }
  return knowledge.memberSegments.map((segment, index) => ({
    communicationGoal: segment.communicationGoal,
    definition: segment.definition,
    key: `segment-${index + 1}`,
    name: segment.name,
    triggerScenarios: segment.triggerScenarios,
  }));
}

export function buildMemberTouchPrompt(input: {
  readonly complianceLexicon?: readonly {
    readonly category: string;
    readonly replacement: string;
    readonly severity: "block" | "warn";
    readonly term: string;
  }[];
  readonly configuration: MemberTouchConfiguration;
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly scenarios: readonly string[];
  readonly systemInstruction: string;
  readonly task: SkillTaskInput;
}): readonly SkillPromptMessage[] {
  const segments = segmentsForProtocol(input.knowledge);
  const matrix = segments.flatMap((segment) =>
    input.scenarios.map((scenario) => ({
      scenario,
      segmentKey: segment.key,
    })),
  );
  return [
    {
      role: "system",
      content: [
        "MARKETING_AI_MEMBER_TOUCH_PROTOCOL_V1",
        input.systemInstruction,
        "你是会员生命周期触达话术助手，只能基于会员分层定义生成通用模板。",
        "严禁请求、接收、推断或输出任何会员个体姓名、手机号、邮箱、证件号、地址、生日或真实账户数据。",
        "每条话术必须使用至少一个配置允许的 {{placeholder_key}} 占位符；真实值只由商家发送前在平台外替换。",
        "不得编造知识库中没有的价格、活动、疗效、资质或用户反馈。",
        `每个矩阵格输出 ${input.configuration.minimumAlternatives}-${input.configuration.maximumAlternatives} 条不同话术。`,
        `只输出 JSON：{"protocolVersion":"${MEMBER_TOUCH_PROTOCOL}","cells":[{"segmentKey":"segment-1","scenario":"场景原文","alternatives":["含允许占位符的完整话术"]}]}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        brandProfile: input.knowledge.brandProfile,
        campaigns: input.knowledge.campaigns,
        complianceLexicon: input.complianceLexicon ?? [],
        matrix,
        merchantName: input.knowledge.merchantName,
        offerings: input.knowledge.offerings,
        placeholders: input.configuration.placeholders,
        scenarios: input.scenarios,
        segments,
        skillId: input.task.skillId,
      }),
    },
  ];
}

function placeholdersIn(
  text: string,
  configuration: MemberTouchConfiguration,
): readonly string[] {
  if (LIKELY_PERSONAL_DATA.some((pattern) => pattern.test(text))) {
    throw new SkillProtocolError(
      "Member-touch output appears to contain personal data",
    );
  }
  const keys = [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
  const withoutValidMarkers = text.replace(PLACEHOLDER, "");
  if (
    withoutValidMarkers.includes("{{") ||
    withoutValidMarkers.includes("}}")
  ) {
    throw new SkillProtocolError("Member-touch placeholder syntax is invalid");
  }
  if (keys.length === 0) {
    throw new SkillProtocolError(
      "Every member-touch alternative requires an allowed placeholder",
    );
  }
  const allowed = new Set(
    configuration.placeholders.map((placeholder) => placeholder.key),
  );
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new SkillProtocolError(`Placeholder ${key} is not allowed`);
    }
  }
  return [...new Set(keys)];
}

export function finalizeMemberTouchRun(
  input: FinalizeMemberTouchInput,
): MemberTouchRunResult {
  if (input.task.action !== "generate") {
    throw new SkillProtocolError(
      "Member-touch only supports zero-PII generation requests",
    );
  }
  const segments = segmentsForProtocol(input.knowledge);
  const expectedCount = segments.length * input.scenarios.length;
  if (input.raw.cells.length !== expectedCount) {
    throw new SkillProtocolError(
      `Expected exactly ${expectedCount} member-touch matrix cells`,
    );
  }
  const cells = new Map<string, RawMemberTouchCell>();
  for (const cell of input.raw.cells) {
    const key = `${cell.segmentKey}\u0000${cell.scenario}`;
    if (cells.has(key)) {
      throw new SkillProtocolError(
        `Duplicate member-touch matrix cell: ${cell.segmentKey}/${cell.scenario}`,
      );
    }
    cells.set(key, cell);
  }
  const merchantRules = (input.knowledge.brandProfile?.tabooExpressions ?? [])
    .filter(Boolean)
    .map((term) => ({
      category: "商家禁忌表达",
      replacement: "",
      severity: "block" as const,
      term,
    }));

  return {
    action: "generate",
    cells: segments.flatMap((segment) =>
      input.scenarios.map((scenario) => {
        const cell = cells.get(`${segment.key}\u0000${scenario}`);
        if (!cell) {
          throw new SkillProtocolError(
            `Missing member-touch matrix cell: ${segment.key}/${scenario}`,
          );
        }
        if (
          cell.alternatives.length < input.configuration.minimumAlternatives ||
          cell.alternatives.length > input.configuration.maximumAlternatives
        ) {
          throw new SkillProtocolError(
            `Each member-touch matrix cell requires ${input.configuration.minimumAlternatives}-${input.configuration.maximumAlternatives} alternatives`,
          );
        }
        return {
          alternatives: cell.alternatives.map((text) => {
            const placeholders = placeholdersIn(text, input.configuration);
            const compliance = validateContent(text, [
              ...input.complianceLexicon,
              ...merchantRules,
            ]);
            return {
              compliance,
              copyReady: !compliance.blocked,
              placeholders,
              text,
            };
          }),
          scenario,
          segment: {
            communicationGoal: segment.communicationGoal,
            definition: segment.definition,
            key: segment.key,
            name: segment.name,
            triggerScenarios: segment.triggerScenarios,
          },
        };
      }),
    ),
    context: {
      brandProfile: input.knowledge.brandProfile ? 1 : 0,
      campaigns: input.knowledge.campaigns.length,
      memberSegments: input.knowledge.memberSegments.length,
      offerings: input.knowledge.offerings.length,
    },
    placeholderDefinitions: input.configuration.placeholders,
    protocolVersion: MEMBER_TOUCH_RESULT_PROTOCOL,
    scenarios: [...input.scenarios],
    skillId: input.task.skillId,
  };
}
