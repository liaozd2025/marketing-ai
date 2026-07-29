import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import type { SkillRunResult } from "@marketing-ai/content-skills";
import { Database, tenantId } from "@marketing-ai/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConfiguredSkillRuntime } from "./skill-runtime";
import { AgentWorker } from "./worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration("configured content Skills against PostgreSQL", () => {
  const database = new Database(databaseUrl);
  let merchantAId: string;
  let memberAId: string;
  let merchantBId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const accountA = await database.identity.registerMerchant({
      email: `daily-a-${suffix}@example.test`,
      merchantName: "慢慢护理工作室",
      passwordHash: "unused",
    });
    const accountB = await database.identity.registerMerchant({
      email: `daily-b-${suffix}@example.test`,
      merchantName: "另一个商家",
      passwordHash: "unused",
    });
    merchantAId = accountA.merchant.id;
    memberAId = accountA.member.id;
    merchantBId = accountB.merchant.id;

    const knowledge = database.forTenant(tenantId(merchantAId)).knowledgeBase;
    await knowledge.saveBrandProfile({
      persona: "社区护理工作室主理人阿慢",
      story: "认真做了十年护理，坚持先问感受再安排服务。",
      tabooExpressions: ["包变美"],
      tone: "像熟人聊天，具体、克制",
    });
    const offering = await knowledge.createOffering({
      description: "先沟通日常状态，再做 60 分钟手法放松。",
      fieldValues: {
        offeringType: "service",
        price: 298,
        sellingPoints: "轻重随时沟通，独立安静护理间",
        suitableFor: "久坐、下班后想放松的人",
      },
      name: "晚间肩颈舒缓护理",
    });
    await knowledge.createAudience({
      addressStyle: "姐妹",
      motivations: "安静放松一小时",
      name: "久坐上班族",
      painPoints: "肩颈容易紧绷，又怕被推销",
    });
    await knowledge.createCampaign({
      endsAt: new Date("2026-08-31T15:59:59.000Z"),
      name: "八月晚间预约礼",
      offerDetails: "工作日晚 7 点后预约，到店赠热敷 10 分钟",
      rules: "提前一天预约，每人限一次",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await knowledge.createMemberSegment({
      communicationGoal: "温和提醒，不制造焦虑",
      definition: "连续 60 天未到店的老客分层",
      name: "60 天未到店",
      triggerScenarios: "换季关怀",
    });
    await knowledge.createAsset({
      byteSize: 128,
      isEffectImage: false,
      mimeType: "image/jpeg",
      notes: "傍晚自然光，护理师正在整理床铺",
      offeringId: offering.id,
      originalName: "晚间护理间.jpg",
      scene: "到店日常 护理记录",
      storageKey: `${merchantAId}/${randomUUID()}.jpg`,
    });
  });

  afterAll(async () => {
    await database.close();
  });

  function worker(id: string) {
    return new AgentWorker(
      id,
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database),
    );
  }

  it("persists queued, injects the complete KB in worker, and returns three publishable cards", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, {
      action: "generate",
      capability: "text",
      intent: "今天下雨，语气松弛一点",
      kind: "skill",
      selectedKnowledgeTypes: ["brandProfile", "asset"],
      skillId: "daily-moments",
    });

    await expect(tenantA.getTask(submitted.id)).resolves.toMatchObject({
      attemptCount: 0,
      result: null,
      status: "queued",
    });
    await expect(
      database
        .agentForTenant(tenantId(merchantBId))
        .getTask(submitted.id),
    ).resolves.toBeNull();

    await expect(worker("daily-e2e").runOnce()).resolves.toBe(true);
    const completed = await tenantA.getTask(submitted.id);
    const result = completed?.result as SkillRunResult;
    expect(completed).toMatchObject({
      providerAttempts: [
        { providerId: "test-text", status: "succeeded" },
      ],
      status: "succeeded",
    });
    expect(result.items.map((item) => item.contentType)).toEqual([
      "persona",
      "seeding",
      "campaign",
    ]);
    expect(result.context).toEqual({
      assets: 1,
      audiences: 1,
      brandProfile: 1,
      campaigns: 1,
      memberSegments: 1,
      offerings: 1,
    });
    expect(result.items.every((item) => item.publishReady)).toBe(true);
    expect(result.items[1]).toMatchObject({
      assetSuggestions: [
        expect.objectContaining({
          label: "实拍",
          originalName: "晚间护理间.jpg",
        }),
      ],
    });
    expect(result.items[1].text).toContain("298 元");
    expect(result.items[2].text).toContain("提前一天预约");
  });

  it("marks every prohibited term and prevents publish-ready state", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, {
      action: "generate",
      capability: "text",
      intent: "[[fixture:violation]]",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "daily-moments",
    });
    await worker("daily-violation").runOnce();
    const task = await tenantA.getTask(submitted.id);
    const result = task?.result as SkillRunResult;
    const seeding = result.items.find(
      (item) => item.contentType === "seeding",
    );

    expect(seeding).toMatchObject({
      compliance: { blocked: true },
      publishReady: false,
    });
    expect(seeding?.compliance.hits.map((hit) => hit.term)).toEqual([
      "根治",
      "100%有效",
    ]);
  });

  it("runs the community preset through the same queue, runtime, provider, and compliance path", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, {
      action: "generate",
      capability: "text",
      intent: "准备今天的社群内容",
      kind: "skill",
      selectedKnowledgeTypes: ["brandProfile", "campaign"],
      skillId: "community",
    });

    await expect(worker("community-e2e").runOnce()).resolves.toBe(true);
    const completed = await tenantA.getTask(submitted.id);
    const result = completed?.result as SkillRunResult;

    expect(completed).toMatchObject({
      providerAttempts: [
        { providerId: "test-text", status: "succeeded" },
      ],
      status: "succeeded",
    });
    expect(result).toMatchObject({
      protocolVersion: "marketing-ai.skill-result.v1",
      skillId: "community",
    });
    expect(result.items.map((item) => item.contentType)).toEqual([
      "announcement",
      "campaign-warmup",
      "knowledge-share",
    ]);
    expect(result.items.every((item) => item.publishReady)).toBe(true);
    expect(result.items.every((item) => item.text.startsWith("姐妹们"))).toBe(
      true,
    );
    expect(result.items[0]?.text).toContain("跟大家说一声群内安排");
    expect(result.items[2]?.text).toContain("想和大家聊聊一个常见问题");
    expect(result.items[1]?.text).toContain("提前一天预约");
    expect(result.items[2]?.text).toContain("晚间肩颈舒缓护理");
  });

  it("blocks community copy when the shared compliance finalizer finds a prohibited term", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, {
      action: "generate",
      capability: "text",
      intent: "[[fixture:violation]]",
      kind: "skill",
      selectedKnowledgeTypes: [],
      skillId: "community",
    });
    await worker("community-violation").runOnce();
    const task = await tenantA.getTask(submitted.id);
    const result = task?.result as SkillRunResult;
    const knowledgeShare = result.items.find(
      (item) => item.contentType === "knowledge-share",
    );

    expect(knowledgeShare).toMatchObject({
      compliance: { blocked: true },
      publishReady: false,
    });
    expect(knowledgeShare?.compliance.hits.map((hit) => hit.term)).toEqual([
      "根治",
      "100%有效",
    ]);
  });
});
