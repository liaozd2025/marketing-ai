import { describe, expect, it } from "vitest";

import { containsPersonalInformation } from "./personal-information";

describe("personal information boundary", () => {
  it.each([
    "手机号：13800138000",
    "身份证号：11010519491231002X",
    "邮箱：member@example.com",
    "微信号：zhangsan_88",
    "会员姓名：张三",
  ])("recognizes identifiable member data: %s", (value) => {
    expect(containsPersonalInformation(value)).toBe(true);
  });

  it("allows anonymous segment definitions and merchant descriptions", () => {
    expect(
      containsPersonalInformation(
        "连续 60 天未到店的客群，用于换季关怀；社区护理工作室经营十年。",
      ),
    ).toBe(false);
  });
});
