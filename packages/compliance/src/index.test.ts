import { describe, expect, it } from "vitest";

import {
  applyComplianceReplacements,
  validateContent,
} from "./index";

const rules = [
  {
    category: "疗效承诺",
    replacement: "帮助改善",
    severity: "block" as const,
    term: "根治",
  },
  {
    category: "绝对化用语",
    replacement: "受欢迎的",
    severity: "warn" as const,
    term: "第一",
  },
];

describe("vertical-agnostic compliance validator", () => {
  it("reports every occurrence with stable offsets and blocks every configured hit", () => {
    const report = validateContent("根治问题，争做第一；拒绝根治承诺。", rules);

    expect(report.blocked).toBe(true);
    expect(report.hits).toEqual([
      expect.objectContaining({ category: "疗效承诺", start: 0, term: "根治" }),
      expect.objectContaining({ severity: "warn", start: 7, term: "第一" }),
      expect.objectContaining({ category: "疗效承诺", start: 12, term: "根治" }),
    ]);
  });

  it("also blocks a warn-only hit until the copy is changed", () => {
    expect(validateContent("本地第一", rules)).toMatchObject({
      blocked: true,
      hits: [expect.objectContaining({ severity: "warn", term: "第一" })],
    });
  });

  it("can apply configured replacements without embedding vertical terms", () => {
    const content = "根治问题，争做第一";
    expect(
      applyComplianceReplacements(
        content,
        validateContent(content, rules).hits,
      ),
    ).toBe("帮助改善问题，争做受欢迎的");
  });
});
