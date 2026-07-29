import { afterEach, describe, expect, it, vi } from "vitest";

import { providerRoutesFromEnvironment } from "./provider-config";

describe("providerRoutesFromEnvironment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds two switchable production providers for every capability", () => {
    const routes = providerRoutesFromEnvironment({
      AGENT_DOMESTIC_BASE_URL: "https://primary.example/v1",
      AGENT_EMBEDDING_PROVIDER_ORDER:
        "secondary-embedding,domestic-embedding",
      AGENT_IMAGE_PROVIDER_ORDER: "secondary-image,domestic-image",
      AGENT_SECONDARY_API_KEY: "secondary-key",
      AGENT_SECONDARY_BASE_URL: "https://secondary.example/v1",
      AGENT_TEXT_PROVIDER_ORDER: "secondary-text,domestic-text",
      DASHSCOPE_API_KEY: "primary-key",
      NODE_ENV: "production",
    });

    expect(routes.text.map((provider) => provider.id)).toEqual([
      "secondary-text",
      "domestic-text",
    ]);
    expect(routes.image.map((provider) => provider.id)).toEqual([
      "secondary-image",
      "domestic-image",
    ]);
    expect(routes.embedding.map((provider) => provider.id)).toEqual([
      "secondary-embedding",
      "domestic-embedding",
    ]);
  });

  it("configures a separate secondary endpoint, key, and model per capability", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init;
      if (url.includes("text.example")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "text result" } }],
          }),
        );
      }
      if (url.includes("image.example")) {
        return new Response(
          JSON.stringify({ data: [{ url: "https://image.example/result" }] }),
        );
      }
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const routes = providerRoutesFromEnvironment({
      AGENT_EMBEDDING_PROVIDER_ORDER: "secondary-embedding",
      AGENT_IMAGE_PROVIDER_ORDER: "secondary-image",
      AGENT_SECONDARY_EMBEDDING_API_KEY: "embedding-key",
      AGENT_SECONDARY_EMBEDDING_BASE_URL: "https://embedding.example/v1",
      AGENT_SECONDARY_EMBEDDING_MODEL: "embedding-model",
      AGENT_SECONDARY_IMAGE_API_KEY: "image-key",
      AGENT_SECONDARY_IMAGE_BASE_URL: "https://image.example/v1",
      AGENT_SECONDARY_IMAGE_MODEL: "image-model",
      AGENT_SECONDARY_TEXT_API_KEY: "text-key",
      AGENT_SECONDARY_TEXT_BASE_URL: "https://text.example/v1",
      AGENT_SECONDARY_TEXT_MODEL: "text-model",
      AGENT_TEXT_PROVIDER_ORDER: "secondary-text",
      NODE_ENV: "production",
    });

    await routes.text[0].generate({
      messages: [{ content: "hello", role: "user" }],
    });
    await routes.image[0].generate({ prompt: "card" });
    await routes.embedding[0].embed({ texts: ["asset"] });

    const calls = fetchMock.mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      "https://text.example/v1/chat/completions",
      "https://image.example/v1/images/generations",
      "https://embedding.example/v1/embeddings",
    ]);
    expect(
      calls.map(([, init]) => ({
        authorization: (init?.headers as Record<string, string>).authorization,
        model: JSON.parse(String(init?.body)).model,
      })),
    ).toEqual([
      { authorization: "Bearer text-key", model: "text-model" },
      { authorization: "Bearer image-key", model: "image-model" },
      { authorization: "Bearer embedding-key", model: "embedding-model" },
    ]);
  });

  it("rejects unknown provider names instead of silently misrouting", () => {
    expect(() =>
      providerRoutesFromEnvironment({
        AGENT_TEXT_PROVIDER_ORDER: "does-not-exist",
      }),
    ).toThrow("Unknown provider in route");
  });
});
