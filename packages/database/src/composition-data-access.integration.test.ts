import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "./database";
import { tenantId } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const merchantAId = tenantId(randomUUID());
const merchantBId = tenantId(randomUUID());
const memberAId = randomUUID();
const memberBId = randomUUID();
let database: Database;
let setupPool: Pool;

describeWithDatabase("composition tenant storage against PostgreSQL", () => {
  beforeAll(async () => {
    database = new Database(databaseUrl);
    setupPool = new Pool({ connectionString: databaseUrl });
    await setupPool.query(
      `INSERT INTO merchants (id, slug, name, vertical_pack_id)
       VALUES ($1, $2, 'Composition Merchant A', 'beauty-v1'),
              ($3, $4, 'Composition Merchant B', 'beauty-v1')`,
      [
        merchantAId,
        `composition-a-${merchantAId.slice(0, 8)}`,
        merchantBId,
        `composition-b-${merchantBId.slice(0, 8)}`,
      ],
    );
    await setupPool.query(
      `INSERT INTO members (id, merchant_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'test', 'owner'),
              ($4, $5, $6, 'test', 'owner')`,
      [
        memberAId,
        merchantAId,
        `composition-a-${memberAId}@example.com`,
        memberBId,
        merchantBId,
        `composition-b-${memberBId}@example.com`,
      ],
    );
  });

  afterAll(async () => {
    if (setupPool) {
      await setupPool.query(
        "DELETE FROM merchants WHERE id = ANY($1::uuid[])",
        [[merchantAId, merchantBId]],
      );
      await setupPool.end();
    }
    if (database) {
      await database.close();
    }
  });

  it("persists immutable PNG metadata and hides it from another tenant", async () => {
    const tenantA = database.forTenant(merchantAId);
    const tenantB = database.forTenant(merchantBId);
    const asset = await tenantA.knowledgeBase.createAsset({
      byteSize: 256,
      isEffectImage: true,
      mimeType: "image/jpeg",
      notes: "授权素材",
      offeringId: null,
      originalName: "实拍.jpg",
      scene: "效果记录",
      storageKey: `${merchantAId}/${randomUUID()}.jpg`,
    });

    const composition = await tenantA.compositions.create({
      assetId: asset.id,
      body: "真实体验，认真记录。",
      byteSize: 4096,
      createdByMemberId: memberAId,
      headline: "今天也要好好照顾自己",
      height: 1440,
      storageKey: `${merchantAId}/${randomUUID()}.png`,
      templateId: "xiaohongshu-cover-3x4",
      usage: "effect",
      width: 1080,
    });

    await expect(tenantA.compositions.get(composition.id)).resolves.toEqual(
      composition,
    );
    await expect(tenantA.compositions.list()).resolves.toEqual([composition]);
    await expect(tenantB.compositions.get(composition.id)).resolves.toBeNull();
    await expect(tenantB.compositions.list()).resolves.toEqual([]);

    await tenantA.knowledgeBase.deleteAsset(asset.id);
  });
});
