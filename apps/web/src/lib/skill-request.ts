import type { SubmitAgentTaskInput } from "@marketing-ai/database";

export class InvalidSkillRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSkillRequestError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidSkillRequestError("Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  name: string,
  maximum: number,
  fallback?: string,
): string {
  const normalized = typeof value === "string" ? value.trim() : fallback;
  if (!normalized || normalized.length > maximum) {
    throw new InvalidSkillRequestError(
      `${name} must be between 1 and ${maximum} characters`,
    );
  }
  return normalized;
}

export function parseSkillRunRequest(
  value: unknown,
  skillId: string,
  policy: { readonly zeroPiiGenerateOnly?: boolean } = {},
): SubmitAgentTaskInput {
  const input = record(value);
  if ("merchant_id" in input || "merchantId" in input || "tenant_id" in input) {
    throw new InvalidSkillRequestError(
      "Tenant identity must come from the signed session",
    );
  }
  const safeSkillId = text(skillId, "skillId", 100);
  if (policy.zeroPiiGenerateOnly) {
    const unsupportedFields = Object.keys(input).filter(
      (key) => key !== "action",
    );
    if (
      unsupportedFields.length > 0 ||
      (input.action !== undefined && input.action !== "generate")
    ) {
      throw new InvalidSkillRequestError(
        "Member-touch accepts no personal data or merchant-supplied values",
      );
    }
    return {
      action: "generate",
      capability: "text",
      intent: "按会员分层与触达场景生成零 PII 话术模板",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: safeSkillId,
    };
  }
  if (
    safeSkillId === "xiaohongshu" &&
    input.action !== undefined &&
    input.action !== "generate"
  ) {
    throw new InvalidSkillRequestError(
      "Xiaohongshu package currently supports generation only",
    );
  }
  if (input.action === undefined || input.action === "generate") {
    const selectedKnowledgeTypes =
      input.selected_knowledge_types === undefined
        ? []
        : input.selected_knowledge_types;
    if (
      !Array.isArray(selectedKnowledgeTypes) ||
      selectedKnowledgeTypes.length > 6 ||
      selectedKnowledgeTypes.some(
        (type) => typeof type !== "string" || !type.trim(),
      )
    ) {
      throw new InvalidSkillRequestError(
        "selected_knowledge_types must be a string array with at most 6 items",
      );
    }
    const xiaohongshuImageOptions =
      safeSkillId === "xiaohongshu"
        ? (() => {
            const imageUsage = input.image_usage ?? "atmosphere";
            if (imageUsage !== "atmosphere" && imageUsage !== "effect") {
              throw new InvalidSkillRequestError(
                "image_usage must be atmosphere or effect",
              );
            }
            const allowAiImage = input.allow_ai_image ?? false;
            if (typeof allowAiImage !== "boolean") {
              throw new InvalidSkillRequestError(
                "allow_ai_image must be a boolean",
              );
            }
            if (imageUsage === "effect" && allowAiImage) {
              throw new InvalidSkillRequestError(
                "AI image fallback is forbidden for effect usage",
              );
            }
            return { allowAiImage, imageUsage };
          })()
        : {};
    if (
      safeSkillId !== "xiaohongshu" &&
      ("image_usage" in input || "allow_ai_image" in input)
    ) {
      throw new InvalidSkillRequestError(
        "image options are only supported by the Xiaohongshu Skill",
      );
    }
    return {
      action: "generate",
      capability: "text",
      intent: text(
        input.intent,
        "intent",
        2_000,
        "按当前知识库内容生成该 Skill 的全部配置内容",
      ),
      kind: "skill",
      selectedKnowledgeTypes: selectedKnowledgeTypes.map((type) =>
        (type as string).trim(),
      ),
      skillId: safeSkillId,
      ...xiaohongshuImageOptions,
    };
  }
  if (
    input.action !== "refine" &&
    input.action !== "compliance_rewrite"
  ) {
    throw new InvalidSkillRequestError("action is unsupported");
  }
  return {
    action: input.action,
    capability: "text",
    contentType: text(input.content_type, "content_type", 100),
    instruction: text(
      input.instruction,
      "instruction",
      500,
      input.action === "compliance_rewrite"
        ? "根据合规词表逐项改写，保留原意和真实经营信息"
        : undefined,
    ),
    kind: "skill",
    skillId: safeSkillId,
    sourceText: text(input.source_text, "source_text", 10_000),
  };
}
