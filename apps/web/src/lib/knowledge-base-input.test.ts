import { describe, expect, it } from "vitest";

import {
  parseCampaign,
  parseMemberSegment,
} from "./knowledge-base-input";

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

describe("knowledge-base input boundary", () => {
  it("accepts only zero-PII fields for a member segment", () => {
    const result = parseMemberSegment(
      formData({
        communicationGoal: "提醒复购",
        definition: "60 天内没有到店的会员群体定义",
        email: "not-stored@example.com",
        name: "沉睡会员",
        phone: "13800000000",
        triggerScenarios: "节日前唤醒",
      }),
    );

    expect(result).toEqual({
      communicationGoal: "提醒复购",
      definition: "60 天内没有到店的会员群体定义",
      name: "沉睡会员",
      triggerScenarios: "节日前唤醒",
    });
    expect(Object.keys(result)).not.toEqual(
      expect.arrayContaining(["email", "phone"]),
    );
  });

  it("rejects a campaign ending before it starts", () => {
    expect(() =>
      parseCampaign(
        formData({
          endsAt: "2026-08-01T10:00",
          name: "七夕活动",
          offerDetails: "双人同行礼",
          rules: "提前预约",
          startsAt: "2026-08-02T10:00",
        }),
      ),
    ).toThrow("活动结束时间不能早于开始时间");
  });
});
