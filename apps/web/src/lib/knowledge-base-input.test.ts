import { describe, expect, it } from "vitest";

import {
  parseBrandProfile,
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
  it("accepts only constrained visual tokens for a brand profile", () => {
    expect(
      parseBrandProfile(
        formData({
          accentColor: "#F4C7AB",
          fontStyle: "editorial",
          persona: "主理人",
          primaryColor: "#7C3F58",
          story: "十年真实经营",
          tabooExpressions: "包治百病",
          tone: "亲切克制",
        }),
      ),
    ).toMatchObject({
      accentColor: "#F4C7AB",
      fontStyle: "editorial",
      primaryColor: "#7C3F58",
    });
    expect(() =>
      parseBrandProfile(
        formData({
          accentColor: "#F4C7AB",
          fontStyle: "url",
          persona: "主理人",
          primaryColor: "url(javascript:x)",
          story: "十年真实经营",
          tone: "亲切克制",
        }),
      ),
    ).toThrow();
  });

  it("rejects PII fields and values instead of reading or persisting them", () => {
    expect(() =>
      parseMemberSegment(
        formData({
          communicationGoal: "提醒复购",
          definition: "60 天内没有到店的会员群体定义",
          email: "not-stored@example.com",
          name: "沉睡会员",
          phone: "13800000000",
          triggerScenarios: "节日前唤醒",
        }),
      ),
    ).toThrow("会员分层不得包含个人信息字段");

    expect(() =>
      parseMemberSegment(
        formData({
          communicationGoal: "联系手机号 13800000000",
          definition: "60 天内没有到店的会员群体定义",
          name: "沉睡会员",
          triggerScenarios: "节日前唤醒",
        }),
      ),
    ).toThrow("会员分层定义不得包含个人信息");

    expect(
      parseMemberSegment(
        formData({
          communicationGoal: "提醒复购",
          definition: "60 天内没有到店的会员群体定义",
          name: "沉睡会员",
          triggerScenarios: "节日前唤醒",
        }),
      ),
    ).toEqual({
      communicationGoal: "提醒复购",
      definition: "60 天内没有到店的会员群体定义",
      name: "沉睡会员",
      triggerScenarios: "节日前唤醒",
    });
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
