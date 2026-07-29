import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database } from "./database";
import { tenantId } from "./types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const merchantAId = tenantId(randomUUID());
const merchantBId = tenantId(randomUUID());
let database: Database;
let setupPool: Pool;

describeWithDatabase("knowledge-base tenant API against PostgreSQL", () => {
  beforeAll(async () => {
    database = new Database(databaseUrl);
    setupPool = new Pool({ connectionString: databaseUrl });
    await setupPool.query(
      `INSERT INTO merchants (id, slug, name, vertical_pack_id)
       VALUES ($1, $2, 'Merchant A', 'beauty-v1'),
              ($3, $4, 'Merchant B', 'beauty-v1')`,
      [
        merchantAId,
        `merchant-a-${merchantAId.slice(0, 8)}`,
        merchantBId,
        `merchant-b-${merchantBId.slice(0, 8)}`,
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

  it("creates, reads, updates, and deletes a complete six-entity knowledge base", async () => {
    const knowledgeBase = database.forTenant(merchantAId).knowledgeBase;
    const brandProfile = await knowledgeBase.saveBrandProfile({
      accentColor: "#F4C7AB",
      fontStyle: "warm",
      persona: "社区门店主理人",
      primaryColor: "#7C3F58",
      story: "十年真实经营",
      tabooExpressions: ["夸大承诺"],
      tone: "亲切克制",
    });
    const offering = await knowledgeBase.createOffering({
      description: "日常放松服务",
      fieldValues: {
        offeringType: "service",
        price: 398,
        sellingPoints: "真人手法",
        suitableFor: "久坐人群",
      },
      name: "肩颈护理",
    });
    const audience = await knowledgeBase.createAudience({
      addressStyle: "姐妹",
      motivations: "缓解日常紧张感",
      name: "久坐上班族",
      painPoints: "肩颈容易紧张",
    });
    const campaign = await knowledgeBase.createCampaign({
      endsAt: new Date("2026-08-31T16:00:00.000Z"),
      name: "七夕双人活动",
      offerDetails: "双人同行礼",
      rules: "提前一天预约",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const segment = await knowledgeBase.createMemberSegment({
      communicationGoal: "温和提醒复购",
      definition: "60 天未到店的分层定义",
      name: "沉睡会员",
      triggerScenarios: "节日前触达",
    });
    const asset = await knowledgeBase.createAsset({
      byteSize: 128,
      isEffectImage: true,
      mimeType: "image/jpeg",
      notes: "已获门店授权",
      offeringId: offering.id,
      originalName: "真实效果记录.jpg",
      scene: "效果记录",
      storageKey: `${merchantAId}/${randomUUID()}.jpg`,
    });

    await expect(knowledgeBase.getBrandProfile()).resolves.toEqual(
      brandProfile,
    );
    expect(brandProfile).toMatchObject({
      accentColor: "#F4C7AB",
      fontStyle: "warm",
      primaryColor: "#7C3F58",
    });
    await expect(knowledgeBase.listOfferings()).resolves.toEqual([offering]);
    await expect(knowledgeBase.listAudiences()).resolves.toEqual([audience]);
    await expect(knowledgeBase.listCampaigns()).resolves.toEqual([campaign]);
    await expect(knowledgeBase.listMemberSegments()).resolves.toEqual([
      segment,
    ]);
    await expect(knowledgeBase.listAssets()).resolves.toEqual([asset]);

    await expect(
      knowledgeBase.updateOffering(offering.id, {
        ...offering,
        description: "更新后的真实说明",
      }),
    ).resolves.toMatchObject({ description: "更新后的真实说明" });
    await expect(
      knowledgeBase.updateAudience(audience.id, {
        ...audience,
        motivations: "更新动机",
      }),
    ).resolves.toMatchObject({ motivations: "更新动机" });
    await expect(
      knowledgeBase.updateCampaign(campaign.id, {
        ...campaign,
        rules: "更新规则",
      }),
    ).resolves.toMatchObject({ rules: "更新规则" });
    await expect(
      knowledgeBase.updateMemberSegment(segment.id, {
        ...segment,
        communicationGoal: "更新目标",
      }),
    ).resolves.toMatchObject({ communicationGoal: "更新目标" });
    await expect(
      knowledgeBase.updateAssetMetadata(asset.id, {
        isEffectImage: false,
        notes: "更新说明",
        offeringId: null,
        scene: "到店日常",
      }),
    ).resolves.toMatchObject({ notes: "更新说明", offeringId: null });

    await expect(knowledgeBase.deleteAsset(asset.id)).resolves.toMatchObject({
      id: asset.id,
    });
    await expect(knowledgeBase.deleteMemberSegment(segment.id)).resolves.toBe(
      true,
    );
    await expect(knowledgeBase.deleteCampaign(campaign.id)).resolves.toBe(true);
    await expect(knowledgeBase.deleteAudience(audience.id)).resolves.toBe(true);
    await expect(knowledgeBase.deleteOffering(offering.id)).resolves.toBe(true);
    await expect(knowledgeBase.deleteBrandProfile()).resolves.toBe(true);
  });

  it("cannot read, update, or delete another tenant's records", async () => {
    const tenantA = database.forTenant(merchantAId).knowledgeBase;
    const tenantB = database.forTenant(merchantBId).knowledgeBase;
    const offering = await tenantA.createOffering({
      description: "",
      fieldValues: { price: 100 },
      name: "A 的 Offering",
    });
    const segment = await tenantA.createMemberSegment({
      communicationGoal: "提醒",
      definition: "仅分层定义",
      name: "A 的分层",
      triggerScenarios: "节日",
    });

    await expect(tenantB.getOffering(offering.id)).resolves.toBeNull();
    await expect(tenantB.listOfferings()).resolves.toEqual([]);
    await expect(
      tenantB.updateOffering(offering.id, {
        description: "越权修改",
        fieldValues: {},
        name: "B",
      }),
    ).resolves.toBeNull();
    await expect(tenantB.deleteOffering(offering.id)).resolves.toBe(false);
    await expect(tenantB.getMemberSegment(segment.id)).resolves.toBeNull();
    await expect(tenantB.deleteMemberSegment(segment.id)).resolves.toBe(false);

    await tenantA.deleteMemberSegment(segment.id);
    await tenantA.deleteOffering(offering.id);
  });
});
