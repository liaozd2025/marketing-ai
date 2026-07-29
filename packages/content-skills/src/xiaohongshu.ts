import {
  validateContent,
  type ComplianceReport,
  type ComplianceRule,
} from "@marketing-ai/compliance";

import type {
  SkillKnowledgeSnapshot,
  SkillPromptMessage,
  SkillTaskInput,
} from "./types";

export const XIAOHONGSHU_OUTPUT_PROTOCOL =
  "marketing-ai.xiaohongshu-output.v1";
export const XIAOHONGSHU_COPY_RESULT_PROTOCOL =
  "marketing-ai.xiaohongshu-copy-result.v1";
export const XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL =
  "marketing-ai.xiaohongshu-package-result.v1";

export type XiaohongshuImageUsage = "atmosphere" | "effect";

export type XiaohongshuTaskInput = Extract<
  SkillTaskInput,
  { action: "generate" }
> & {
  readonly allowAiImage: boolean;
  readonly imageUsage: XiaohongshuImageUsage;
  readonly skillId: "xiaohongshu";
};

export interface RawXiaohongshuOutput {
  readonly assetQuery: {
    readonly offeringNames: readonly string[];
    readonly query: string;
    readonly reason: string;
    readonly sceneTags: readonly string[];
  };
  readonly body: string;
  readonly cover: {
    readonly body: string;
    readonly headline: string;
  };
  readonly protocolVersion: typeof XIAOHONGSHU_OUTPUT_PROTOCOL;
  readonly title: string;
}

export interface XiaohongshuCopyResult {
  readonly assetQuery: RawXiaohongshuOutput["assetQuery"];
  readonly body: string;
  readonly compliance: {
    readonly blocked: boolean;
    readonly fields: {
      readonly body: ComplianceReport;
      readonly coverBody: ComplianceReport;
      readonly coverHeadline: ComplianceReport;
      readonly title: ComplianceReport;
    };
  };
  readonly cover: RawXiaohongshuOutput["cover"];
  readonly protocolVersion: typeof XIAOHONGSHU_COPY_RESULT_PROTOCOL;
  readonly publishReady: boolean;
  readonly title: string;
  readonly usage: XiaohongshuImageUsage;
}

export interface XiaohongshuImageSource {
  readonly assetId: string | null;
  readonly isEffectImage: boolean;
  readonly isReal: boolean;
  readonly kind: "ai_generated" | "merchant_asset";
  readonly originalName: string | null;
  readonly reason: string;
  readonly scene: string | null;
  readonly similarity: number | null;
}

export interface XiaohongshuPackageResult
  extends Omit<XiaohongshuCopyResult, "cover" | "protocolVersion"> {
  readonly aiFallback: {
    readonly configured: boolean;
    readonly requested: boolean;
    readonly status: "not_requested" | "not_needed" | "used";
  };
  readonly cover: XiaohongshuCopyResult["cover"] & {
    readonly compositionId: string | null;
    readonly downloadUrl: string | null;
    readonly height: 1440;
    readonly mimeType: "image/png";
    readonly templateId: "xiaohongshu-cover-3x4";
    readonly width: 1080;
  };
  readonly imageSources: readonly XiaohongshuImageSource[];
  readonly protocolVersion: typeof XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL;
  readonly publication: {
    readonly blockedReasons: readonly string[];
    readonly status: "blocked" | "ready";
  };
  readonly skillId: "xiaohongshu";
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  path: string,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be text`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${path} must contain 1-${maximum} characters`);
  }
  return normalized;
}

