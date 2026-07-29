import { ProviderError } from "./errors";
import type { EmbeddingProvider } from "./types";

interface DashscopeMultimodalOptions {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly id: string;
  readonly model: string;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProviderError(
      "DashScope returned an invalid response",
      "INVALID_PROVIDER_RESPONSE",
      false,
    );
  }
  return value as Record<string, unknown>;
}

function dataUri(mediaType: string, bytes: Uint8Array): string {
  if (!mediaType.startsWith("image/")) {
    throw new ProviderError(
      `Unsupported multimodal media type: ${mediaType}`,
      "UNSUPPORTED_EMBEDDING_INPUT",
      false,
    );
  }
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export class DashscopeMultimodalEmbeddingProvider
implements EmbeddingProvider {
  readonly capability = "embedding";

  constructor(private readonly options: DashscopeMultimodalOptions) {}

  get id(): string {
    return this.options.id;
  }

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0]) {
    if (!this.options.apiKey) {
      throw new ProviderError(
        `Missing API key for ${this.options.id}`,
        "PROVIDER_NOT_CONFIGURED",
        false,
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${this.options.baseUrl.replace(/\/$/, "")}/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding`,
        {
          body: JSON.stringify({
            input: {
              contents: request.inputs.map((input) =>
                input.type === "text"
                  ? { text: input.text }
                  : { image: dataUri(input.mediaType, input.data) }),
            },
            model: this.options.model,
            parameters: { dimension: request.dimensions },
          }),
          headers: {
            authorization: `Bearer ${this.options.apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: AbortSignal.timeout(120_000),
        },
      );
    } catch (error) {
      throw new ProviderError(
        `${this.options.id} request failed`,
        "PROVIDER_NETWORK_ERROR",
        true,
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        `${this.options.id} returned HTTP ${response.status}`,
        `PROVIDER_HTTP_${response.status}`,
        response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }

    const output = object(object(await response.json()).output);
    if (!Array.isArray(output.embeddings)) {
      throw new ProviderError(
        "DashScope response did not contain embeddings",
        "INVALID_PROVIDER_RESPONSE",
        false,
      );
    }
    const embeddings = output.embeddings
      .map((item) => object(item))
      .sort((left, right) => Number(left.index) - Number(right.index))
      .map((item) => {
        const embedding = item.embedding;
        if (
          !Array.isArray(embedding) ||
          embedding.length !== request.dimensions ||
          embedding.some(
            (value) => typeof value !== "number" || !Number.isFinite(value),
          )
        ) {
          throw new ProviderError(
            `DashScope response must contain ${request.dimensions}-dimension embeddings`,
            "INVALID_PROVIDER_RESPONSE",
            false,
          );
        }
        return embedding as number[];
      });
    if (embeddings.length !== request.inputs.length) {
      throw new ProviderError(
        "DashScope response count did not match embedding inputs",
        "INVALID_PROVIDER_RESPONSE",
        false,
      );
    }
    return {
      embeddingSpace:
        `dashscope-multimodal:${this.options.model}:${request.dimensions}`,
      embeddings,
    };
  }
}
