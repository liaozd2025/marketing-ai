import { tenantId } from "@marketing-ai/database";
import { getVerticalPack } from "@marketing-ai/vertical-packs";
import { describe, expect, it } from "vitest";

import { buildKnowledgeBaseSummary } from "./knowledge-base-summary";

const merchantId = tenantId("11111111-1111-4111-8111-111111111111");
const date = new Date("2026-07-30T00:00:00.000Z");
const record = {
  createdAt: date,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  merchantId,
  updatedAt: date,
};

describe("knowledge-base completeness signal", () => {
  it("exposes a readable percentage and count for all six entity types", () => {
    const summary = buildKnowledgeBaseSummary({
      assets: [
        {
          ...record,
          byteSize: 100,
          isEffectImage: true,
          isReal: true,
          mimeType: "image/jpeg",
          notes: "",
          offeringId: null,
          originalName: "实拍.jpg",
          scene: "效果记录",
          storageKey: `${merchantId}/asset.jpg`,
        },
      ],
      audiences: [],
      brandProfile: {
        ...record,
        persona: "亲切主理人",
        story: "十年社区门店",
        tabooExpressions: [],
        tone: "真实克制",
      },
      campaigns: [],
      memberSegments: [],
      offerings: [
        {
          ...record,
          description: "",
          fieldValues: {
            offeringType: "service",
            price: 398,
            sellingPoints: "真人服务",
            suitableFor: "久坐人群",
          },
          name: "肩颈护理",
        },
      ],
      pack: getVerticalPack("beauty-v1"),
    });

    expect(summary).toHaveLength(6);
    expect(summary.find((item) => item.type === "brandProfile")).toMatchObject({
      count: 1,
      percentage: 100,
    });
    expect(summary.find((item) => item.type === "offering")).toMatchObject({
      count: 1,
      percentage: 100,
    });
    expect(summary.find((item) => item.type === "asset")).toMatchObject({
      count: 1,
      percentage: 100,
    });
    expect(summary.find((item) => item.type === "audience")).toMatchObject({
      count: 0,
      percentage: 0,
    });
  });
});
