import { ProviderError } from "./errors";
import type {
  EmbeddingProvider,
  ImageProvider,
  TextProvider,
} from "./types";

function stableVector(text: string): number[] {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return [hash / 0xffffffff, text.length / 1000, 1];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function firstRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? asRecord(value[0]) : {};
}

function deterministicSkillOutput(
  request: Parameters<TextProvider["generate"]>[0],
): string | null {
  if (
    !request.messages.some(
      ({ content, role }) =>
        role === "system" &&
        content.includes("MARKETING_AI_SKILL_PROTOCOL_V1"),
    )
  ) {
    return null;
  }
  const latest = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  const payload = asRecord(JSON.parse(latest?.content ?? "{}"));
  const instruction = asRecord(payload.instruction);
  const knowledge = asRecord(payload.knowledge);
  const brand = asRecord(knowledge.brandProfile);
  const offering = firstRecord(knowledge.offerings);
  const audience = firstRecord(knowledge.audiences);
  const campaign = firstRecord(knowledge.campaigns);
  const fields = asRecord(offering.fieldValues);
  const merchantName = textValue(knowledge.merchantName, "这家小店");
  const offeringName = textValue(offering.name, "到店护理");
  const contentTypes = Array.isArray(instruction.contentTypes)
    ? instruction.contentTypes.map(asRecord)
    : [];
  const action = textValue(instruction.action, "generate");
  const sourceText = textValue(instruction.sourceText);
  const intent = textValue(instruction.intent);
  const lexicon = Array.isArray(payload.complianceLexicon)
    ? payload.complianceLexicon.map(asRecord)
    : [];

  const revisedText = () => {
    let revised = sourceText;
    if (action === "compliance_rewrite") {
      for (const rule of lexicon) {
        const term = textValue(rule.term);
        if (term) {
          revised = revised
            .split(term)
            .join(textValue(rule.replacement, "更温和地表达"));
        }
      }
    } else {
      const instructionText = textValue(instruction.instruction);
      if (instructionText.includes("更简短") && revised.length > 70) {
        revised = `${revised.slice(0, 68)}。`;
      }
      if (instructionText.includes("更口语")) {
        revised = `和大家说句实在的：${revised}`;
      }
      if (instructionText.includes("换个开头")) {
        revised = `今天想换个角度聊聊。${revised}`;
      }
      if (instructionText.toLowerCase().includes("emoji")) {
        revised = `${revised} 🌿`;
      }
    }
    return revised || "把真实信息说清楚，留一点余地给每个人自己的感受。";
  };

  const itemFor = (contentType: Record<string, unknown>) => {
    const id = textValue(contentType.id);
    let text: string;
    if (action !== "generate") {
      text = revisedText();
    } else if (id === "persona") {
      text = [
        `今天把 ${merchantName} 的护理间又认真收拾了一遍。`,
        textValue(brand.story, "开店久了，更相信认真听完每个人的感受。"),
        "不催着做决定，先坐下来聊聊你最近的状态，再看今天适不适合安排。",
      ].join("\n\n");
    } else if (id === "seeding") {
      const suitableFor = textValue(
        fields.suitableFor,
        textValue(audience.name, "想给自己留一点放松时间的人"),
      );
      const sellingPoints = textValue(
        fields.sellingPoints,
        textValue(offering.description, "过程中的轻重和节奏都可以随时沟通"),
      );
      text = [
        `最近被问得多的是「${offeringName}」到底适合谁。`,
        `如果你是${suitableFor}，可以先来了解一下。${sellingPoints}。`,
        fields.price !== undefined
          ? `日常价格是 ${String(fields.price)} 元，先了解清楚，再决定要不要约。`
          : "先把过程和注意事项了解清楚，再决定要不要约。",
      ].join("\n\n");
      if (intent.includes("[[fixture:violation]]")) {
        text += "\n\n一次根治所有问题，100%有效。";
      }
    } else {
      text = campaign.name
        ? [
            `${textValue(campaign.name)}开始啦。`,
            textValue(campaign.offerDetails),
            textValue(campaign.rules),
            "想来可以提前问问当天时段，确认合适再预约。",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "这周的预约时段已经整理好。想给自己留一点放松时间，可以提前问问，确认合适再来。";
    }
    return {
      assetQuery: {
        effectImage: false,
        offeringNames: id === "persona" ? [] : [offeringName],
        reason:
          id === "persona"
            ? "用真实门店日常承接主理人表达"
            : `选择与${offeringName}和文案场景一致的实拍`,
        sceneTags:
          id === "persona"
            ? ["到店日常", "门店环境"]
            : id === "campaign"
              ? ["活动", "到店日常"]
              : ["护理记录", "服务过程"],
      },
      contentType: id,
      text,
    };
  };
  return JSON.stringify({
    items: contentTypes.map(itemFor),
    protocolVersion: "marketing-ai.skill-output.v1",
  });
}

export class DeterministicTextProvider implements TextProvider {
  readonly capability = "text";

  constructor(readonly id = "test-text") {}

  async generate(request: Parameters<TextProvider["generate"]>[0]) {
    const skillOutput = deterministicSkillOutput(request);
    if (skillOutput) {
      return { text: skillOutput };
    }
    const latest = [...request.messages]
      .reverse()
      .find((message) => message.role === "user");
    return { text: `[test] ${latest?.content ?? ""}` };
  }
}

export class DeterministicImageProvider implements ImageProvider {
  readonly capability = "image";

  constructor(readonly id = "test-image") {}

  async generate(request: Parameters<ImageProvider["generate"]>[0]) {
    return {
      revisedPrompt: request.prompt,
      url: `test://image/${encodeURIComponent(request.prompt)}`,
    };
  }
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly capability = "embedding";

  constructor(readonly id = "test-embedding") {}

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0]) {
    return { embeddings: request.texts.map(stableVector) };
  }
}

export class FailingTextProvider implements TextProvider {
  readonly capability = "text";

  constructor(
    readonly id = "failing-text",
    private readonly retryable = true,
  ) {}

  async generate(): Promise<never> {
    throw new ProviderError(
      "Configured test provider failure",
      "TEST_PROVIDER_FAILED",
      this.retryable,
    );
  }
}
