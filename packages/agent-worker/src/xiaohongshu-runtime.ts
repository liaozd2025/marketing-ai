import {
  EMBEDDING_DIMENSIONS,
  type AgentRequest,
  type AgentResult,
} from "@marketing-ai/agent-service";
import {
  readAssetFile,
  removeCompositionFile,
  storeCompositionFile,
} from "@marketing-ai/asset-storage";
import {
  buildXiaohongshuPrompt,
  finalizeXiaohongshuCopy,
  parseXiaohongshuOutput,
  XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL,
  type SkillKnowledgeSnapshot,
  type XiaohongshuImageSource,
  type XiaohongshuPackageResult,
  type XiaohongshuTaskInput,
} from "@marketing-ai/content-skills";
import {
  embeddingVector,
  tenantId,
  type AssetSearchResult,
  type ClaimedAgentTask,
  type Database,
  type Merchant,
} from "@marketing-ai/database";
import {
  ChromiumRenderer,
  type ChromiumRendererOptions,
} from "@marketing-ai/html-renderer";
import { builtinTemplateRegistry } from "@marketing-ai/template-composition";
import { buildCompositionDocumentFromSource } from "@marketing-ai/template-composition/source";
import type { ComplianceLexiconEntry } from "@marketing-ai/vertical-packs";

export type SkillProviderExecutor = (
  request: AgentRequest,
) => Promise<AgentResult>;

interface CompositionRenderer {
  close(): Promise<void>;
  compose(input: unknown): Promise<Buffer>;
}

type FetchGeneratedImage = (
  url: string,
) => Promise<{ bytes: Buffer; mimeType: string }>;

export interface XiaohongshuRuntimeOptions {
  readonly aiImageFallbackConfigured?: boolean;
  readonly fetchGeneratedImage?: FetchGeneratedImage;
  readonly readAsset?: (storageKey: string) => Promise<Buffer>;
  readonly removeComposition?: (storageKey: string) => Promise<void>;
  readonly rendererFactory?: (
    options?: ChromiumRendererOptions,
  ) => CompositionRenderer;
  readonly storeComposition?: (
    merchantId: string,
    png: Uint8Array,
  ) => Promise<string>;
}

export class SkillWorkflowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SkillWorkflowError";
  }
}

export function externalXiaohongshuImageFallbackConfigured(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  const hasImageCredential = Boolean(
    environment.DASHSCOPE_API_KEY ||
      environment.AGENT_SECONDARY_IMAGE_API_KEY ||
      environment.AGENT_SECONDARY_API_KEY,
  );
  return (
    environment.XHS_AI_IMAGE_FALLBACK_ENABLED === "true" &&
    hasImageCredential
  );
}

async function defaultFetchGeneratedImage(
  rawUrl: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_INVALID_URL",
      "The image provider returned an invalid URL",
    );
  }
  if (url.protocol !== "https:") {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_INVALID_URL",
      "The image provider must return an HTTPS URL",
    );
  }
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_FETCH_FAILED",
      "The configured image provider output could not be downloaded",
      true,
    );
  }
  if (!response.ok) {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_FETCH_FAILED",
      `The configured image provider output returned HTTP ${response.status}`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_INVALID_FILE",
      "The configured image provider output was not a supported raster image",
    );
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 20 * 1024 * 1024) {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_INVALID_FILE",
      "The configured image provider output exceeded 20 MB",
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) {
    throw new SkillWorkflowError(
      "XHS_AI_IMAGE_INVALID_FILE",
      "The configured image provider output had an invalid size",
    );
  }
  return { bytes, mimeType };
}

function expectText(result: AgentResult): string {
  if (result.capability !== "text") {
    throw new SkillWorkflowError(
      "XHS_TEXT_PROVIDER_MISMATCH",
      "The Xiaohongshu text step returned the wrong capability",
    );
  }
  return result.output.text;
}

function expectEmbedding(result: AgentResult) {
  if (
    result.capability !== "embedding" ||
    result.output.embeddings.length !== 1
  ) {
    throw new SkillWorkflowError(
      "XHS_EMBEDDING_PROVIDER_MISMATCH",
      "The Xiaohongshu asset query must return exactly one embedding",
    );
  }
  return result.output;
}

function expectImageUrl(result: AgentResult): string {
  if (result.capability !== "image") {
    throw new SkillWorkflowError(
      "XHS_IMAGE_PROVIDER_MISMATCH",
      "The Xiaohongshu atmosphere image step returned the wrong capability",
    );
  }
  return result.output.url;
}

