import {
  CompatibleEmbeddingProvider,
  CompatibleImageProvider,
  CompatibleTextProvider,
} from "./openai-compatible";
import { DashscopeMultimodalEmbeddingProvider } from "./dashscope-multimodal";
import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
} from "./test-providers";
import type {
  AgentProvider,
  EmbeddingProvider,
  ImageProvider,
  ProviderRoutes,
  TextProvider,
} from "./types";

type Environment = Record<string, string | undefined>;

function order(value: string | undefined, defaults: string[]): string[] {
  return (value?.split(",") ?? defaults)
    .map((provider) => provider.trim())
    .filter(Boolean);
}

function select<Provider extends AgentProvider>(
  ids: readonly string[],
  providers: readonly Provider[],
): Provider[] {
  const catalog = new Map(providers.map((provider) => [provider.id, provider]));
  return ids.map((id) => {
    const provider = catalog.get(id);
    if (!provider) {
      throw new Error(`Unknown provider in route: ${id}`);
    }
    return provider;
  });
}

export function providerRoutesFromEnvironment(
  environment: Environment = process.env,
): ProviderRoutes {
  const compatible = {
    apiKey: environment.DASHSCOPE_API_KEY,
    baseUrl:
      environment.AGENT_DOMESTIC_BASE_URL ??
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
  const secondaryBaseUrl =
    environment.AGENT_SECONDARY_BASE_URL ??
    "https://api.siliconflow.cn/v1";
  const secondaryApiKey = environment.AGENT_SECONDARY_API_KEY;
  const allowTest =
    environment.NODE_ENV !== "production" ||
    environment.AGENT_ALLOW_TEST_PROVIDERS === "true";

  const text: TextProvider[] = [
    new CompatibleTextProvider({
      ...compatible,
      id: "domestic-text",
      model: environment.AGENT_TEXT_MODEL ?? "qwen-plus",
    }),
    new CompatibleTextProvider({
      apiKey:
        environment.AGENT_SECONDARY_TEXT_API_KEY ?? secondaryApiKey,
      baseUrl:
        environment.AGENT_SECONDARY_TEXT_BASE_URL ?? secondaryBaseUrl,
      id: "secondary-text",
      model: environment.AGENT_SECONDARY_TEXT_MODEL ?? "Qwen/Qwen3-30B-A3B",
    }),
  ];
  const image: ImageProvider[] = [
    new CompatibleImageProvider({
      ...compatible,
      id: "domestic-image",
      model: environment.AGENT_IMAGE_MODEL ?? "qwen-image-plus",
    }),
    new CompatibleImageProvider({
      apiKey:
        environment.AGENT_SECONDARY_IMAGE_API_KEY ?? secondaryApiKey,
      baseUrl:
        environment.AGENT_SECONDARY_IMAGE_BASE_URL ?? secondaryBaseUrl,
      id: "secondary-image",
      model:
        environment.AGENT_SECONDARY_IMAGE_MODEL ??
        "Kwai-Kolors/Kolors",
    }),
  ];
  const embedding: EmbeddingProvider[] = [
    new DashscopeMultimodalEmbeddingProvider({
      apiKey: compatible.apiKey,
      baseUrl:
        environment.AGENT_DOMESTIC_MULTIMODAL_BASE_URL ??
        "https://dashscope.aliyuncs.com",
      id: "domestic-embedding",
      model: environment.AGENT_EMBEDDING_MODEL ?? "qwen3-vl-embedding",
    }),
    new CompatibleEmbeddingProvider({
      apiKey:
        environment.AGENT_SECONDARY_EMBEDDING_API_KEY ?? secondaryApiKey,
      baseUrl:
        environment.AGENT_SECONDARY_EMBEDDING_BASE_URL ??
        secondaryBaseUrl,
      id: "secondary-embedding",
      model:
        environment.AGENT_SECONDARY_EMBEDDING_MODEL ??
        "Qwen/Qwen3-Embedding-8B",
    }),
  ];

  if (allowTest) {
    text.push(new DeterministicTextProvider());
    image.push(new DeterministicImageProvider());
    embedding.push(new DeterministicEmbeddingProvider());
  }

  return {
    embedding: select(
      order(environment.AGENT_EMBEDDING_PROVIDER_ORDER, [
        "domestic-embedding",
        "secondary-embedding",
        ...(allowTest ? ["test-embedding"] : []),
      ]),
      embedding,
    ),
    image: select(
      order(environment.AGENT_IMAGE_PROVIDER_ORDER, [
        "domestic-image",
        "secondary-image",
        ...(allowTest ? ["test-image"] : []),
      ]),
      image,
    ),
    text: select(
      order(environment.AGENT_TEXT_PROVIDER_ORDER, [
        "domestic-text",
        "secondary-text",
        ...(allowTest ? ["test-text"] : []),
      ]),
      text,
    ),
  };
}
