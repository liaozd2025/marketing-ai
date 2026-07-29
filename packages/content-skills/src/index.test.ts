import { describe, expect, it } from "vitest";

import { seedMerchantKnowledge } from "./daily-moments.fixture";
import {
  buildSkillPrompt,
  finalizeSkillRun,
  parseSkillOutput,
  SkillProtocolError,
} from "./index";
import type { ConfiguredSkillPreset, SkillTaskInput } from "./types";

const preset: ConfiguredSkillPreset = {
  contentTypes: [
    { assetGuidance: "实拍日常", goal: "建立信任", id: "persona", label: "人设" },
    { assetGuidance: "项目素材", goal: "说明体验", id: "seeding", label: "种草" },
    { assetGuidance: "活动素材", goal: "准确说明规则", id: "campaign", label: "活动" },
  ],
  defaultKnowledgeTypes: ["brandProfile", "offering"],
  description: "test",
  id: "daily-moments",
  label: "朋友圈日更",
  systemInstruction: "生成真实、克制的朋友圈。",
};
const task: SkillTaskInput = {
  action: "generate",
  intent: "今天下雨，语气松弛一点",
  kind: "skill",
  selectedKnowledgeTypes: ["brandProfile"],
  skillId: "daily-moments",
};

describe("configured content Skill", () => {
  it("injects every structured entity even when UI selects an emphasis subset", () => {
    const messages = buildSkillPrompt({
      knowledge: seedMerchantKnowledge,
      preset,
      task,
    });
    const payload = JSON.parse(messages[1].content);

    expect(payload.knowledge).toEqual(seedMerchantKnowledge);
    expect(payload.instruction.selectedKnowledgeTypes).toEqual([
      "brandProfile",
    ]);
  });

  it("strictly parses, matches tagged assets, and blocks every lexicon hit", () => {
    const raw = parseSkillOutput(
      JSON.stringify({
        protocolVersion: "marketing-ai.skill-output.v1",
        items: [
          {
            contentType: "persona",
            text: "下雨天，把护理间收拾好，等你来坐坐。",
            assetQuery: {
              sceneTags: ["到店日常"],
              offeringNames: [],
              effectImage: false,
              reason: "用真实门店日常承接主理人人设",
            },
          },
          {
            contentType: "seeding",
            text: "晚间肩颈护理可以根治紧绷，包变美。",
            assetQuery: {
              sceneTags: ["护理记录"],
              offeringNames: ["晚间肩颈舒缓护理"],
              effectImage: true,
              reason: "使用已授权效果类实拍",
            },
          },
          {
            contentType: "campaign",
            text: "工作日晚 7 点后的预约礼，记得提前一天约。",
            assetQuery: {
              sceneTags: ["到店日常"],
              offeringNames: ["晚间肩颈舒缓护理"],
              effectImage: false,
              reason: "用晚间门店图说明活动场景",
            },
          },
        ],
      }),
    );
    const result = finalizeSkillRun({
      complianceLexicon: [
        {
          category: "疗效承诺",
          replacement: "帮助缓解",
          severity: "block",
          term: "根治",
        },
      ],
      knowledge: seedMerchantKnowledge,
      preset,
      raw,
      task,
    });

    expect(result.items[1]).toMatchObject({
      assetSuggestions: [
        { assetId: "asset-2", label: "效果类实拍" },
      ],
      publishReady: false,
    });
    expect(result.items[1].compliance.hits.map((hit) => hit.term)).toEqual([
      "根治",
      "包变美",
    ]);
    expect(result.items[0].assetSuggestions).toEqual([
      expect.objectContaining({ assetId: "asset-1", label: "实拍" }),
    ]);
    expect(result.items[0].assetSuggestions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId: "asset-2" }),
      ]),
    );
    expect(result.context).toEqual({
      assets: 2,
      audiences: 1,
      brandProfile: 1,
      campaigns: 1,
      memberSegments: 1,
      offerings: 1,
    });
  });

  it("rejects missing configured content types", () => {
    expect(() => parseSkillOutput("not JSON")).toThrow(
      "Provider output was not valid JSON",
    );
    expect(() =>
      finalizeSkillRun({
        complianceLexicon: [],
        knowledge: seedMerchantKnowledge,
        preset,
        raw: {
          protocolVersion: "marketing-ai.skill-output.v1",
          items: [],
        },
        task,
      }),
    ).toThrow(SkillProtocolError);
  });
});