function blockedPackage(
  copy: ReturnType<typeof finalizeXiaohongshuCopy>,
  aiConfigured: boolean,
  aiRequested: boolean,
): XiaohongshuPackageResult {
  return {
    ...copy,
    aiFallback: {
      configured: aiConfigured,
      requested: aiRequested,
      status: "not_requested",
    },
    cover: {
      ...copy.cover,
      compositionId: null,
      downloadUrl: null,
      height: 1440,
      mimeType: "image/png",
      templateId: "xiaohongshu-cover-3x4",
      width: 1080,
    },
    imageSources: [],
    protocolVersion: XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL,
    publication: {
      blockedReasons: ["compliance"],
      status: "blocked",
    },
    publishReady: false,
    skillId: "xiaohongshu",
  };
}

function merchantAssetSource(
  result: AssetSearchResult,
  reason: string,
): XiaohongshuImageSource {
  return {
    assetId: result.asset.id,
    isEffectImage: result.asset.isEffectImage,
    isReal: result.asset.isReal,
    kind: "merchant_asset",
    originalName: result.asset.originalName,
    reason,
    scene: result.asset.scene,
    similarity: result.similarity,
  };
}

export function prepareXiaohongshuPackage(input: {
  readonly complianceLexicon: readonly ComplianceLexiconEntry[];
  readonly database: Database;
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly merchant: Merchant;
  readonly options?: XiaohongshuRuntimeOptions;
  readonly systemInstruction: string;
  readonly task: ClaimedAgentTask;
  readonly taskInput: XiaohongshuTaskInput;
}): {
  execute(executeProvider: SkillProviderExecutor): Promise<XiaohongshuPackageResult>;
} {
  const options = input.options ?? {};
  const aiConfigured =
    options.aiImageFallbackConfigured ??
    externalXiaohongshuImageFallbackConfigured();
  const readAsset = options.readAsset ?? readAssetFile;
  const storeComposition = options.storeComposition ?? storeCompositionFile;
  const removeComposition =
    options.removeComposition ?? removeCompositionFile;
  const rendererFactory =
    options.rendererFactory ??
    (() => new ChromiumRenderer());
  const fetchGeneratedImage =
    options.fetchGeneratedImage ?? defaultFetchGeneratedImage;
  const tenant = input.database.forTenant(tenantId(input.merchant.id));

  return {
    execute: async (executeProvider) => {
      if (
        input.taskInput.imageUsage === "effect" &&
        input.taskInput.allowAiImage
      ) {
        throw new SkillWorkflowError(
          "XHS_EFFECT_AI_FORBIDDEN",
          "AI image fallback is forbidden for effect usage",
        );
      }
      const textOutput = expectText(
        await executeProvider({
          capability: "text",
          request: {
            messages: buildXiaohongshuPrompt({
              complianceLexicon: input.complianceLexicon,
              knowledge: input.knowledge,
              systemInstruction: input.systemInstruction,
              task: input.taskInput,
            }),
          },
        }),
      );
      const copy = finalizeXiaohongshuCopy({
        complianceLexicon: input.complianceLexicon,
        knowledge: input.knowledge,
        raw: parseXiaohongshuOutput(textOutput),
        task: input.taskInput,
      });
      if (!copy.publishReady) {
        return blockedPackage(
          copy,
          aiConfigured,
          input.taskInput.allowAiImage,
        );
      }

      const embedding = expectEmbedding(
        await executeProvider({
          capability: "embedding",
          request: {
            dimensions: EMBEDDING_DIMENSIONS,
            inputs: [{ text: copy.assetQuery.query, type: "text" }],
          },
        }),
      );
      const searchResults = await tenant.knowledgeBase.searchAssets(
        embeddingVector(embedding.embeddings[0]),
        embedding.embeddingSpace,
        {
          isEffectImage: copy.usage === "effect",
          limit: 6,
          offeringId: null,
          rasterOnly: true,
          realOnly: true,
          scene: null,
        },
      );
      const eligibleResults = searchResults.filter(
        ({ asset }) =>
          asset.isReal &&
          asset.isEffectImage === (copy.usage === "effect"),
      );

      let assetId: string | null = null;
      let sourceBytes: Buffer;
      let sourceMimeType: string;
      let sourceAlt: string;
      let imageSources: readonly XiaohongshuImageSource[];
      let aiStatus: XiaohongshuPackageResult["aiFallback"]["status"];

      const selected = eligibleResults[0];
      if (selected) {
        assetId = selected.asset.id;
        sourceBytes = await readAsset(selected.asset.storageKey);
        sourceMimeType = selected.asset.mimeType;
        sourceAlt = `${selected.asset.scene} · ${selected.asset.originalName}`;
        imageSources = eligibleResults.map((result) =>
          merchantAssetSource(result, copy.assetQuery.reason),
        );
        aiStatus = input.taskInput.allowAiImage
          ? "not_needed"
          : "not_requested";
      } else {
        if (copy.usage === "effect") {
          throw new SkillWorkflowError(
            "XHS_EFFECT_REAL_ASSET_REQUIRED",
            "Effect usage requires an indexed tenant asset with is_real=true and is_effect_image=true; AI image generation is forbidden",
          );
        }
        if (!input.taskInput.allowAiImage) {
          throw new SkillWorkflowError(
            "XHS_ATMOSPHERE_REAL_ASSET_REQUIRED",
            "No indexed tenant atmosphere asset matched; AI fallback was not requested",
          );
        }
        if (!aiConfigured) {
          throw new SkillWorkflowError(
            "XHS_AI_IMAGE_NOT_CONFIGURED",
            "No indexed tenant atmosphere asset matched and no external image provider is configured",
          );
        }
        const imageUrl = expectImageUrl(
          await executeProvider({
            capability: "image",
            request: {
              prompt: [
                copy.assetQuery.query,
                "只生成不包含文字、不呈现服务或产品效果的氛围图。",
                "禁止前后对比、疗效暗示、人体效果或虚构顾客反馈。",
              ].join("\n"),
            },
          }),
        );
        const generated = await fetchGeneratedImage(imageUrl);
        sourceBytes = generated.bytes;
        sourceMimeType = generated.mimeType;
        sourceAlt = "AI 生成氛围图";
        imageSources = [
          {
            assetId: null,
            isEffectImage: false,
            isReal: false,
            kind: "ai_generated",
            originalName: null,
            reason: copy.assetQuery.reason,
            scene: "氛围辅助",
            similarity: null,
          },
        ];
        aiStatus = "used";
      }

      const template = builtinTemplateRegistry.resolve(
        "xiaohongshu-cover-3x4",
      );
      if (template.width !== 1080 || template.height !== 1440) {
        throw new SkillWorkflowError(
          "XHS_TEMPLATE_SIZE_MISMATCH",
          "xiaohongshu-cover-3x4 must render at 1080x1440",
        );
      }
      const existing = await tenant.compositions.getBySourceTask(
        input.task.id,
      );
      let composition = existing;
      if (!composition) {
        const document = buildCompositionDocumentFromSource({
          asset: {
            alt: sourceAlt,
            bytes: sourceBytes,
            mimeType: sourceMimeType,
          },
          brand: {
            accentColor:
              input.knowledge.brandProfile?.accentColor ?? "#F4C7AB",
            fontStyle:
              input.knowledge.brandProfile?.fontStyle ?? "modern",
            merchantName: input.merchant.name,
            primaryColor:
              input.knowledge.brandProfile?.primaryColor ?? "#7655FF",
          },
          copy: copy.cover,
          templateId: template.id,
          usage: copy.usage === "effect" ? "effect" : "general",
        });
        const renderer = rendererFactory();
        let png: Buffer;
        try {
          png = await renderer.compose(document);
        } finally {
          await renderer.close();
        }
        const storageKey = await storeComposition(input.merchant.id, png);
        try {
          composition = await tenant.compositions.create({
            assetId,
            body: copy.cover.body,
            byteSize: png.byteLength,
            createdByMemberId: input.task.createdByMemberId,
            headline: copy.cover.headline,
            height: template.height,
            sourceTaskId: input.task.id,
            storageKey,
            templateId: template.id,
            usage: copy.usage === "effect" ? "effect" : "general",
            width: template.width,
          });
        } catch (error) {
          await removeComposition(storageKey);
          throw error;
        }
      }

      return {
        ...copy,
        aiFallback: {
          configured: aiConfigured,
          requested: input.taskInput.allowAiImage,
          status: aiStatus,
        },
        cover: {
          ...copy.cover,
          compositionId: composition.id,
          downloadUrl:
            `/api/skills/xiaohongshu/runs/${input.task.id}/cover`,
          height: 1440,
          mimeType: "image/png",
          templateId: "xiaohongshu-cover-3x4",
          width: 1080,
        },
        imageSources,
        protocolVersion: XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL,
        publication: { blockedReasons: [], status: "ready" },
        publishReady: true,
        skillId: "xiaohongshu",
      };
    },
  };
}
