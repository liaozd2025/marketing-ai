import { describe, expect, it } from "vitest";

import {
  chromiumLaunchArgs,
  ChromiumRenderer,
  readPngDimensions,
} from "./index";

const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2s6O9QAAAABJRU5ErkJggg==";

const baseInput = {
  asset: {
    alt: "已授权的门店实拍素材",
    dataUrl: onePixelPng,
  },
  brand: {
    accentColor: "#F4C7AB",
    fontStyle: "modern" as const,
    merchantName: "春风里皮肤管理",
    primaryColor: "#7C3F58",
  },
  copy: {
    body: "到店后的松弛感，藏在每一次认真护理里。",
    headline: "今天，也要好好照顾自己",
  },
  templateId: "xiaohongshu-cover-3x4",
  usage: "general" as const,
};

describe("real Chromium HTML to PNG composition", () => {
  it("keeps the Chromium sandbox enabled unless explicitly disabled", () => {
    expect(chromiumLaunchArgs(false)).not.toContain("--no-sandbox");
    expect(chromiumLaunchArgs(true)).toContain("--no-sandbox");
  });

  it.each([
    ["xiaohongshu-cover-3x4", 1080, 1440],
    ["moments-copy-card", 1080, 1080],
  ])("renders %s at %sx%s", async (templateId, width, height) => {
    const renderer = new ChromiumRenderer();
    try {
      const png = await renderer.compose({ ...baseInput, templateId });

      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(readPngDimensions(png)).toEqual({ height, width });
      expect(png.byteLength).toBeGreaterThan(10_000);
    } finally {
      await renderer.close();
    }
  }, 30_000);

  it("keeps markup-like Chinese copy as exact visible text, not executable HTML", async () => {
    const renderer = new ChromiumRenderer();
    try {
      const png = await renderer.compose({
        ...baseInput,
        copy: {
          ...baseInput.copy,
          headline: '<img src=x onerror="alert(1)">原样中文',
        },
      });

      expect(readPngDimensions(png)).toEqual({ height: 1440, width: 1080 });
    } finally {
      await renderer.close();
    }
  }, 30_000);
});
