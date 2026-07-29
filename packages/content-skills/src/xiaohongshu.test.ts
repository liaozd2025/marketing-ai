import { describe, expect, it } from "vitest";

import { seedMerchantKnowledge } from "./daily-moments.fixture";
import {
  buildXiaohongshuPrompt,
  finalizeXiaohongshuCopy,
  parseXiaohongshuOutput,
} from "./xiaohongshu";

const task = {
  action: "generate" as const,
  allowAiImage: false,
  imageUsage: "atmosphere" as const,
  intent: "写一篇秋季护理笔记",
  kind: "skill" as const,
  selectedKnowledgeTypes: ["brandProfile", "offering", "asset"],
  skillId: "xiaohongshu" as const,
};

describe("xiaohongshu copy package public contract", () => {
  it("validates title, body, and every cover text field with vertical and brand rules", () => {
    const messages = buildXiaohongshuPrompt({
      complianceLexicon: [
        {
          category: "疗效承诺",
          replacement: "帮助改善",
          severity: "block",
          term: "根治",
        },
      ],
      knowledge: seedMerchantKnowledge,
      systemInstruction: "只生成真实、有信息密度的小红书图文包。",
      task,
    });
    expect(messages[0].content).toContain(
      "MARKETING_AI_XIAOHONGSHU_PROTOCOL_V1",
    );

    const raw = parseXiaohongshuOutput(
      JSON.stringify({
        assetQuery: {
          offeringNames: ["晚间肩颈舒缓护理"],
          query: "秋季暖色护理氛围实拍",
          reason: "与秋季护理主题一致",
          sceneTags: ["护理记录"],
        },
        body: "正文保持真实克制，不编造体验。",
        cover: {
          body: "包变美",
          headline: "一次根治肩颈问题",
        },
        protocolVersion: "marketing-ai.xiaohongshu-output.v1",
        title: "下班后的一小时放松记录",
      }),
    );
    const result = finalizeXiaohongshuCopy({
      complianceLexicon: [
        {
          category: "疗效承诺",
          replacement: "帮助改善",
          severity: "block",
          term: "根治",
        },
      ],
      knowledge: seedMerchantKnowledge,
      raw,
      task,
    });

    expect(result.publishReady).toBe(false);
    expect(result.compliance.fields.coverHeadline.hits).toEqual([
      expect.objectContaining({ term: "根治" }),
    ]);
    expect(result.compliance.fields.coverBody.hits).toEqual([
      expect.objectContaining({
        category: "商家禁忌表达",
        term: "包变美",
      }),
    ]);
    expect(result.assetQuery.query).toBe("秋季暖色护理氛围实拍");
    expect(result.usage).toBe("atmosphere");
  });
});
