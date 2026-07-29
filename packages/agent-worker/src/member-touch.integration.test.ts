import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
  type TextProvider,
} from "@marketing-ai/agent-service";
import type { MemberTouchRunResult } from "@marketing-ai/content-skills";
import { Database, tenantId } from "@marketing-ai/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConfiguredSkillRuntime } from "./skill-runtime";
import { AgentWorker } from "./worker";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

function memberTouchInput() {
  return {
    action: "generate" as const,
    capability: "text" as const,
    intent: "按会员分层与触达场景生成零 PII 话术模板",
    kind: "skill" as const,
    selectedKnowledgeTypes: [] as const,
    skillId: "member-touch",
  };
}

class ViolatingMemberTouchProvider implements TextProvider {
  readonly capability = "text";
  readonly id = "violating-member-touch";

  async generate(request: Parameters<TextProvider["generate"]>[0]) {
    const payload = JSON.parse(request.messages[1].content) as {
      matrix: { scenario: string; segmentKey: string }[];
    };
    return {
      text: JSON.stringify({
        cells: payload.matrix.map((cell, index) => ({
          ...cell,
          alternatives: [
            index === 0
              ? "{{member_salutation}}，这项服务可以根治问题。"
              : `{{member_salutation}}，这是${cell.scenario}的第一条话术。`,
            `{{member_salutation}}，这是${cell.scenario}的第二条话术。`,
          ],
        })),
        protocolVersion: "marketing-ai.member-touch-output.v1",
      }),
    };
  }
}

integration("member lifecycle touch tracer against PostgreSQL", () => {
  const database = new Database(databaseUrl);
  let merchantAId: string;
  let memberAId: string;
  let merchantBId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    const accountA = await database.identity.registerMerchant({
      email: `member-touch-a-${suffix}@example.test`,
      merchantName: "慢慢护理工作室",
      passwordHash: "unused",
    });
    const accountB = await database.identity.registerMerchant({
      email: `member-touch-b-${suffix}@example.test`,
      merchantName: "另一家商户",
      passwordHash: "unused",
    });
    merchantAId = accountA.merchant.id;
    memberAId = accountA.member.id;
    merchantBId = accountB.merchant.id;
    const knowledge = database.forTenant(tenantId(merchantAId)).knowledgeBase;
    await knowledge.saveBrandProfile({
      persona: "社区护理工作室",
      story: "坚持先问感受再安排服务",
      tabooExpressions: [],
      tone: "亲切克制",
    });
    await knowledge.createOffering({
      description: "先沟通再安排 60 分钟护理",
      fieldValues: {
        offeringType: "package",
        price: 998,
        sellingPoints: "每次到店前确认状态",
        suitableFor: "希望规律安排护理的人",
      },
      name: "舒缓护理卡",
    });
    await knowledge.createCampaign({
      endsAt: new Date("2026-08-31T15:59:59.000Z"),
      name: "八月预约礼",
      offerDetails: "提前预约赠热敷十分钟",
      rules: "每人限一次",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await knowledge.createMemberSegment({
      communicationGoal: "说明首次到店后的服务方式",
      definition: "首次到店后 7 天内的新客分层",
      name: "新客",
      triggerScenarios: "首次关怀",
    });
    await knowledge.createMemberSegment({
      communicationGoal: "温和提醒，不制造焦虑",
      definition: "连续 60 天未到店的老客分层",
      name: "60 天未到店",
      triggerScenarios: "换季关怀、周年回访",
    });
  });

  afterAll(async () => {
    await database.close();
  });

  function worker(id: string, textProvider: TextProvider) {
    return new AgentWorker(
      id,
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [textProvider],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database),
    );
  }

  it("persists only a zero-PII request, stays queued until worker, and returns every matrix cell", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, memberTouchInput());
    const queued = await tenantA.getTask(submitted.id);

    expect(queued).toMatchObject({
      attemptCount: 0,
      input: {
        action: "generate",
        intent: "按会员分层与触达场景生成零 PII 话术模板",
        kind: "skill",
        selectedKnowledgeTypes: [],
        skillId: "member-touch",
      },
      result: null,
      status: "queued",
    });
    expect(JSON.stringify(queued?.input)).not.toMatch(
      /member_name|member_phone|phone|email/i,
    );
    await expect(
      database
        .agentForTenant(tenantId(merchantBId))
        .getTask(submitted.id),
    ).resolves.toBeNull();

    await expect(
      worker("member-touch-e2e", new DeterministicTextProvider()).runOnce(),
    ).resolves.toBe(true);
    const completed = await tenantA.getTask(submitted.id);
    const result = completed?.result as MemberTouchRunResult;
    expect(completed).toMatchObject({
      providerAttempts: [
        { providerId: "test-text", status: "succeeded" },
      ],
      status: "succeeded",
    });
    expect(result.scenarios).toEqual([
      "新客欢迎",
      "复购唤醒",
      "沉睡唤醒",
      "卡项到期",
      "生日关怀",
      "换季关怀",
      "周年回访",
      "首次关怀",
    ]);
    expect(result.cells).toHaveLength(16);
    expect(
      result.cells.every(
        (cell) =>
          cell.alternatives.length >= 2 &&
          cell.alternatives.length <= 3 &&
          cell.alternatives.every(
            (alternative) =>
              alternative.copyReady && alternative.placeholders.length > 0,
          ),
      ),
    ).toBe(true);
  });

  it("blocks copying a provider alternative that hits the generic lexicon", async () => {
    const tenantA = database.agentForTenant(tenantId(merchantAId));
    const submitted = await tenantA.submitTask(memberAId, memberTouchInput());
    await worker(
      "member-touch-violation",
      new ViolatingMemberTouchProvider(),
    ).runOnce();
    const completed = await tenantA.getTask(submitted.id);
    const result = completed?.result as MemberTouchRunResult;

    expect(result.cells[0].alternatives[0]).toMatchObject({
      compliance: {
        blocked: true,
        hits: [expect.objectContaining({ term: "根治" })],
      },
      copyReady: false,
    });
    expect(result.cells[0].alternatives[1].copyReady).toBe(true);
  });
});
