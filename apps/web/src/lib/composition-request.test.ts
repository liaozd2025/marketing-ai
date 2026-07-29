import { describe, expect, it } from "vitest";

import { parseCompositionRequest } from "./composition-request";

describe("composition request boundary", () => {
  it("accepts only copy, template, usage, and an asset id", () => {
    expect(
      parseCompositionRequest({
        assetId: "11111111-1111-4111-8111-111111111111",
        body: "真实体验，认真记录。",
        headline: "今天也要好好照顾自己",
        templateId: "xiaohongshu-cover-3x4",
        usage: "effect",
      }),
    ).toEqual({
      assetId: "11111111-1111-4111-8111-111111111111",
      body: "真实体验，认真记录。",
      headline: "今天也要好好照顾自己",
      templateId: "xiaohongshu-cover-3x4",
      usage: "effect",
    });
  });

  it.each(["merchant_id", "merchantId", "tenant_id"])(
    "rejects client-reported tenant field %s",
    (field) => {
      expect(() =>
        parseCompositionRequest({
          assetId: "11111111-1111-4111-8111-111111111111",
          body: "正文",
          headline: "标题",
          templateId: "moments-copy-card",
          usage: "general",
          [field]: "22222222-2222-4222-8222-222222222222",
        }),
      ).toThrow();
    },
  );
});
