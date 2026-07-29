import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "./database";
import { tenantId } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("knowledge cold-start tenant API against PostgreSQL", () => {
  const database = new Database(databaseUrl);
  const setupPool = new Pool({ connectionString: databaseUrl });
  let merchantAId: string;
  let memberAId: string;
  let merchantBId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const accountA = await database.identity.registerMerchant({
      email: `cold-start-a-${suffix}@example.test`,
      merchantName: "溪岚护理",
      passwordHash: "unused",
    });
    const accountB = await database.identity.registerMerchant({
      email: `cold-start-b-${suffix}@example.test`,
      merchantName: "另一商家",
      passwordHash: "unused",
    });
    merchantAId = accountA.merchant.id;
    memberAId = accountA.member.id;
    merchantBId = accountB.merchant.id;
  });

  afterAll(async () => {
    if (merchantAId && merchantBId) {
      await setupPool.query(
        "DELETE FROM merchants WHERE id = ANY($1::uuid[])",
        [[merchantAId, merchantBId]],
      );
    }
    await setupPool.end();
    await database.close();
  });

  it("keeps extracted rows outside the knowledge base until each draft is confirmed", async () => {
    const tenantA = database.forTenant(tenantId(merchantAId));
    const tenantB = database.forTenant(tenantId(merchantBId));
    const queued = await tenantA.coldStart.createImportAndQueueExtraction(
      memberAId,
      {
        sourceHash: "a".repeat(64),
        sourceKind: "paste",
        sourceMediaType: "text/plain",
        sourceName: "seed-merchant.md",
        sourceSize: 128,
        sourceText: "品牌与价目表种子资料",
      },
    );

    await expect(tenantA.knowledgeBase.getBrandProfile()).resolves.toBeNull();
    await expect(tenantA.knowledgeBase.listOfferings()).resolves.toEqual([]);
    await expect(tenantB.coldStart.getImport(queued.id)).resolves.toBeNull();

    const drafts = await tenantA.coldStart.storeExtractionDrafts(queued.id, [
      {
        entityType: "brandProfile",
        payload: {
          persona: "社区护理主理人",
          story: "认真经营十年",
          tabooExpressions: [],
          tone: "亲切克制",
        },
      },
      {
        entityType: "offering",
        payload: {
          description: "60 分钟真实服务",
          fieldValues: {
            offeringType: "service",
            price: 298,
            sellingPoints: "轻重可沟通",
            suitableFor: "久坐人群",
          },
          name: "肩颈舒缓护理",
        },
      },
    ]);

    await expect(tenantA.knowledgeBase.getBrandProfile()).resolves.toBeNull();
    await expect(tenantA.knowledgeBase.listOfferings()).resolves.toEqual([]);

    const brandDraft = drafts.find(
      ({ entityType }) => entityType === "brandProfile",
    );
    const offeringDraft = drafts.find(
      ({ entityType }) => entityType === "offering",
    );
    expect(brandDraft && offeringDraft).toBeTruthy();
    await tenantA.coldStart.confirmDraft(brandDraft!.id, {
      entityType: "brandProfile",
      input: {
        persona: "商家修正后的社区主理人",
        story: "认真经营十年",
        tabooExpressions: [],
        tone: "亲切克制",
      },
    });

    await expect(tenantA.knowledgeBase.getBrandProfile()).resolves.toMatchObject({
      persona: "商家修正后的社区主理人",
    });
    await expect(tenantA.knowledgeBase.listOfferings()).resolves.toEqual([]);
    await expect(
      tenantB.coldStart.confirmDraft(offeringDraft!.id, {
        entityType: "offering",
        input: offeringDraft!.payload as never,
      }),
    ).rejects.toThrow("Draft was not found");

    await tenantA.coldStart.rejectDraft(offeringDraft!.id);
    await expect(tenantA.knowledgeBase.listOfferings()).resolves.toEqual([]);
    await expect(tenantA.coldStart.getImport(queued.id)).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("confirms an asset draft only with a real stored-file contract", async () => {
    const tenantA = database.forTenant(tenantId(merchantAId));
    const queued = await tenantA.coldStart.createImportAndQueueExtraction(
      memberAId,
      {
        sourceHash: "c".repeat(64),
        sourceKind: "upload",
        sourceMediaType: "text/markdown",
        sourceName: "素材清单.md",
        sourceSize: 64,
        sourceText: "门头实拍.png：门店环境",
      },
    );
    const [draft] = await tenantA.coldStart.storeExtractionDrafts(queued.id, [
      {
        entityType: "asset",
        payload: {
          isEffectImage: false,
          notes: "",
          originalName: "门头实拍.png",
          scene: "门店环境",
        },
      },
    ]);

    await expect(tenantA.knowledgeBase.listAssets()).resolves.toEqual([]);
    const confirmed = await tenantA.coldStart.confirmDraft(
      draft.id,
      {
        draftPayload: {
          isEffectImage: false,
          notes: "商家已核对原图",
          originalName: "门头实拍.png",
          scene: "门店环境",
        },
        entityType: "asset",
        input: {
          byteSize: 68,
          isEffectImage: false,
          mimeType: "image/png",
          notes: "商家已核对原图",
          offeringId: null,
          originalName: "门头实拍.png",
          scene: "门店环境",
          storageKey: `${merchantAId}/asset-fixture.png`,
        },
      },
      memberAId,
    );

    expect(confirmed).toMatchObject({
      entityType: "asset",
      payload: {
        isEffectImage: false,
        notes: "商家已核对原图",
        originalName: "门头实拍.png",
        scene: "门店环境",
      },
      status: "confirmed",
    });
    await expect(tenantA.knowledgeBase.listAssets()).resolves.toEqual([
      expect.objectContaining({
        indexingStatus: "queued",
        isReal: true,
        mimeType: "image/png",
        originalName: "门头实拍.png",
      }),
    ]);
  });
});
