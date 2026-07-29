import { describe, expect, it } from "vitest";

import { seedMerchantKnowledge } from "./daily-moments.fixture";
import {
  buildMemberTouchPrompt,
  finalizeMemberTouchRun,
  MEMBER_TOUCH_PROTOCOL,
  parseMemberTouchOutput,
  resolveMemberTouchScenarios,
  SkillProtocolError,
} from "./index";
import type {
  MemberTouchConfiguration,
  SkillTaskInput,
} from "./types";

const configuration: MemberTouchConfiguration = {
  maximumAlternatives: 3,
  minimumAlternatives: 2,
  placeholders: [
    {
      description: "发送前由商家在本地替换，不要把真实称呼提交到平台。",
      key: "member_salutation",
      label: "对方称呼",
    },
    {
      description: "发送前填写对应卡项或服务名称。",
      key: "offering_name",
      label: "Offering 名称",
    },
    {
      description: "发送前填写会员实际到期日期。",
      key: "expiry_date",
      label: "到期日期",
    },
  ],
};
const task: SkillTaskInput = {
  action: "generate",
  intent: "按会员分层与触达场景生成零 PII 话术模板",
  kind: "skill",
  selectedKnowledgeTypes: [],
  skillId: "member-touch",
};
const knowledge = {
  ...seedMerchantKnowledge,
  memberSegments: [
    {
      communicationGoal: "说明首次到店后的服务方式",
      definition: "首次到店后 7 天内的新客分层",
      name: "新客",
      triggerScenarios: "首次到店跟进",
    },
    {
      communicationGoal: "温和提醒，不制造焦虑",
      definition: "连续 60 天未到店的老客分层",
      name: "60 天未到店",
      triggerScenarios: "换季关怀、周年回访",
    },
  ],
};
const scenarios = resolveMemberTouchScenarios(
  ["新客欢迎", "复购唤醒", "卡项到期"],
  knowledge.memberSegments,
);

function validProviderOutput() {
  const cells = [];
  for (const [segmentIndex] of knowledge.memberSegments.entries()) {
    for (const scenario of scenarios) {
      cells.push({
        alternatives: [
          `{{member_salutation}}，这是${scenario}的第一条可选话术。`,
          `{{member_salutation}}，这是${scenario}的第二条可选话术，可了解{{offering_name}}。`,
        ],
        scenario,
        segmentKey: `segment-${segmentIndex + 1}`,
      });
    }
  }
  return JSON.stringify({ cells, protocolVersion: MEMBER_TOUCH_PROTOCOL });
}

describe("member lifecycle touch public contract", () => {
  it("builds every segment by configured and knowledge-base scenario cell with no individual records", () => {
    expect(scenarios).toEqual([
      "新客欢迎",
      "复购唤醒",
      "卡项到期",
      "首次到店跟进",
      "换季关怀",
      "周年回访",
    ]);

    const messages = buildMemberTouchPrompt({
      configuration,
      knowledge,
      scenarios,
      systemInstruction: "生成真实、克制的会员分层话术模板。",
      task,
    });
    const payload = JSON.parse(messages[1].content);

    expect(payload.matrix).toHaveLength(12);
    expect(payload.segments).toEqual([
      expect.objectContaining({ key: "segment-1", name: "新客" }),
      expect.objectContaining({ key: "segment-2", name: "60 天未到店" }),
    ]);
    expect(JSON.stringify(payload)).not.toContain("memberRecords");
    expect(JSON.stringify(payload)).not.toContain("phone");
  });

  it("accepts exactly two or three alternatives in every matrix cell and reports allowed placeholders", () => {
    const result = finalizeMemberTouchRun({
      complianceLexicon: [],
      configuration,
      knowledge,
      raw: parseMemberTouchOutput(validProviderOutput()),
      scenarios,
      task,
    });

    expect(result.cells).toHaveLength(12);
    expect(result.cells.every((cell) => cell.alternatives.length === 2)).toBe(
      true,
    );
    expect(result.cells[0]).toMatchObject({
      alternatives: [
        {
          copyReady: true,
          placeholders: ["member_salutation"],
        },
        {
          copyReady: true,
          placeholders: ["member_salutation", "offering_name"],
        },
      ],
      scenario: "新客欢迎",
      segment: { name: "新客" },
    });
    expect(result.placeholderDefinitions).toEqual(configuration.placeholders);
  });

  it("rejects missing cells, PII-shaped provider fields, and placeholders outside the whitelist", () => {
    const missing = JSON.parse(validProviderOutput());
    missing.cells.pop();
    expect(() =>
      finalizeMemberTouchRun({
        complianceLexicon: [],
        configuration,
        knowledge,
        raw: parseMemberTouchOutput(JSON.stringify(missing)),
        scenarios,
        task,
      }),
    ).toThrow("Expected exactly 12 member-touch matrix cells");

    const piiField = JSON.parse(validProviderOutput());
    piiField.cells[0].memberPhone = "13800138000";
    expect(() =>
      parseMemberTouchOutput(JSON.stringify(piiField)),
    ).toThrow(SkillProtocolError);

    const unknownPlaceholder = JSON.parse(validProviderOutput());
    unknownPlaceholder.cells[0].alternatives[0] =
      "{{member_phone}}，欢迎回来。";
    expect(() =>
      finalizeMemberTouchRun({
        complianceLexicon: [],
        configuration,
        knowledge,
        raw: parseMemberTouchOutput(JSON.stringify(unknownPlaceholder)),
        scenarios,
        task,
      }),
    ).toThrow("Placeholder member_phone is not allowed");
  });

  it("refuses to send a PII-shaped legacy member-segment definition to a provider", () => {
    expect(() =>
      buildMemberTouchPrompt({
        configuration,
        knowledge: {
          ...knowledge,
          memberSegments: [
            {
              ...knowledge.memberSegments[0],
              definition: "联系 13800138000 后加入的新客分层",
            },
          ],
        },
        scenarios: ["新客欢迎"],
        systemInstruction: "生成真实、克制的会员分层话术模板。",
        task,
      }),
    ).toThrow("Member segment definitions must not contain personal data");
  });

  it("runs every alternative through generic and merchant compliance rules", () => {
    const blocked = JSON.parse(validProviderOutput());
    blocked.cells[0].alternatives[0] =
      "{{member_salutation}}，这次可以根治问题，包变美。";
    const result = finalizeMemberTouchRun({
      complianceLexicon: [
        {
          category: "疗效承诺",
          replacement: "帮助改善",
          severity: "block",
          term: "根治",
        },
      ],
      configuration,
      knowledge,
      raw: parseMemberTouchOutput(JSON.stringify(blocked)),
      scenarios,
      task,
    });

    expect(result.cells[0].alternatives[0]).toMatchObject({
      compliance: { blocked: true },
      copyReady: false,
    });
    expect(
      result.cells[0].alternatives[0].compliance.hits.map((hit) => hit.term),
    ).toEqual(["根治", "包变美"]);
    expect(result.cells[0].alternatives[1].copyReady).toBe(true);
  });
});
