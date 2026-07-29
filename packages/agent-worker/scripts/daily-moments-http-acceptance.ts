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
  const page = await fetch(`${baseUrl}/workspace/content/new`, {
    headers: { cookie: cookieA },
  });
  const pageHtml = await page.text();
  const submittedResponse = await fetch(
    `${baseUrl}/api/skills/daily-moments/runs`,
    {
      body: JSON.stringify({
        intent: "今天下雨，语气松弛一点",
        selected_knowledge_types: ["brandProfile", "asset"],
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const submitted = (await submittedResponse.json()) as { task_id: string };
  const queued = (await (
    await fetch(`${baseUrl}/api/agent/tasks/${submitted.task_id}`, {
      headers: { cookie: cookieA },
    })
  ).json()) as { status: string };
  const crossTenant = await fetch(
    `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
    { headers: { cookie: cookie(accountB) } },
  );
  const worker = new AgentWorker(
    "http-acceptance",
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
  await worker.runOnce();
  const completed = (await (
    await fetch(`${baseUrl}/api/agent/tasks/${submitted.task_id}`, {
      headers: { cookie: cookieA },
    })
  ).json()) as {
    result: {
      context: Record<string, number>;
      items: { contentType: string; publishReady: boolean }[];
    };
    status: string;
  };
  const violationResponse = await fetch(
    `${baseUrl}/api/skills/daily-moments/runs`,
    {
      body: JSON.stringify({ intent: "[[fixture:violation]]" }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const violationSubmitted = (await violationResponse.json()) as {
    task_id: string;
  };
  await worker.runOnce();
  const violation = (await (
    await fetch(`${baseUrl}/api/agent/tasks/${violationSubmitted.task_id}`, {
      headers: { cookie: cookieA },
    })
  ).json()) as {
    result: {
      items: {
        compliance: { hits: { term: string }[] };
        contentType: string;
        publishReady: boolean;
        text: string;
      }[];
    };
  };
  const violationItem = violation.result.items.find(
    (item) => item.contentType === "seeding",
  );
  if (!violationItem) throw new Error("Violation fixture item is missing");
  const rewriteResponse = await fetch(
    `${baseUrl}/api/skills/daily-moments/runs`,
    {
      body: JSON.stringify({
        action: "compliance_rewrite",
        content_type: "seeding",
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
  const rewritten = (await (
    await fetch(`${baseUrl}/api/agent/tasks/${rewriteSubmitted.task_id}`, {
      headers: { cookie: cookieA },
    })
  ).json()) as {
    result: { items: { publishReady: boolean }[] };
  };

  process.stdout.write(
    `${JSON.stringify(
      {
        context: completed.result.context,
        crossTenantStatus: crossTenant.status,
        pageHasWorkbench:
          pageHtml.includes("一键生成今天的朋友圈") &&
          pageHtml.includes("本次参考的知识库上下文"),
        pageStatus: page.status,
        publishReady: completed.result.items.map((item) => item.publishReady),
        queuedStatus: queued.status,
        resultStatus: completed.status,
        submitStatus: submittedResponse.status,
        types: completed.result.items.map((item) => item.contentType),
        violationPublishReady: violationItem.publishReady,
        violationSubmitStatus: violationResponse.status,
        violationTerms: violationItem.compliance.hits.map((hit) => hit.term),
        rewrittenPublishReady: rewritten.result.items[0]?.publishReady,
        rewriteSubmitStatus: rewriteResponse.status,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await database.close();
}
