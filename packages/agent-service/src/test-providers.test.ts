import { describe, expect, it } from "vitest";

import { DeterministicTextProvider } from "./test-providers";

describe("deterministic provider acceptance seam", () => {
  it("returns the strict member-touch matrix contract for local end-to-end tests", async () => {
    const output = await new DeterministicTextProvider().generate({
      messages: [
        {
          content: "MARKETING_AI_MEMBER_TOUCH_PROTOCOL_V1",
          role: "system",
        },
        {
          content: JSON.stringify({
            matrix: [
              { scenario: "新客欢迎", segmentKey: "segment-1" },
              { scenario: "卡项到期", segmentKey: "segment-1" },
            ],
            placeholders: [
              { key: "member_salutation" },
              { key: "expiry_date" },
            ],
            skillId: "member-touch",
          }),
          role: "user",
        },
      ],
    });
    const parsed = JSON.parse(output.text);

    expect(parsed).toEqual({
      cells: [
        {
          alternatives: [
            expect.stringContaining("{{member_salutation}}"),
            expect.stringContaining("{{member_salutation}}"),
          ],
          scenario: "新客欢迎",
          segmentKey: "segment-1",
        },
        {
          alternatives: [
            expect.stringContaining("{{expiry_date}}"),
            expect.stringContaining("{{expiry_date}}"),
          ],
          scenario: "卡项到期",
          segmentKey: "segment-1",
        },
      ],
      protocolVersion: "marketing-ai.member-touch-output.v1",
    });
  });

  it("honors configured community content types and the injected brand voice", async () => {
    const provider = new DeterministicTextProvider();
    const response = await provider.generate({
      messages: [
        {
          role: "system",
          content:
            "MARKETING_AI_SKILL_PROTOCOL_V1\n只输出 marketing-ai.skill-output.v1 JSON",
        },
        {
          role: "user",
          content: JSON.stringify({
            complianceLexicon: [],
            instruction: {
              action: "generate",
              contentTypes: [
                {
                  assetGuidance: "门店通知",
                  goal: "把安排说清楚",
                  id: "announcement",
                  label: "群公告",
                },
                {
                  assetGuidance: "活动实拍",
                  goal: "准确预告活动",
                  id: "campaign-warmup",
                  label: "活动预热",
                },
                {
                  assetGuidance: "服务过程实拍",
                  goal: "分享准确、克制的专业知识",
                  id: "knowledge-share",
                  label: "专业知识分享",
                },
              ],
              intent: "准备今天的社群内容",
              selectedKnowledgeTypes: ["brandProfile"],
            },
            knowledge: {
              assets: [],
              audiences: [{ addressStyle: "姐妹", name: "久坐上班族" }],
              brandProfile: {
                persona: "社区主理人",
                story: "认真经营十年",
                tabooExpressions: [],
                tone: "像熟人聊天，具体、克制",
              },
              campaigns: [
                {
                  name: "八月预约礼",
                  offerDetails: "赠热敷十分钟",
                  rules: "提前一天预约",
                },
              ],
              merchantName: "慢慢护理",
              offerings: [
                {
                  description: "60 分钟真实服务",
                  fieldValues: { suitableFor: "久坐上班族" },
                  id: "offering-1",
                  name: "晚间肩颈舒缓护理",
                },
              ],
            },
          }),
        },
      ],
    });
    const parsed = JSON.parse(response.text);

    expect(parsed.protocolVersion).toBe("marketing-ai.skill-output.v1");
    expect(parsed.items.map(({ contentType }: { contentType: string }) => contentType)).toEqual([
      "announcement",
      "campaign-warmup",
      "knowledge-share",
    ]);
    expect(parsed.items[0].text).toContain(
      "姐妹们，慢慢护理今天跟大家说一声群内安排",
    );
    expect(parsed.items[2].text).toContain("今天想和大家聊聊一个常见问题");
  });
});
