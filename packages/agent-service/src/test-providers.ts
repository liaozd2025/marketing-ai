import { ProviderError } from "./errors";
import sharp from "sharp";
import type {
  EmbeddingProvider,
  ImageProvider,
  TextProvider,
} from "./types";

const FEATURE_COUNT = 12;

function repeatedVector(features: readonly number[], dimensions: number) {
  const vector = Array.from(
    { length: dimensions },
    (_, index) => features[index % FEATURE_COUNT] ?? 0,
  );
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  return vector.map((value) => value / (magnitude || 1));
}

function includesAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function textFeatures(value: string): number[] {
  const text = value.toLowerCase();
  const autumn = includesAny(text, ["秋", "autumn", "fall"]);
  const skincare = includesAny(text, [
    "护肤",
    "皮肤",
    "美容",
    "面部",
    "skincare",
    "skin",
    "beauty",
  ]);
  const warm = autumn ||
    includesAny(text, ["暖", "金", "橙", "棕", "warm", "amber", "orange"]);
  const cool = includesAny(text, [
    "清凉",
    "蓝",
    "冷色",
    "cool",
    "blue",
    "summer",
    "夏",
  ]);
  const nature = includesAny(text, ["自然", "绿", "植物", "nature", "green"]);
  const clean = skincare ||
    includesAny(text, ["洁净", "清透", "干净", "clean", "fresh"]);
  if (warm) {
    return [
      0.86,
      0.54,
      0.29,
      1,
      0,
      skincare ? 1 : 0.55,
      0.62,
      0.18,
      0.7,
      nature ? 0.8 : 0.2,
      clean ? 0.8 : 0.3,
      0.1,
    ];
  }
  if (cool) {
    return [
      0.25,
      0.56,
      0.9,
      0,
      1,
      skincare ? 0.45 : 0.15,
      0.58,
      0.2,
      0.72,
      nature ? 0.8 : 0.25,
      clean ? 0.9 : 0.45,
      0.1,
    ];
  }
  return [
    nature ? 0.35 : 0.5,
    nature ? 0.82 : 0.5,
    0.42,
    0.2,
    0.2,
    skincare ? 0.9 : 0.2,
    0.55,
    0.3,
    0.35,
    nature ? 1 : 0.2,
    clean ? 0.85 : 0.35,
    0.5,
  ];
}

