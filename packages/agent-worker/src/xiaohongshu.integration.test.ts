import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import {
  readCompositionFile,
  storeAssetFile,
} from "@marketing-ai/asset-storage";
import type { XiaohongshuPackageResult } from "@marketing-ai/content-skills";
import { Database, tenantId } from "@marketing-ai/database";
import { readPngDimensions } from "@marketing-ai/html-renderer";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConfiguredSkillRuntime } from "./skill-runtime";
import { AgentWorker } from "./worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

async function solidPng(
  red: number,
  green: number,
  blue: number,
): Promise<Buffer> {
  return sharp({
    create: {
      background: { b: blue, g: green, r: red },
      channels: 3,
      height: 32,
      width: 32,
    },
  }).png().toBuffer();
}

function fileBytes(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

integration("Xiaohongshu complete package against PostgreSQL and Chromium", () => {
  const database = new Database(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl });
  const previousAssetDirectory = process.env.ASSET_STORAGE_DIR;
  const previousCompositionDirectory = process.env.COMPOSITION_STORAGE_DIR;
  let assetDirectory: string;
  let compositionDirectory: string;
  let merchantAId: string;
  let merchantBId: string;
  let merchantCId: string;
  let memberAId: string;
  let memberCId: string;
  let warmAssetId: string;
  let effectAssetId: string;
  let worker: AgentWorker;

  beforeAll(async () => {
    assetDirectory = await mkdtemp(
      path.join(tmpdir(), "marketing-ai-xhs-assets-"),
    );
    compositionDirectory = await mkdtemp(
      path.join(tmpdir(), "marketing-ai-xhs-compositions-"),
    );
    process.env.ASSET_STORAGE_DIR = assetDirectory;
    process.env.COMPOSITION_STORAGE_DIR = compositionDirectory;
    const suffix = randomUUID();
    const accountA = await database.identity.registerMerchant({
      email: `xhs-a-${suffix}@example.test`,
      merchantName: "秋日护理工作室",
      passwordHash: "unused",
    });
    const accountB = await database.identity.registerMerchant({
      email: `xhs-b-${suffix}@example.test`,
      merchantName: "另一家商户",
      passwordHash: "unused",
    });
    const accountC = await database.identity.registerMerchant({
      email: `xhs-c-${suffix}@example.test`,
      merchantName: "无效果素材商户",
      passwordHash: "unused",
    });
    merchantAId = accountA.merchant.id;
    merchantBId = accountB.merchant.id;
    merchantCId = accountC.merchant.id;
    memberAId = accountA.member.id;
    memberCId = accountC.member.id;
    const tenantA = database.forTenant(tenantId(merchantAId));
    const tenantB = database.forTenant(tenantId(merchantBId));
    const tenantC = database.forTenant(tenantId(merchantCId));
    await Promise.all([
      tenantA.knowledgeBase.saveBrandProfile({
        accentColor: "#F4C7AB",
        fontStyle: "modern",
        persona: "社区护理主理人",
        primaryColor: "#7C3F58",
        story: "坚持记录真实环境和服务过程",
        tabooExpressions: ["包变美"],
        tone: "具体、克制",
      }),
      tenantC.knowledgeBase.saveBrandProfile({
        persona: "真实分享者",
        story: "只使用真实效果素材",
        tabooExpressions: [],
        tone: "克制",
      }),
    ]);
    const offering = await tenantA.knowledgeBase.createOffering({
      description: "先沟通日常状态，再做 60 分钟手法放松。",
      fieldValues: {
        offeringType: "service",
        price: 298,
        sellingPoints: "轻重可随时沟通",
        suitableFor: "久坐、下班后想放松的人",
      },
      name: "秋季肩颈舒缓护理",
    });
    const sources = {
      cool: await solidPng(45, 118, 220),
      effect: await solidPng(211, 128, 70),
      otherTenant: await solidPng(224, 142, 75),
      warm: await solidPng(214, 132, 70),
    };
    const createIndexedAsset = async (
      tenant: typeof tenantA,
      memberId: string,
      name: keyof typeof sources,
      isEffectImage: boolean,
      offeringId: string | null,
    ) => {
      const bytes = sources[name];
      const storageKey = await storeAssetFile(
        tenant === tenantA
          ? tenantId(merchantAId)
          : tenantId(merchantBId),
        new File([fileBytes(bytes)], `${name}.png`, {
          type: "image/png",
        }),
      );
      return tenant.knowledgeBase.createAssetAndQueueIndex(memberId, {
        byteSize: bytes.byteLength,
        isEffectImage,
        mimeType: "image/png",
        notes: name === "warm" ? "秋季暖色自然光" : "",
        offeringId,
        originalName: `${name}.png`,
        scene: isEffectImage ? "真实效果记录" : "护理环境",
        storageKey,
      });
    };
    const [warm, , effect] = await Promise.all([
      createIndexedAsset(
        tenantA,
        memberAId,
        "warm",
        false,
        offering.id,
      ),
      createIndexedAsset(
        tenantA,
        memberAId,
        "cool",
        false,
        offering.id,
      ),
      createIndexedAsset(
        tenantA,
        memberAId,
        "effect",
        true,
        offering.id,
      ),
      createIndexedAsset(
        tenantB,
        accountB.member.id,
        "otherTenant",
        false,
        null,
      ),
    ]);
    warmAssetId = warm.id;
    effectAssetId = effect.id;
    worker = new AgentWorker(
      "xhs-integration",
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database, {
        aiImageFallbackConfigured: false,
      }),
    );
    while (await worker.runOnce()) {
      // Drain only the indexing tasks created by this isolated test database.
    }
  }, 30_000);

  afterAll(async () => {
    if (merchantAId) {
      await pool.query(
        "DELETE FROM merchants WHERE id = ANY($1::uuid[])",
        [[merchantAId, merchantBId, merchantCId]],
      );
    }
    await database.close();
    await pool.end();
    if (previousAssetDirectory === undefined) {
      delete process.env.ASSET_STORAGE_DIR;
    } else {
      process.env.ASSET_STORAGE_DIR = previousAssetDirectory;
    }
    if (previousCompositionDirectory === undefined) {
      delete process.env.COMPOSITION_STORAGE_DIR;
    } else {
      process.env.COMPOSITION_STORAGE_DIR = previousCompositionDirectory;
    }
    if (assetDirectory) {
      await rm(assetDirectory, { force: true, recursive: true });
    }
    if (compositionDirectory) {
      await rm(compositionDirectory, { force: true, recursive: true });
    }
  });

  it("persists a semantic-first complete package and renders exact 1080x1440 cover text", async () => {
    const agent = database.agentForTenant(tenantId(merchantAId));
    const submitted = await agent.submitTask(memberAId, {
      action: "generate",
      allowAiImage: true,
      capability: "text",
      imageUsage: "atmosphere",
      intent: "写一篇秋季暖色氛围的真实护理笔记",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });
    await expect(agent.getTask(submitted.id)).resolves.toMatchObject({
      result: null,
      status: "queued",
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    const completed = await agent.getTask(submitted.id);
    const result = completed?.result as XiaohongshuPackageResult;
    expect(completed).toMatchObject({ status: "succeeded" });
    expect(result).toMatchObject({
      aiFallback: { configured: false, requested: true, status: "not_needed" },
      cover: {
        body: "真实环境 · 真实过程 · 克制分享",
        headline: "下班后，留一小时给自己",
        height: 1440,
        width: 1080,
      },
      publication: { blockedReasons: [], status: "ready" },
      publishReady: true,
      skillId: "xiaohongshu",
    });
    expect(result.imageSources[0]).toMatchObject({
      assetId: warmAssetId,
      isEffectImage: false,
      isReal: true,
      kind: "merchant_asset",
    });
    expect(
      result.imageSources.some(({ originalName }) =>
        originalName?.includes("otherTenant"),
      ),
    ).toBe(false);
    const composition = await database
      .forTenant(tenantId(merchantAId))
      .compositions.get(result.cover.compositionId!);
    expect(composition).toMatchObject({
      body: result.cover.body,
      headline: result.cover.headline,
      sourceTaskId: submitted.id,
    });
    const png = await readCompositionFile(composition!.storageKey);
    expect(readPngDimensions(png)).toEqual({ height: 1440, width: 1080 });
    expect(png.byteLength).toBeGreaterThan(10_000);
    expect(completed?.providerAttempts.map(({ capability }) => capability)).toEqual([
      "text",
      "embedding",
    ]);
  }, 30_000);

  it("uses only real effect assets and never reaches an image provider for effect usage", async () => {
    const agent = database.agentForTenant(tenantId(merchantAId));
    const submitted = await agent.submitTask(memberAId, {
      action: "generate",
      allowAiImage: false,
      capability: "text",
      imageUsage: "effect",
      intent: "写一篇真实效果记录",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });

    await worker.runOnce();
    const completed = await agent.getTask(submitted.id);
    const result = completed?.result as XiaohongshuPackageResult;
    expect(completed).toMatchObject({ status: "succeeded" });
    expect(result.imageSources).toEqual([
      expect.objectContaining({
        assetId: effectAssetId,
        isEffectImage: true,
        isReal: true,
        kind: "merchant_asset",
      }),
    ]);
    expect(
      completed?.providerAttempts.some(
        ({ capability }) => capability === "image",
      ),
    ).toBe(false);

    const unavailableAgent = database.agentForTenant(tenantId(merchantCId));
    const bypassedApi = await unavailableAgent.submitTask(memberCId, {
      action: "generate",
      allowAiImage: true,
      capability: "text",
      imageUsage: "effect",
      intent: "即使请求 AI 也不能生成效果图",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });
    await worker.runOnce();
    const failed = await unavailableAgent.getTask(bypassedApi.id);
    expect(failed).toMatchObject({
      errorCode: "XHS_EFFECT_AI_FORBIDDEN",
      status: "failed",
    });
    expect(
      failed?.providerAttempts.some(({ capability }) => capability === "image"),
    ).toBe(false);
  }, 30_000);

  it("blocks a prohibited cover before search, rendering, or download exists", async () => {
    const agent = database.agentForTenant(tenantId(merchantAId));
    const submitted = await agent.submitTask(memberAId, {
      action: "generate",
      allowAiImage: false,
      capability: "text",
      imageUsage: "atmosphere",
      intent: "[[fixture:cover-violation]]",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });

    await worker.runOnce();
    const completed = await agent.getTask(submitted.id);
    const result = completed?.result as XiaohongshuPackageResult;
    expect(completed).toMatchObject({ status: "succeeded" });
    expect(result).toMatchObject({
      cover: { compositionId: null, downloadUrl: null },
      publication: { blockedReasons: ["compliance"], status: "blocked" },
      publishReady: false,
    });
    expect(result.compliance.fields.coverHeadline.hits).toEqual([
      expect.objectContaining({ term: "根治" }),
    ]);
    expect(completed?.providerAttempts.map(({ capability }) => capability)).toEqual([
      "text",
    ]);
    await expect(
      database
        .agentForTenant(tenantId(merchantBId))
        .getTask(submitted.id),
    ).resolves.toBeNull();
  }, 30_000);

  it("fails clearly instead of pretending to generate an atmosphere image without an external provider", async () => {
    const agent = database.agentForTenant(tenantId(merchantCId));
    const submitted = await agent.submitTask(memberCId, {
      action: "generate",
      allowAiImage: true,
      capability: "text",
      imageUsage: "atmosphere",
      intent: "没有素材时尝试氛围辅路线",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });

    await worker.runOnce();
    const failed = await agent.getTask(submitted.id);
    expect(failed).toMatchObject({
      errorCode: "XHS_AI_IMAGE_NOT_CONFIGURED",
      errorMessage:
        "No indexed tenant atmosphere asset matched and no external image provider is configured",
      status: "failed",
    });
    expect(failed?.providerAttempts.map(({ capability }) => capability)).toEqual([
      "text",
      "embedding",
    ]);
  }, 30_000);

  it("uses the optional image route only for atmosphere usage when explicitly configured", async () => {
    const configuredWorker = new AgentWorker(
      "xhs-configured-image-fallback",
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database, {
        aiImageFallbackConfigured: true,
        fetchGeneratedImage: async () => ({
          bytes: await solidPng(206, 159, 111),
          mimeType: "image/png",
        }),
      }),
    );
    const agent = database.agentForTenant(tenantId(merchantCId));
    const submitted = await agent.submitTask(memberCId, {
      action: "generate",
      allowAiImage: true,
      capability: "text",
      imageUsage: "atmosphere",
      intent: "明确允许氛围辅路线",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "xiaohongshu",
    });

    await configuredWorker.runOnce();
    const completed = await agent.getTask(submitted.id);
    const result = completed?.result as XiaohongshuPackageResult;
    expect(completed).toMatchObject({ status: "succeeded" });
    expect(result).toMatchObject({
      aiFallback: { configured: true, requested: true, status: "used" },
      imageSources: [
        {
          assetId: null,
          isEffectImage: false,
          isReal: false,
          kind: "ai_generated",
        },
      ],
      publication: { status: "ready" },
    });
    expect(completed?.providerAttempts.map(({ capability }) => capability)).toEqual([
      "text",
      "embedding",
      "image",
    ]);
  }, 30_000);
});
