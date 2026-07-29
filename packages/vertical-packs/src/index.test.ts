import { describe, expect, it } from "vitest";

import {
  getVerticalPack,
  offeringCompleteness,
  validateOfferingFields,
} from "./index";

describe("vertical pack public interface", () => {
  it("exposes the complete beauty v1 configuration", () => {
    const pack = getVerticalPack("beauty-v1");

    expect(pack.label).toBe("美业 / 大健康");
    expect(pack.offeringFields.map((field) => field.key)).toContain("price");
    expect(pack.scenarioVocabulary).toHaveLength(4);
    expect(pack.complianceLexicon).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "疗效承诺", term: "根治" }),
      ]),
    );
    expect(pack.skillPresets.map((preset) => preset.id)).toEqual([
      "daily-moments",
      "member-touch",
      "community",
      "xiaohongshu",
    ]);
    expect(pack.skillPresets[0].contentTypes.map(({ id }) => id)).toEqual([
      "persona",
      "seeding",
      "campaign",
    ]);
    const memberTouchVocabulary = pack.scenarioVocabulary.find(
      ({ key }) => key === "member-touch",
    );
    expect(memberTouchVocabulary?.terms).toEqual([
      "新客欢迎",
      "复购唤醒",
      "沉睡唤醒",
      "卡项到期",
      "生日关怀",
    ]);
    expect(pack.skillPresets[1].memberTouch).toMatchObject({
      maximumAlternatives: 3,
      minimumAlternatives: 2,
      placeholders: expect.arrayContaining([
        expect.objectContaining({ key: "member_salutation" }),
        expect.objectContaining({ key: "expiry_date" }),
        expect.objectContaining({ key: "remaining_uses" }),
      ]),
    });
    expect(pack.skillPresets[2]).toMatchObject({
      ctaLabel: "一键生成今天的社群内容（3 条）",
      id: "community",
      contentTypes: [
        { id: "announcement", label: "群公告" },
        { id: "campaign-warmup", label: "活动预热" },
        { id: "knowledge-share", label: "专业知识分享" },
      ],
    });
  });

  it("uses the same field configuration for validation and completeness", () => {
    const pack = getVerticalPack("beauty-v1");
    const input = {
      offeringType: "service",
      price: "398",
      sellingPoints: "真人手法服务",
      suitableFor: "久坐人群",
    };

    expect(validateOfferingFields(pack, input)).toEqual({
      errors: {},
      values: {
        offeringType: "service",
        price: 398,
        sellingPoints: "真人手法服务",
        suitableFor: "久坐人群",
      },
    });
    expect(offeringCompleteness(pack, input)).toBe(100);
  });

  it("rejects values outside the configured Offering template", () => {
    const pack = getVerticalPack("beauty-v1");
    const result = validateOfferingFields(pack, {
      offeringType: "unsupported",
      price: "-1",
    });

    expect(result.errors).toMatchObject({
      offeringType: "Offering 类型选项无效",
      price: "日常价格（元）不能小于 0",
      sellingPoints: "核心卖点为必填项",
      suitableFor: "适合客群为必填项",
    });
  });
});
