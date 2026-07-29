import { ProviderError } from "./errors";
import type {
  EmbeddingProvider,
  ImageProvider,
  TextProvider,
} from "./types";

interface CompatibleProviderOptions {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly id: string;
  readonly model: string;
}

async function postJson(
  options: CompatibleProviderOptions,
  path: string,
  body: unknown,
): Promise<unknown> {
  if (!options.apiKey) {
    throw new ProviderError(
      `Missing API key for ${options.id}`,
      "PROVIDER_NOT_CONFIGURED",
      false,
    );
  }

  let response: Response;
  try {
    response = await fetch(`${options.baseUrl.replace(/\/$/, "")}${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new ProviderError(
      `${options.id} request failed`,
      "PROVIDER_NETWORK_ERROR",
      true,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new ProviderError(
      `${options.id} returned HTTP ${response.status}`,
      `PROVIDER_HTTP_${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }

  return response.json();
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new ProviderError(
      "Provider returned an invalid response",
      "INVALID_PROVIDER_RESPONSE",
      false,
    );
  }
  return value as Record<string, unknown>;
}

export class CompatibleTextProvider implements TextProvider {
  readonly capability = "text";

  constructor(private readonly options: CompatibleProviderOptions) {}

  get id(): string {
    return this.options.id;
  }

  async generate(request: Parameters<TextProvider["generate"]>[0]) {
    const payload = object(
      await postJson(this.options, "/chat/completions", {
        messages: request.messages,
        model: this.options.model,
      }),
    );
    const choice = Array.isArray(payload.choices)
      ? object(payload.choices[0])
      : {};
    const message = object(choice.message);
    if (typeof message.content !== "string") {
      throw new ProviderError(
        "Provider response did not contain text",
        "INVALID_PROVIDER_RESPONSE",
        false,
      );
    }
    return { text: message.content };
  }
}

export class CompatibleImageProvider implements ImageProvider {
  readonly capability = "image";

  constructor(private readonly options: CompatibleProviderOptions) {}

  get id(): string {
    return this.options.id;
  }

  async generate(request: Parameters<ImageProvider["generate"]>[0]) {
    const payload = object(
      await postJson(this.options, "/images/generations", {
        model: this.options.model,
        prompt: request.prompt,
      }),
    );
    const item = Array.isArray(payload.data) ? object(payload.data[0]) : {};
    if (typeof item.url !== "string") {
      throw new ProviderError(
        "Provider response did not contain an image URL",
        "INVALID_PROVIDER_RESPONSE",
        false,
      );
    }
    return {
      ...(typeof item.revised_prompt === "string"
        ? { revisedPrompt: item.revised_prompt }
        : {}),
      url: item.url,
    };
  }
}

export class CompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly capability = "embedding";

  constructor(private readonly options: CompatibleProviderOptions) {}

  get id(): string {
    return this.options.id;
  }

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0]) {
    if (request.inputs.some((input) => input.type !== "text")) {
      throw new ProviderError(
        `${this.options.id} does not support image embedding inputs`,
        "UNSUPPORTED_EMBEDDING_INPUT",
        false,
      );
    }
    const payload = object(
      await postJson(this.options, "/embeddings", {
        dimensions: request.dimensions,
        input: request.inputs.map((input) =>
          input.type === "text" ? input.text : ""),
        model: this.options.model,
      }),
    );
    if (!Array.isArray(payload.data)) {
      throw new ProviderError(
        "Provider response did not contain embeddings",
        "INVALID_PROVIDER_RESPONSE",
        false,
      );
    }
    const embeddings = payload.data.map((item) => {
      const embedding = object(item).embedding;
      if (
        !Array.isArray(embedding) ||
        embedding.length !== request.dimensions ||
        embedding.some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        )
      ) {
        throw new ProviderError(
          `Provider response must contain ${request.dimensions}-dimension embeddings`,
          "INVALID_PROVIDER_RESPONSE",
          false,
        );
      }
      return embedding as number[];
    });
    return {
      embeddingSpace:
        `openai-compatible:${this.options.model}:${request.dimensions}`,
      embeddings,
    };
  }
}
