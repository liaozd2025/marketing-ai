import { describe, expect, it } from "vitest";

import {
  InvalidAssetSearchError,
  parseAssetSearchRequest,
} from "./asset-search";

describe("parseAssetSearchRequest", () => {
  it("normalizes an asynchronous semantic search request", () => {
    expect(parseAssetSearchRequest({
      limit: 5,
      offering_id: "5d73162f-f244-4fdf-b586-2a570fcf35ef",
      query: "  适合秋季护肤氛围的图  ",
      scene: "护理记录",
    })).toEqual({
      limit: 5,
      offeringId: "5d73162f-f244-4fdf-b586-2a570fcf35ef",
      query: "适合秋季护肤氛围的图",
      scene: "护理记录",
    });
  });

  it("rejects client-supplied tenant identity and invalid limits", () => {
    expect(() => parseAssetSearchRequest({
      limit: 1000,
      merchant_id: "merchant-from-client",
      query: "query",
    })).toThrow(InvalidAssetSearchError);
  });
});
