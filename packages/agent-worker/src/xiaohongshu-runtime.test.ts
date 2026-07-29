import { describe, expect, it } from "vitest";

import { externalXiaohongshuImageFallbackConfigured } from "./xiaohongshu-runtime";

describe("Xiaohongshu external image fallback configuration", () => {
  it("requires both an explicit feature flag and a real provider credential", () => {
    expect(externalXiaohongshuImageFallbackConfigured({})).toBe(false);
    expect(
      externalXiaohongshuImageFallbackConfigured({
        XHS_AI_IMAGE_FALLBACK_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      externalXiaohongshuImageFallbackConfigured({
        DASHSCOPE_API_KEY: "configured",
        XHS_AI_IMAGE_FALLBACK_ENABLED: "false",
      }),
    ).toBe(false);
    expect(
      externalXiaohongshuImageFallbackConfigured({
        AGENT_SECONDARY_IMAGE_API_KEY: "configured",
        XHS_AI_IMAGE_FALLBACK_ENABLED: "true",
      }),
    ).toBe(true);
  });
});
