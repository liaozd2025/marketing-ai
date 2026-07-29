import { ProviderError } from "./errors";
import type {
  EmbeddingProvider,
  ImageProvider,
  TextProvider,
} from "./types";

function stableVector(text: string): number[] {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return [hash / 0xffffffff, text.length / 1000, 1];
}

export class DeterministicTextProvider implements TextProvider {
  readonly capability = "text";

  constructor(readonly id = "test-text") {}

  async generate(request: Parameters<TextProvider["generate"]>[0]) {
    const latest = [...request.messages]
      .reverse()
      .find((message) => message.role === "user");
    return { text: `[test] ${latest?.content ?? ""}` };
  }
}

export class DeterministicImageProvider implements ImageProvider {
  readonly capability = "image";

  constructor(readonly id = "test-image") {}

  async generate(request: Parameters<ImageProvider["generate"]>[0]) {
    return {
      revisedPrompt: request.prompt,
      url: `test://image/${encodeURIComponent(request.prompt)}`,
    };
  }
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly capability = "embedding";

  constructor(readonly id = "test-embedding") {}

  async embed(request: Parameters<EmbeddingProvider["embed"]>[0]) {
    return { embeddings: request.texts.map(stableVector) };
  }
}

export class FailingTextProvider implements TextProvider {
  readonly capability = "text";

  constructor(
    readonly id = "failing-text",
    private readonly retryable = true,
  ) {}

  async generate(): Promise<never> {
    throw new ProviderError(
      "Configured test provider failure",
      "TEST_PROVIDER_FAILED",
      this.retryable,
    );
  }
}
