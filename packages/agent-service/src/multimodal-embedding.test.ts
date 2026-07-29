import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashscopeMultimodalEmbeddingProvider } from "./dashscope-multimodal";
import { CompatibleEmbeddingProvider } from "./openai-compatible";
import { DeterministicEmbeddingProvider } from "./test-providers";
import { EMBEDDING_DIMENSIONS } from "./types";

function cosine(left: readonly number[], right: readonly number[]): number {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}

async function fixture(red: number, green: number, blue: number) {
  return sharp({
    create: {
      background: { b: blue, g: green, r: red },
      channels: 3,
      height: 8,
      width: 8,
    },
  }).png().toBuffer();
}

describe("multimodal embedding providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compares query text against actual image pixels in one vector space", async () => {
    const provider = new DeterministicEmbeddingProvider();
    const warmImage = await fixture(214, 132, 70);
    const coolImage = await fixture(52, 132, 229);
    const { embeddings } = await provider.embed({
      dimensions: EMBEDDING_DIMENSIONS,
      inputs: [
        { data: warmImage, mediaType: "image/png", type: "image" },
        { data: coolImage, mediaType: "image/png", type: "image" },
        { text: "适合秋季护肤氛围的图", type: "text" },
      ],
    });

    expect(embeddings).toHaveLength(3);
    expect(embeddings.every(
      (embedding) => embedding.length === EMBEDDING_DIMENSIONS,
    )).toBe(true);
    expect(cosine(embeddings[0], embeddings[2])).toBeGreaterThan(
      cosine(embeddings[1], embeddings[2]),
    );
    expect(embeddings[0]).not.toEqual(embeddings[1]);
  });

  it("sends real image bytes as a DashScope data URI at 1536 dimensions", async () => {
    const bytes = await fixture(214, 132, 70);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const encoded = body.input.contents[0].image as string;
      expect(Buffer.from(encoded.split(",")[1], "base64")).toEqual(bytes);
      expect(body.parameters.dimension).toBe(EMBEDDING_DIMENSIONS);
      return new Response(JSON.stringify({
        output: {
          embeddings: [{
            embedding: Array(EMBEDDING_DIMENSIONS).fill(0.25),
            index: 0,
            type: "vl",
          }],
        },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new DashscopeMultimodalEmbeddingProvider({
      apiKey: "test-key",
      baseUrl: "https://dashscope.example",
      id: "dashscope-test",
      model: "qwen3-vl-embedding",
    });

    const result = await provider.embed({
      dimensions: EMBEDDING_DIMENSIONS,
      inputs: [{ data: bytes, mediaType: "image/png", type: "image" }],
    });
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope.example/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding",
      expect.any(Object),
    );
  });

  it("does not pass image inputs to a text-only compatible endpoint", async () => {
    const provider = new CompatibleEmbeddingProvider({
      apiKey: "test-key",
      baseUrl: "https://compatible.example/v1",
      id: "compatible-test",
      model: "text-model",
    });

    await expect(provider.embed({
      dimensions: EMBEDDING_DIMENSIONS,
      inputs: [{
        data: await fixture(1, 2, 3),
        mediaType: "image/png",
        type: "image",
      }],
    })).rejects.toMatchObject({ code: "UNSUPPORTED_EMBEDDING_INPUT" });
  });
});
