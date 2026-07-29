import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import { Database, tenantId } from "@marketing-ai/database";

import { signSession } from "../../../apps/web/src/lib/session-token";
import { ConfiguredSkillRuntime } from "../src/skill-runtime";
import { AgentWorker } from "../src/worker";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? "http://localhost:3105";
if (!databaseUrl || !sessionSecret) {
  throw new Error("DATABASE_URL and SESSION_SECRET are required");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`HTTP acceptance failed: ${message}`);
  }
}

const database = new Database(databaseUrl);
try {
  const suffix = randomUUID();
  const accountA = await database.identity.registerMerchant({
    email: `http-a-${suffix}@example.test`,
    merchantName: "HTTP 慢慢护理",
    passwordHash: "unused",
  });
  const accountB = await database.identity.registerMerchant({
    email: `http-b-${suffix}@example.test`,
    merchantName: "HTTP 另一商家",
    passwordHash: "unused",
  });
  const knowledge = database.forTenant(
    tenantId(accountA.merchant.id),
  ).knowledgeBase;
  await knowledge.saveBrandProfile({
    persona: "社区主理人",
    story: "十年认真经营",
    tabooExpressions: [],
    tone: "亲切克制",
  });
  const offering = await knowledge.createOffering({
    description: "60 分钟真实服务",
    fieldValues: {
      offeringType: "service",
      price: 298,
      sellingPoints: "轻重可沟通",
      suitableFor: "久坐上班族",
    },
    name: "晚间肩颈舒缓护理",
  });
  await knowledge.createAudience({
    addressStyle: "姐妹",
    motivations: "放松一小时",
    name: "久坐上班族",
    painPoints: "肩颈紧绷",
  });
  await knowledge.createCampaign({
    endsAt: new Date("2026-08-31T00:00:00Z"),
    name: "八月预约礼",
    offerDetails: "赠热敷十分钟",
    rules: "提前一天预约",
    startsAt: new Date("2026-08-01T00:00:00Z"),
  });
  await knowledge.createMemberSegment({
    communicationGoal: "温和提醒",
    definition: "60 天未到店分层",
    name: "60 天未到店",
    triggerScenarios: "换季",
  });
  await knowledge.createAsset({
    byteSize: 128,
    isEffectImage: false,
    mimeType: "image/jpeg",
    notes: "晚间自然光",
    offeringId: offering.id,
    originalName: "晚间护理间.jpg",
    scene: "到店日常 护理记录",
    storageKey: `${accountA.merchant.id}/${randomUUID()}.jpg`,
  });

  const cookie = (account: typeof accountA) =>
    `marketing_ai_session=${signSession(
      {
        expiresAt: Date.now() + 600_000,
        memberId: account.member.id,
        merchantId: account.merchant.id,
      },
      sessionSecret,
    )}`;
  const cookieA = cookie(accountA);
  const task = async (taskId: string, sessionCookie = cookieA) =>
    (await (
      await fetch(`${baseUrl}/api/agent/tasks/${taskId}`, {
        headers: { cookie: sessionCookie },
      })
    ).json()) as {
      provider_attempts: { provider_id: string; status: string }[];
      result: {
        context: Record<string, number>;
        items: {
          compliance: { hits: { term: string }[] };
          contentType: string;
          publishReady: boolean;
          text: string;
        }[];
        protocolVersion: string;
        skillId: string;
      };
      status: string;
    };
  const submit = async (skillId: string, intent: string) => {
    const response = await fetch(`${baseUrl}/api/skills/${skillId}/runs`, {
      body: JSON.stringify({
        intent,
        selected_knowledge_types: ["brandProfile", "campaign"],
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as { task_id: string };
    return { body, response };
  };
  const page = await fetch(`${baseUrl}/workspace/content/new`, {
    headers: { cookie: cookieA },
  });
  const pageHtml = await page.text();
  const worker = new AgentWorker(
    "content-skills-http-acceptance",
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

  const dailySubmitted = await submit(
    "daily-moments",
    "今天下雨，语气松弛一点",
  );
  await worker.runOnce();
  const daily = await task(dailySubmitted.body.task_id);

  const communitySubmitted = await submit(
    "community",
    "准备今天的社群内容",
  );
  const queued = await task(communitySubmitted.body.task_id);
  const crossTenant = await fetch(
    `${baseUrl}/api/agent/tasks/${communitySubmitted.body.task_id}`,
    { headers: { cookie: cookie(accountB) } },
  );
  await worker.runOnce();
  const community = await task(communitySubmitted.body.task_id);

  const violationSubmitted = await submit(
    "community",
    "[[fixture:violation]]",
  );
  await worker.runOnce();
  const violation = await task(violationSubmitted.body.task_id);
  const violationItem = violation.result.items.find(
    (item) => item.contentType === "knowledge-share",
  );
  if (!violationItem) throw new Error("Violation fixture item is missing");
  const rewriteResponse = await fetch(
    `${baseUrl}/api/skills/community/runs`,
    {
      body: JSON.stringify({
        action: "compliance_rewrite",
        content_type: "knowledge-share",
        source_text: violationItem.text,
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const rewriteSubmitted = (await rewriteResponse.json()) as {
    task_id: string;
  };
  await worker.runOnce();
  const rewritten = await task(rewriteSubmitted.task_id);

  const pageHasWorkbench =
    pageHtml.includes("朋友圈日更") &&
    pageHtml.includes("社群运营") &&
    pageHtml.includes("群公告") &&
    pageHtml.includes("专业知识分享") &&
    pageHtml.includes("本次参考的知识库上下文");
  const evidence = {
    community: {
      context: community.result.context,
      provider: community.provider_attempts[0]?.provider_id,
      protocol: community.result.protocolVersion,
      publishReady: community.result.items.map((item) => item.publishReady),
      resultStatus: community.status,
      types: community.result.items.map((item) => item.contentType),
    },
    crossTenantStatus: crossTenant.status,
    dailyMoments: {
      provider: daily.provider_attempts[0]?.provider_id,
      protocol: daily.result.protocolVersion,
      resultStatus: daily.status,
      types: daily.result.items.map((item) => item.contentType),
    },
    pageHasWorkbench,
    pageStatus: page.status,
    queuedStatus: queued.status,
    submitStatus: communitySubmitted.response.status,
    violationPublishReady: violationItem.publishReady,
    violationSubmitStatus: violationSubmitted.response.status,
    violationTerms: violationItem.compliance.hits.map((hit) => hit.term),
    rewrittenPublishReady: rewritten.result.items[0]?.publishReady,
    rewriteSubmitStatus: rewriteResponse.status,
  };
  assert(evidence.pageStatus === 200 && pageHasWorkbench, "shared workbench UI");
  assert(evidence.submitStatus === 202, "community submit must return 202");
  assert(evidence.queuedStatus === "queued", "task must be queued before worker");
  assert(
    evidence.community.resultStatus === "succeeded",
    "community worker result",
  );
  assert(evidence.crossTenantStatus === 404, "cross-tenant task isolation");
  assert(
    JSON.stringify(evidence.community.types) ===
      JSON.stringify([
        "announcement",
        "campaign-warmup",
        "knowledge-share",
      ]),
    "community preset output types",
  );
  assert(
    evidence.community.publishReady.every(Boolean),
    "all compliant community items must be publishable",
  );
  assert(
    evidence.dailyMoments.provider === evidence.community.provider &&
      evidence.dailyMoments.protocol === evidence.community.protocol,
    "daily moments and community must share provider and result protocol",
  );
  assert(
    evidence.violationSubmitStatus === 202 &&
      evidence.violationPublishReady === false &&
      JSON.stringify(evidence.violationTerms) ===
        JSON.stringify(["根治", "100%有效"]),
    "shared compliance path must block every prohibited term",
  );
  assert(
    evidence.rewriteSubmitStatus === 202 &&
      evidence.rewrittenPublishReady === true,
    "async compliance rewrite",
  );

  process.stdout.write(
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
} finally {
  await database.close();
}
