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
import { storeAssetFile } from "@marketing-ai/asset-storage";
import {
  Database,
  embeddingVector,
  tenantId,
} from "@marketing-ai/database";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
      height: 8,
      width: 8,
    },
  }).png().toBuffer();
}

function fileBytes(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

integration("asset multimodal indexing and tenant search", () => {
  const merchantAId = tenantId(randomUUID());
  const merchantBId = tenantId(randomUUID());
  const memberAId = randomUUID();
  const memberBId = randomUUID();
  const pool = new Pool({ connectionString: databaseUrl });
  const database = new Database(databaseUrl);
  const previousStorageDirectory = process.env.ASSET_STORAGE_DIR;
  let storageDirectory: string;

  beforeAll(async () => {
    storageDirectory = await mkdtemp(
      path.join(tmpdir(), "marketing-ai-assets-"),
    );
    process.env.ASSET_STORAGE_DIR = storageDirectory;
    await pool.query(
      `INSERT INTO merchants (id, slug, name)
       VALUES ($1, $2, 'Search A'), ($3, $4, 'Search B')`,
      [
        merchantAId,
        `search-a-${merchantAId.slice(0, 8)}`,
        merchantBId,
        `search-b-${merchantBId.slice(0, 8)}`,
      ],
    );
    await pool.query(
      `INSERT INTO members
         (id, merchant_id, email, password_hash, role)
       VALUES
         ($1, $2, $3, 'unused', 'owner'),
         ($4, $5, $6, 'unused', 'owner')`,
      [
        memberAId,
        merchantAId,
        `${memberAId}@example.test`,
        memberBId,
        merchantBId,
        `${memberBId}@example.test`,
      ],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM merchants WHERE id = ANY($1::uuid[])", [
      [merchantAId, merchantBId],
    ]);
    await database.close();
    await pool.end();
    if (previousStorageDirectory === undefined) {
      delete process.env.ASSET_STORAGE_DIR;
    } else {
      process.env.ASSET_STORAGE_DIR = previousStorageDirectory;
    }
    if (storageDirectory) {
      await rm(storageDirectory, { force: true, recursive: true });
    }
  });

  it("indexes visual bytes, searches with filters, and rejects cross-tenant references", async () => {
    const merchantA = database.forTenant(merchantAId).knowledgeBase;
    const merchantB = database.forTenant(merchantBId).knowledgeBase;
    const autumnOffering = await merchantA.createOffering({
      description: "",
      fieldValues: {},
      name: "秋季护理",
    });
    const summerOffering = await merchantA.createOffering({
      description: "",
      fieldValues: {},
      name: "夏季护理",
    });
    const warmBytes = await solidPng(214, 132, 70);
    const coolBytes = await solidPng(52, 132, 229);
    const otherTenantWarmBytes = await solidPng(220, 140, 72);
    const storageKeys = {
      cool: await storeAssetFile(
        merchantAId,
        new File([fileBytes(coolBytes)], "asset-2.png", {
          type: "image/png",
        }),
      ),
      otherTenantWarm: await storeAssetFile(
        merchantBId,
        new File([fileBytes(otherTenantWarmBytes)], "asset-3.png", {
          type: "image/png",
        }),
      ),
      warm: await storeAssetFile(
        merchantAId,
        new File([fileBytes(warmBytes)], "asset-1.png", {
          type: "image/png",
        }),
      ),
    };
    const warm = await merchantA.createAssetAndQueueIndex(memberAId, {
      byteSize: warmBytes.byteLength,
      isEffectImage: false,
      mimeType: "image/png",
      notes: "",
      offeringId: autumnOffering.id,
      originalName: "asset-1.png",
      scene: "护理记录",
      storageKey: storageKeys.warm,
    });
    const cool = await merchantA.createAssetAndQueueIndex(memberAId, {
      byteSize: coolBytes.byteLength,
      isEffectImage: false,
      mimeType: "image/png",
      notes: "",
      offeringId: summerOffering.id,
      originalName: "asset-2.png",
      scene: "环境展示",
      storageKey: storageKeys.cool,
    });
    const otherTenantWarm = await merchantB.createAssetAndQueueIndex(
      memberBId,
      {
        byteSize: otherTenantWarmBytes.byteLength,
        isEffectImage: false,
        mimeType: "image/png",
        notes: "",
        offeringId: null,
        originalName: "asset-3.png",
        scene: "护理记录",
        storageKey: storageKeys.otherTenantWarm,
      },
    );
    expect(warm.indexingStatus).toBe("queued");
    await expect(merchantB.getAsset(warm.id)).resolves.toBeNull();

    const worker = new AgentWorker(
      "asset-semantic-worker",
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
    );
    await worker.runOnce();
    await worker.runOnce();
    await worker.runOnce();

    await expect(merchantA.getAsset(warm.id)).resolves.toMatchObject({
      indexingError: null,
      indexingStatus: "succeeded",
      indexedAt: expect.any(Date),
    });
    const persisted = await pool.query<{
      dimensions: number;
      embedding_space: string;
      provider_id: string;
    }>(
      `SELECT vector_dims(embedding) AS dimensions, embedding_space, provider_id
       FROM knowledge_item_embeddings
       WHERE merchant_id = $1 AND source_id = $2`,
      [merchantAId, warm.id],
    );
    expect(persisted.rows[0]).toEqual({
      dimensions: 1536,
      embedding_space: "deterministic-visual-v1:1536",
      provider_id: "test-embedding",
    });

    const searchTask = await database
      .agentForTenant(merchantAId)
      .submitAssetSearch(memberAId, {
        limit: 10,
        offeringId: null,
        query: "适合秋季护肤氛围的图",
        scene: null,
      });
    await worker.runOnce();
    const completedSearch = await database
      .agentForTenant(merchantAId)
      .getTask(searchTask.id);
    expect(completedSearch).toMatchObject({ status: "succeeded" });
    const result = completedSearch!.result as {
      embeddingSpace: string;
      embeddings: unknown[];
    };
    const unfiltered = await merchantA.searchAssets(
      embeddingVector(result.embeddings[0]),
      result.embeddingSpace,
      { limit: 10, offeringId: null, scene: null },
    );
    expect(unfiltered.map(({ asset }) => asset.id)).toEqual([warm.id, cool.id]);
    expect(unfiltered.some(
      ({ asset }) => asset.id === otherTenantWarm.id,
    )).toBe(false);
    await expect(merchantA.searchAssets(
      embeddingVector(result.embeddings[0]),
      "incompatible-model-space:1536",
      { limit: 10, offeringId: null, scene: null },
    )).resolves.toEqual([]);

    const filtered = await merchantA.searchAssets(
      embeddingVector(result.embeddings[0]),
      result.embeddingSpace,
      {
        limit: 10,
        offeringId: summerOffering.id,
        scene: "环境展示",
      },
    );
    expect(filtered.map(({ asset }) => asset.id)).toEqual([cool.id]);

    await expect(
      pool.query(
        `UPDATE assets
         SET indexing_task_id = $1
         WHERE merchant_id = $2 AND id = $3`,
        [otherTenantWarm.indexingTaskId, merchantAId, warm.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        `UPDATE knowledge_item_embeddings
         SET task_id = $1
         WHERE merchant_id = $2 AND source_id = $3`,
        [otherTenantWarm.indexingTaskId, merchantAId, warm.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const video = await merchantA.createAssetAndQueueIndex(memberAId, {
      byteSize: 4,
      isEffectImage: false,
      mimeType: "video/mp4",
      notes: "",
      offeringId: null,
      originalName: "asset-4.mp4",
      scene: "环境展示",
      storageKey: `${merchantAId}/asset-4.mp4`,
    });
    await worker.runOnce();
    await expect(merchantA.getAsset(video.id)).resolves.toMatchObject({
      indexingStatus: "failed",
    });
    await expect(
      merchantA.retryAssetIndex(video.id, memberAId),
    ).resolves.toMatchObject({ indexingStatus: "queued" });
  }, 30_000);
});