async function imageFeatures(data: Uint8Array): Promise<number[]> {
  const statistics = await sharp(data).stats();
  if (statistics.channels.length < 3) {
    throw new ProviderError(
      "Deterministic provider requires an RGB image",
      "UNSUPPORTED_EMBEDDING_INPUT",
      false,
    );
  }
  const [red, green, blue] = statistics.channels.map(
    (channel) => channel.mean / 255,
  );
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const brightness = (red + green + blue) / 3;
  const skinDistance = Math.sqrt(
    (red - 0.82) ** 2 + (green - 0.56) ** 2 + (blue - 0.34) ** 2,
  );
  return [
    red,
    green,
    blue,
    Math.max(0, red - blue),
    Math.max(0, blue - red),
    Math.max(0, 1 - skinDistance / 0.9),
    brightness,
    1 - brightness,
    maximum - minimum,
    green,
    1 - (statistics.channels[0].stdev +
      statistics.channels[1].stdev +
      statistics.channels[2].stdev) / (3 * 128),
    0.1,
  ];
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

function deterministicMemberTouchOutput(
  request: Parameters<TextProvider["generate"]>[0],
): string | null {
  if (
    !request.messages.some(
      ({ content, role }) =>
        role === "system" &&
        content.includes("MARKETING_AI_MEMBER_TOUCH_PROTOCOL_V1"),
    )
  ) {
    return null;
  }
  const latest = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  const payload = asRecord(JSON.parse(latest?.content ?? "{}"));
  const matrix = Array.isArray(payload.matrix)
    ? payload.matrix.map(asRecord)
    : [];
  const placeholderKeys = new Set(
    (Array.isArray(payload.placeholders) ? payload.placeholders : [])
      .map(asRecord)
      .map((placeholder) => textValue(placeholder.key))
      .filter(Boolean),
  );
  const fallbackPlaceholder =
    [...placeholderKeys][0] ?? "member_salutation";
  const marker = (key: string) =>
    `{{${placeholderKeys.has(key) ? key : fallbackPlaceholder}}}`;

  return JSON.stringify({
    cells: matrix.map((entry) => {
      const scenario = textValue(entry.scenario);
      const salutation = marker("member_salutation");
      const detail = scenario.includes("到期")
        ? `${marker("expiry_date")}前`
        : scenario.includes("复购") || scenario.includes("唤醒")
          ? `了解${marker("offering_name")}`
          : `通过${marker("booking_method")}联系我们`;
      return {
        alternatives: [
          `${salutation}，这是一条${scenario}提醒：${detail}，如有需要可以先问问。`,
          `${salutation}，想和你温和说一声，${scenario}时可以${detail}，确认合适再安排。`,
        ],
        scenario,
        segmentKey: textValue(entry.segmentKey),
      };
    }),
    protocolVersion: "marketing-ai.member-touch-output.v1",
  });
}

function deterministicXiaohongshuOutput(
  request: Parameters<TextProvider["generate"]>[0],
): string | null {
  if (
    !request.messages.some(
      ({ content, role }) =>
        role === "system" &&
        content.includes("MARKETING_AI_XIAOHONGSHU_PROTOCOL_V1"),
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
  const offering = firstRecord(knowledge.offerings);
  const audience = firstRecord(knowledge.audiences);
  const fields = asRecord(offering.fieldValues);
  const intent = textValue(instruction.intent);
  const merchantName = textValue(knowledge.merchantName, "这家小店");
  const offeringName = textValue(offering.name, "到店护理");
  const suitableFor = textValue(
    fields.suitableFor,
    textValue(audience.name, "想认真了解护理过程的人"),
  );
  const title = `${offeringName}｜下班后的一小时真实记录`;
  const body = [
    `最近在 ${merchantName} 认真体验了「${offeringName}」。`,
    `如果你是${suitableFor}，可以先了解过程和注意事项，再判断是否适合自己。`,
    textValue(
      offering.description,
      "全程先沟通真实状态，服务中的感受可以随时反馈。",
    ),
    "这篇只记录真实环境和服务过程，不替每个人承诺相同结果。",
  ].join("\n\n");
  const coverHeadline = intent.includes("[[fixture:cover-violation]]")
    ? "一次根治所有问题"
    : "下班后，留一小时给自己";
  const query = includesAny(intent, ["秋", "暖", "autumn"])
    ? "适合秋季护肤氛围的暖色实拍图"
    : `与${offeringName}服务过程匹配的真实护理记录`;
  return JSON.stringify({
    assetQuery: {
      offeringNames: [offeringName],
      query,
      reason: `语义选择与${offeringName}和笔记主题一致的真实素材`,
      sceneTags: ["护理记录", "到店日常"],
    },
    body,
    cover: {
      body: "真实环境 · 真实过程 · 克制分享",
      headline: coverHeadline,
    },
    protocolVersion: "marketing-ai.xiaohongshu-output.v1",
    title,
  });
}

function deterministicKnowledgeExtractionOutput(
  request: Parameters<TextProvider["generate"]>[0],
): string | null {
  if (
    !request.messages.some(
      ({ content, role }) =>
        role === "system" &&
        content.includes("marketing-ai.knowledge-extraction-output.v1"),
    )
  ) {
    return null;
  }
  const source =
    [...request.messages]
      .reverse()
      .find(({ role }) => role === "user")
      ?.content ?? "";
  if (!source.includes("[[fixture:knowledge-cold-start]]")) {
    return JSON.stringify({
      assets: [],
      audiences: [],
      brandProfile: null,
      campaigns: [],
      memberSegments: [],
      offerings: [],
      protocolVersion: "marketing-ai.knowledge-extraction-output.v1",
    });
  }
  return JSON.stringify({
    assets: [
      {
        isEffectImage: false,
        notes: "商家门头与护理间环境实拍",
        originalName: "溪岚护理门店实拍.png",
        scene: "门店环境",
      },
    ],
    audiences: [
      {
        addressStyle: "姐妹",
        motivations: "希望在下班后安静放松",
        name: "久坐上班族",
        painPoints: "肩颈容易紧绷，又怕被推销",
      },
    ],
    brandProfile: {
      persona: "社区护理主理人",
      story: "认真经营十年，坚持先沟通再安排服务",
      tabooExpressions: ["根治", "100%有效"],
      tone: "亲切克制",
    },
    campaigns: [
      {
        endsAt: "2026-08-31T15:59:59.000Z",
        name: "八月晚间预约礼",
        offerDetails: "工作日晚间预约赠热敷十分钟",
        rules: "提前一天预约，每人限一次",
        startsAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    memberSegments: [
      {
        communicationGoal: "温和提醒，不制造焦虑",
        definition: "连续 60 天未到店的客群分层定义",
        name: "60 天未到店",
        triggerScenarios: "换季关怀",
      },
    ],
    offerings: [
      {
        description: "先沟通日常状态，再做 60 分钟手法放松",
        fieldValues: {
          durationMinutes: 60,
          offeringType: "service",
          price: 298,
          sellingPoints: "轻重随时沟通，使用独立安静护理间",
          suitableFor: "久坐、下班后想放松的人",
        },
        name: "肩颈舒缓护理",
      },
    ],
    protocolVersion: "marketing-ai.knowledge-extraction-output.v1",
  });
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
  const addressStyle = textValue(audience.addressStyle, "大家");
  const groupAddress =
    addressStyle === "大家" || addressStyle.endsWith("们")
      ? addressStyle
      : `${addressStyle}们`;
  const brandTone = textValue(brand.tone, "自然、具体、克制");
  const conversationalTone = ["熟人", "亲切", "口语", "轻松"].some((term) =>
    brandTone.includes(term),
  );
  const announcementLead = conversationalTone
    ? "跟大家说一声"
    : "向大家同步";
  const knowledgeLead = conversationalTone
    ? "想和大家聊聊"
    : "和大家说明";
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
    } else if (id === "announcement") {
      text = [
        `${groupAddress}，${merchantName}今天${announcementLead}群内安排。`,
        campaign.name
          ? `${textValue(campaign.name)}已经整理好，${textValue(campaign.offerDetails)}。`
          : `${offeringName}的近期预约时段已经整理好。`,
        textValue(campaign.rules),
        "有需要可以先在群里问问当天时段，了解清楚、确认适合再预约。",
      ]
        .filter(Boolean)
        .join("\n\n");
    } else if (id === "campaign-warmup") {
      text = campaign.name
        ? [
            `${groupAddress}，先${announcementLead}：${textValue(campaign.name)}要开始了。`,
            textValue(campaign.offerDetails),
            textValue(campaign.rules),
            `这次会围绕「${offeringName}」安排，想了解的可以先问，确认合适再约。`,
          ]
            .filter(Boolean)
            .join("\n\n")
        : `${groupAddress}，近期还没有新的活动。${merchantName}会把「${offeringName}」的真实安排及时同步给大家。`;
    } else if (id === "knowledge-share") {
      const suitableFor = textValue(
        fields.suitableFor,
        textValue(audience.name, "想先了解自己是否适合的人"),
      );
      const process = textValue(
        offering.description,
        textValue(fields.sellingPoints, "服务过程可随时沟通感受"),
      );
      text = [
        `${groupAddress}，今天${knowledgeLead}一个常见问题：${offeringName}适合谁？`,
        `它更适合${suitableFor}。${process}`,
        "每个人的状态和感受不同，先把过程、注意事项和自己的情况沟通清楚，再决定是否安排。",
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
        offeringNames:
          id === "persona" || id === "announcement" ? [] : [offeringName],
        reason:
          id === "persona" || id === "announcement"
            ? "用真实门店日常承接主理人表达"
            : `选择与${offeringName}和文案场景一致的实拍`,
        sceneTags:
          id === "persona" || id === "announcement"
            ? ["到店日常", "门店环境"]
            : id === "campaign" || id === "campaign-warmup"
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
    const knowledgeExtractionOutput =
      deterministicKnowledgeExtractionOutput(request);
    if (knowledgeExtractionOutput) {
      return { text: knowledgeExtractionOutput };
    }
    const memberTouchOutput = deterministicMemberTouchOutput(request);
    if (memberTouchOutput) {
      return { text: memberTouchOutput };
    }
    const skillOutput =
      deterministicXiaohongshuOutput(request) ??
      deterministicSkillOutput(request);
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
    return {
      embeddingSpace: `deterministic-visual-v1:${request.dimensions}`,
      embeddings: await Promise.all(
        request.inputs.map(async (input) =>
          repeatedVector(
            input.type === "text"
              ? textFeatures(input.text)
              : await imageFeatures(input.data),
            request.dimensions,
          ),
        ),
      ),
    };
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
