import { describe, expect, it } from "vitest";

import { DeterministicTextProvider } from "./test-providers";

describe("deterministic provider acceptance seam", () => {
  it("returns the strict member-touch matrix contract for local end-to-end tests", async () => {
    const output = await new DeterministicTextProvider().generate({
      messages: [
        {
          content: "MARKETING_AI_MEMBER_TOUCH_PROTOCOL_V1",
          role: "system",
        },
        {
          content: JSON.stringify({
            matrix: [
              { scenario: "新客欢迎", segmentKey: "segment-1" },
              { scenario: "卡项到期", segmentKey: "segment-1" },
            ],
            placeholders: [
              { key: "member_salutation" },
              { key: "expiry_date" },
            ],
            skillId: "member-touch",
          }),
          role: "user",
        },
      ],
    });
    const parsed = JSON.parse(output.text);

    expect(parsed).toEqual({
      cells: [
        {
          alternatives: [
            expect.stringContaining("{{member_salutation}}"),
            expect.stringContaining("{{member_salutation}}"),
          ],
          scenario: "新客欢迎",
          segmentKey: "segment-1",
        },
        {
          alternatives: [
            expect.stringContaining("{{expiry_date}}"),
            expect.stringContaining("{{expiry_date}}"),
          ],
          scenario: "卡项到期",
          segmentKey: "segment-1",
        },
      ],
      protocolVersion: "marketing-ai.member-touch-output.v1",
    });
  });
});
