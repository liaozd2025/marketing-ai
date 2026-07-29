import { tenantId, type Asset, type BrandProfile } from "@marketing-ai/database";
import { describe, expect, it } from "vitest";

import { buildCompositionDocument } from "./composition-source";

const merchantId = tenantId("11111111-1111-4111-8111-111111111111");
const now = new Date("2026-07-30T00:00:00.000Z");
const brandProfile: BrandProfile = {
  accentColor: "#F4C7AB",
  createdAt: now,
  fontStyle: "modern",
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  merchantId,
  persona: "主理人",
  primaryColor: "#7C3F58",
  story: "真实经营",
  tabooExpressions: [],
  tone: "亲切克制",
  updatedAt: now,
};
const asset: Asset = {
  byteSize: 12,
  createdAt: now,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  indexedAt: null,
  indexingError: null,
  indexingStatus: "not_indexed",
  indexingTaskId: null,
  isEffectImage: true,
  isReal: true,
  merchantId,
  mimeType: "image/png",
  notes: "授权",
  offeringId: null,
  originalName: "实拍.png",
  scene: "效果记录",
  storageKey: `${merchantId}/real.png`,
  updatedAt: now,
};
const request = {
  assetId: asset.id,
  body: "真实体验，认真记录。",
  headline: "今天也要好好照顾自己",
  templateId: "xiaohongshu-cover-3x4",
  usage: "effect" as const,
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ",
  "base64",
);

describe("trusted composition source", () => {
  it("embeds the tenant asset and brand visual tokens without a remote URL", () => {
    expect(
      buildCompositionDocument({
        asset,
        brandProfile,
        bytes: png,
        merchantName: "春风里皮肤管理",
        request,
      }),
    ).toMatchObject({
      asset: {
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      },
      brand: {
        accentColor: "#F4C7AB",
        merchantName: "春风里皮肤管理",
        primaryColor: "#7C3F58",
      },
    });
  });

  it("allows effect compositions only from a real, effect-labelled raster asset", () => {
    expect(() =>
      buildCompositionDocument({
        asset: { ...asset, isEffectImage: false },
        brandProfile,
        bytes: png,
        merchantName: "春风里皮肤管理",
        request,
      }),
    ).toThrow("effect-asset-required");
    expect(() =>
      buildCompositionDocument({
        asset: { ...asset, mimeType: "video/mp4" },
        brandProfile,
        bytes: Buffer.from("video"),
        merchantName: "春风里皮肤管理",
        request: { ...request, usage: "general" },
      }),
    ).toThrow("raster-asset-required");
  });
});
