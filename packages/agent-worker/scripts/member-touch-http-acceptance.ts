import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import type { MemberTouchRunResult } from "@marketing-ai/content-skills";
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
  if (!condition) throw new Error(message);
}

const database = new Database(databaseUrl);
try {
  const suffix = randomUUID();
  const accountA = await database.identity.registerMerchant({
    email: `member-http-a-${suffix}@example.test`,
    merchantName: "HTTP 慢慢护理",
    passwordHash: "unused",
  });
  const accountB = await database.identity.registerMerchant({
    email: `member-http-b-${suffix}@example.test`,
    merchantName: "HTTP 另一商家",
    passwordHash: "unused",
  });
  const knowledge = database.forTenant(
    tenantId(accountA.merchant.id),
  ).knowledgeBase;
  await knowledge.saveBrandProfile({
    persona: "社区主理人",
    story: "十年认真经营",
    tabooExpressions: ["如有需要"],
    tone: "亲切克制",
  });
  await knowledge.createOffering({
    description: "60 分钟真实服务",
    fieldValues: {
      offeringType: "package",
      price: 998,
      sellingPoints: "轻重可沟通",
      suitableFor: "想规律安排护理的人",
    },
    name: "舒缓护理卡",
  });
  await knowledge.createCampaign({
    endsAt: new Date("2026-08-31T00:00:00Z"),
    name: "八月预约礼",
    offerDetails: "赠热敷十分钟",
    rules: "提前一天预约",
    startsAt: new Date("2026-08-01T00:00:00Z"),
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
    triggerScenarios: "换季关怀",
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
  const page = await fetch(`${baseUrl}/workspace/content/member-touch`, {
    headers: { cookie: cookieA },
  });
  const pageHtml = await page.text();
  assert(page.status === 200, `member-touch page returned ${page.status}`);
  assert(
    pageHtml.includes("平台零 PII") &&
      pageHtml.includes("生成全部话术") &&
      pageHtml.includes("{{member_salutation}}"),
    "member-touch workbench did not render its zero-PII guidance",
  );

  const rejectedPii = await fetch(
    `${baseUrl}/api/skills/member-touch/runs`,
    {
      body: JSON.stringify({
        member_name: "张女士",
        member_phone: "13800138000",
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  assert(
    rejectedPii.status === 400,
    `PII-bearing request returned ${rejectedPii.status}`,
  );

  const submittedResponse = await fetch(
    `${baseUrl}/api/skills/member-touch/runs`,
    {
      body: "{}",
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  assert(
    submittedResponse.status === 202,
    `member-touch submit returned ${submittedResponse.status}`,
  );
  const submitted = (await submittedResponse.json()) as { task_id: string };
  const queuedResponse = await fetch(
    `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
    { headers: { cookie: cookieA } },
  );
  const queued = (await queuedResponse.json()) as { status: string };
  assert(queued.status === "queued", "task was not observably queued");

  const crossTenant = await fetch(
    `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
    { headers: { cookie: cookie(accountB) } },
  );
  assert(
    crossTenant.status === 404,
    `cross-tenant task lookup returned ${crossTenant.status}`,
  );

  const worker = new AgentWorker(
    "member-touch-http-acceptance",
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
  assert(await worker.runOnce(), "worker did not claim the submitted task");
  const completedResponse = await fetch(
    `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
    { headers: { cookie: cookieA } },
  );
  const completed = (await completedResponse.json()) as {
    result: MemberTouchRunResult;
    status: string;
  };
  assert(completed.status === "succeeded", "worker task did not succeed");
  assert(
    completed.result.protocolVersion ===
      "marketing-ai.member-touch-result.v1",
    "member-touch result protocol is invalid",
  );
  assert(
    completed.result.cells.length === 14,
    `expected 14 complete matrix cells, got ${completed.result.cells.length}`,
  );
  assert(
    completed.result.cells.every(
      (cell) =>
        cell.alternatives.length >= 2 &&
        cell.alternatives.length <= 3 &&
        cell.alternatives.every(
          (alternative) => alternative.placeholders.length > 0,
        ),
    ),
    "one or more matrix cells violated the 2-3 alternative contract",
  );
  const alternatives = completed.result.cells.flatMap(
    (cell) => cell.alternatives,
  );
  assert(
    alternatives.some(
      (alternative) =>
        !alternative.copyReady &&
        alternative.compliance.hits.some((hit) => hit.term === "如有需要"),
    ),
    "compliance post-processing did not block copying",
  );
  assert(
    alternatives.some((alternative) => alternative.copyReady),
    "compliant alternatives were not copy-ready",
  );
  assert(
    !/(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])|\b\d{17}[\dXx]\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
      JSON.stringify(completed.result),
    ),
    "result unexpectedly contains PII-shaped values",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        alternatives: alternatives.length,
        blockedAlternatives: alternatives.filter(
          (alternative) => !alternative.copyReady,
        ).length,
        cells: completed.result.cells.length,
        crossTenantStatus: crossTenant.status,
        pageStatus: page.status,
        piiRequestStatus: rejectedPii.status,
        queuedStatus: queued.status,
        resultStatus: completed.status,
        scenarios: completed.result.scenarios,
        submitStatus: submittedResponse.status,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await database.close();
}