function strings(value: unknown, path: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 12 ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${path} must be a string array`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

export function buildXiaohongshuPrompt(input: {
  readonly complianceLexicon: readonly ComplianceRule[];
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly systemInstruction: string;
  readonly task: XiaohongshuTaskInput;
}): readonly SkillPromptMessage[] {
  return [
    {
      role: "system",
      content: [
        "MARKETING_AI_XIAOHONGSHU_PROTOCOL_V1",
        input.systemInstruction,
        "生成一个完整的小红书图文包文案。只输出 JSON，不要 Markdown。",
        "不得编造知识库中没有的价格、活动、疗效、资质、体验或用户反馈。",
        "标题、正文、封面标题和封面副文案都必须使用真实、克制的表达。",
        `本次配图用途固定为 ${input.task.imageUsage}，模型不得改变用途。`,
        input.task.imageUsage === "effect"
          ? "效果呈现只能查询商家数据库中的效果类实拍素材；不得建议、请求或描述 AI 生成效果图。"
          : "氛围配图优先查询商家实拍素材；AI 生图是否可用由工作流配置决定，模型不得声称已经生成。",
        `输出协议：{"protocolVersion":"${XIAOHONGSHU_OUTPUT_PROTOCOL}","title":"笔记标题","body":"完整正文","cover":{"headline":"封面标题","body":"封面副文案"},"assetQuery":{"query":"用于语义选图的自然语言","sceneTags":["场景"],"offeringNames":["Offering 名称"],"reason":"选择理由"}}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        complianceLexicon: input.complianceLexicon,
        instruction: {
          intent: input.task.intent,
          selectedKnowledgeTypes: input.task.selectedKnowledgeTypes,
        },
        knowledge: input.knowledge,
      }),
    },
  ];
}

export function parseXiaohongshuOutput(textValue: string): RawXiaohongshuOutput {
  const trimmed = textValue
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("Xiaohongshu provider output was not valid JSON", {
      cause: error,
    });
  }
  const output = record(parsed, "output");
  if (output.protocolVersion !== XIAOHONGSHU_OUTPUT_PROTOCOL) {
    throw new Error("Xiaohongshu provider output protocol is unsupported");
  }
  const cover = record(output.cover, "cover");
  const assetQuery = record(output.assetQuery, "assetQuery");
  return {
    assetQuery: {
      offeringNames: strings(
        assetQuery.offeringNames,
        "assetQuery.offeringNames",
      ),
      query: text(assetQuery.query, "assetQuery.query", 500),
      reason: text(assetQuery.reason, "assetQuery.reason", 500),
      sceneTags: strings(assetQuery.sceneTags, "assetQuery.sceneTags"),
    },
    body: text(output.body, "body", 10_000),
    cover: {
      body: text(cover.body, "cover.body", 600),
      headline: text(cover.headline, "cover.headline", 80),
    },
    protocolVersion: XIAOHONGSHU_OUTPUT_PROTOCOL,
    title: text(output.title, "title", 80),
  };
}

export function finalizeXiaohongshuCopy(input: {
  readonly complianceLexicon: readonly ComplianceRule[];
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly raw: RawXiaohongshuOutput;
  readonly task: XiaohongshuTaskInput;
}): XiaohongshuCopyResult {
  const merchantRules = (input.knowledge.brandProfile?.tabooExpressions ?? [])
    .filter(Boolean)
    .map((term) => ({
      category: "商家禁忌表达",
      replacement: "",
      severity: "block" as const,
      term,
    }));
  const rules = [...input.complianceLexicon, ...merchantRules];
  const fields = {
    body: validateContent(input.raw.body, rules),
    coverBody: validateContent(input.raw.cover.body, rules),
    coverHeadline: validateContent(input.raw.cover.headline, rules),
    title: validateContent(input.raw.title, rules),
  };
  const blocked = Object.values(fields).some((report) => report.blocked);
  return {
    assetQuery: input.raw.assetQuery,
    body: input.raw.body,
    compliance: { blocked, fields },
    cover: input.raw.cover,
    protocolVersion: XIAOHONGSHU_COPY_RESULT_PROTOCOL,
    publishReady: !blocked,
    title: input.raw.title,
    usage: input.task.imageUsage,
  };
}
