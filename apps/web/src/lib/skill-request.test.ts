import { describe, expect, it } from "vitest";

import {
  InvalidSkillRequestError,
  parseSkillRunRequest,
} from "./skill-request";

describe("Skill run request", () => {
  it("normalizes a generation request without accepting a tenant id", () => {
    expect(
      parseSkillRunRequest(
        {
          intent: "  今天下雨，口语一点  ",
          selected_knowledge_types: ["brandProfile", "asset"],
        },
        "daily-moments",
      ),
    ).toEqual({
      action: "generate",
      capability: "text",
      intent: "今天下雨，口语一点",
      kind: "skill",
      selectedKnowledgeTypes: ["brandProfile", "asset"],
      skillId: "daily-moments",
    });
    expect(() =>
      parseSkillRunRequest(
        { intent: "test", merchant_id: "attacker" },
        "daily-moments",
      ),
    ).toThrow(InvalidSkillRequestError);
  });

  it("supports async per-card refinement and compliance rewrite inputs", () => {
    expect(
      parseSkillRunRequest(
        {
          action: "compliance_rewrite",
          content_type: "seeding",
          source_text: "号称根治",
        },
        "daily-moments",
      ),
    ).toMatchObject({
      action: "compliance_rewrite",
      instruction: expect.stringContaining("合规"),
      sourceText: "号称根治",
    });
  });

  it("accepts no merchant-supplied values for a zero-PII member-touch run", () => {
    expect(
      parseSkillRunRequest({}, "member-touch", {
        zeroPiiGenerateOnly: true,
      }),
    ).toEqual({
      action: "generate",
      capability: "text",
      intent: "按会员分层与触达场景生成零 PII 话术模板",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "member-touch",
    });

    for (const rejected of [
      { intent: "张女士最近没来" },
      { member_name: "张女士" },
      { member_phone: "13800138000" },
      { placeholders: { member_salutation: "张女士" } },
      { action: "refine", source_text: "任意文本" },
    ]) {
      expect(() =>
        parseSkillRunRequest(rejected, "member-touch", {
          zeroPiiGenerateOnly: true,
        }),
      ).toThrow(InvalidSkillRequestError);
    }
  });

  it("uses a Skill-neutral default intent for every configured preset", () => {
    expect(parseSkillRunRequest({}, "community")).toMatchObject({
      intent: "按当前知识库内容生成该 Skill 的全部配置内容",
      skillId: "community",
    });
  });
});
