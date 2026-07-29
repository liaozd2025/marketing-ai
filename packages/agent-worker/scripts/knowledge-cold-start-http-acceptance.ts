import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import { removeAssetFile } from "@marketing-ai/asset-storage";
import { Database, tenantId } from "@marketing-ai/database";
import { Pool } from "pg";
import sharp from "sharp";

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
    throw new Error(`Cold-start HTTP acceptance failed: ${message}`);
  }
}

interface ImportResponse {
  readonly drafts: readonly {
    readonly entity_type: string;
    readonly id: string;
    readonly payload: Record<string, unknown>;
    readonly status: string;
  }[];
  readonly id: string;
  readonly status: string;
  readonly task: {
    readonly provider_attempts: readonly {
      readonly provider_id: string;
      readonly status: string;
    }[];
    readonly result: {
      readonly counts: Readonly<Record<string, number>>;
      readonly draftCount: number;
      readonly protocolVersion: string;
    } | null;
    readonly status: string;
  };
}

interface SummaryItem {
  readonly count: number;
  readonly type: string;
}

const database = new Database(databaseUrl);
const cleanup = new Pool({ connectionString: databaseUrl });
const startedAt = Date.now();
let merchantIds: string[] = [];
try {
  const suffix = randomUUID();
  const accountA = await database.identity.registerMerchant({
    email: `cold-http-a-${suffix}@example.test`,
    merchantName: "溪岚护理",
    passwordHash: "unused",
  });
  const accountB = await database.identity.registerMerchant({
    email: `cold-http-b-${suffix}@example.test`,
    merchantName: "另一商家",
    passwordHash: "unused",
  });
  merchantIds = [accountA.merchant.id, accountB.merchant.id];
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
  const cookieB = cookie(accountB);
  const fixture = await readFile(
    new URL("../fixtures/seed-merchant.md", import.meta.url),
    "utf8",
  );
  const seedAsset = await sharp({
    create: {
      background: { b: 120, g: 150, r: 180 },
      channels: 3,
      height: 2,
      width: 2,
    },
  })
    .png()
    .toBuffer();
  const worker = new AgentWorker(
    "knowledge-cold-start-http-acceptance",
    database.agentQueue,
    new ProviderRouter(
      {
        embedding: [new DeterministicEmbeddingProvider()],
        image: [new DeterministicImageProvider()],
        text: [new DeterministicTextProvider("deterministic-contract")],
      },
      database.agentQueue,
    ),
    new ConfiguredSkillRuntime(database),
  );
  const getImport = async (id: string, sessionCookie = cookieA) => {
    const response = await fetch(
      `${baseUrl}/api/knowledge-base/imports/${id}`,
      { headers: { cookie: sessionCookie } },
    );
    return {
      body: (await response.json()) as ImportResponse,
      status: response.status,
    };
  };
  const getSummary = async () =>
    (await (
      await fetch(`${baseUrl}/api/knowledge-base/summary`, {
        headers: { cookie: cookieA },
      })
    ).json()) as SummaryItem[];
  const summaryCounts = (items: readonly SummaryItem[]) =>
    Object.fromEntries(items.map((item) => [item.type, item.count]));

  const unauthorized = await fetch(
    `${baseUrl}/api/knowledge-base/imports`,
  );
  const injected = await fetch(
    `${baseUrl}/api/knowledge-base/imports`,
    {
      body: JSON.stringify({
        merchant_id: accountB.merchant.id,
        text: fixture,
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const piiSubmission = await fetch(
    `${baseUrl}/api/knowledge-base/imports`,
    {
      body: JSON.stringify({
        text: "会员姓名：张三，微信号：zhangsan_88，准备做沉睡唤醒。",
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const submittedResponse = await fetch(
    `${baseUrl}/api/knowledge-base/imports`,
    {
      body: JSON.stringify({
        source_name: "溪岚护理种子资料.md",
        text: fixture,
      }),
      headers: { cookie: cookieA, "content-type": "application/json" },
      method: "POST",
    },
  );
  const submitted = (await submittedResponse.json()) as {
    import_id: string;
    task_id: string;
  };
  const queued = await getImport(submitted.import_id);
  const crossTenant = await getImport(submitted.import_id, cookieB);
  const beforeWorker = summaryCounts(await getSummary());

  assert(await worker.runOnce(), "worker did not claim pasted material");
  const extracted = await getImport(submitted.import_id);
  const afterExtraction = summaryCounts(await getSummary());
  assert(extracted.body.drafts.length === 6, "expected six entity drafts");
  assert(
    Object.values(afterExtraction).every((count) => count === 0),
    "extraction must not write any knowledge entity",
  );

  const brandDraft = extracted.body.drafts.find(
    ({ entity_type }) => entity_type === "brandProfile",
  );
  assert(brandDraft, "brand profile draft missing");
  const confirm = async (
    draft: ImportResponse["drafts"][number],
    payload = draft.payload,
  ) => {
    let body: BodyInit;
    let headers: HeadersInit;
    if (draft.entity_type === "asset") {
      const form = new FormData();
      form.set("action", "confirm");
      form.set("payload", JSON.stringify(payload));
      form.set(
        "file",
        new File(
          [Uint8Array.from(seedAsset)],
          "溪岚护理门店实拍.png",
          { type: "image/png" },
        ),
      );
      body = form;
      headers = { cookie: cookieA };
    } else {
      body = JSON.stringify({ action: "confirm", payload });
      headers = { cookie: cookieA, "content-type": "application/json" };
    }
    const response = await fetch(
      `${baseUrl}/api/knowledge-base/imports/${submitted.import_id}/drafts/${draft.id}`,
      {
        body,
        headers,
        method: "PATCH",
      },
    );
    assert(response.status === 200, `confirm ${draft.entity_type}`);
  };
  await confirm(brandDraft, {
    ...brandDraft.payload,
    persona: "商家逐项修正后的社区护理主理人",
  });
  const afterOneConfirmation = summaryCounts(await getSummary());
  assert(
    afterOneConfirmation.brandProfile === 1 &&
      afterOneConfirmation.offering === 0 &&
      afterOneConfirmation.audience === 0,
    "only the confirmed draft may enter the knowledge base",
  );

  for (const draft of extracted.body.drafts) {
    if (draft.id === brandDraft.id) continue;
    await confirm(
      draft,
      draft.entity_type === "audience"
        ? { ...draft.payload, addressStyle: "朋友们" }
        : draft.payload,
    );
  }
  const completed = await getImport(submitted.import_id);
  const finalSummary = summaryCounts(await getSummary());
  const confirmedAssets = await database
    .forTenant(tenantId(accountA.merchant.id))
    .knowledgeBase.listAssets();
  assert(confirmedAssets.length === 1, "confirmed real asset missing");
  assert(
    confirmedAssets[0]?.indexingStatus === "queued",
    "asset index task was not queued",
  );
  assert(await worker.runOnce(), "worker did not index confirmed asset");
  const indexedAsset = await database
    .forTenant(tenantId(accountA.merchant.id))
    .knowledgeBase.getAsset(confirmedAssets[0].id);
  const correctedAudience = await database
    .forTenant(tenantId(accountA.merchant.id))
    .knowledgeBase.listAudiences();

  const upload = new FormData();
  upload.set(
    "file",
    new File([fixture], "溪岚护理上传资料.md", { type: "text/markdown" }),
  );
  const uploadResponse = await fetch(
    `${baseUrl}/api/knowledge-base/imports`,
    {
      body: upload,
      headers: { cookie: cookieA },
      method: "POST",
    },
  );
  const uploadSubmitted = (await uploadResponse.json()) as {
    import_id: string;
  };
  assert(await worker.runOnce(), "worker did not claim uploaded material");
  const uploaded = await getImport(uploadSubmitted.import_id);
  for (const draft of uploaded.body.drafts) {
    const response = await fetch(
      `${baseUrl}/api/knowledge-base/imports/${uploaded.body.id}/drafts/${draft.id}`,
      {
        body: JSON.stringify({ action: "reject" }),
        headers: { cookie: cookieA, "content-type": "application/json" },
        method: "PATCH",
      },
    );
    assert(response.status === 200, "uploaded draft rejection");
  }
  const page = await fetch(`${baseUrl}/workspace/knowledge-base`, {
    headers: { cookie: cookieA },
  });
  const pageHtml = await page.text();

  const evidence = {
    beforeWorker,
    completedStatus: completed.body.status,
    correctedAudienceAddress: correctedAudience[0]?.addressStyle,
    crossTenantStatus: crossTenant.status,
    elapsedMilliseconds: Date.now() - startedAt,
    extractedDraftCount: extracted.body.task.result?.draftCount,
    extractedProtocol: extracted.body.task.result?.protocolVersion,
    finalSummary,
    injectedStatus: injected.status,
    piiStatus: piiSubmission.status,
    pageHasGuardrail:
      page.status === 200 &&
      pageHtml.includes("未确认不入库") &&
      pageHtml.includes("AI 抽取为草稿"),
    pasteSubmitStatus: submittedResponse.status,
    provider: extracted.body.task.provider_attempts[0]?.provider_id,
    queuedStatus: queued.body.task.status,
    realAssetIndexingStatus: indexedAsset?.indexingStatus,
    unauthorizedStatus: unauthorized.status,
    uploadDraftCount: uploaded.body.drafts.length,
    uploadSubmitStatus: uploadResponse.status,
  };
  assert(evidence.unauthorizedStatus === 401, "unsigned request");
  assert(evidence.injectedStatus === 400, "tenant injection");
  assert(evidence.piiStatus === 400, "PII source must be rejected before queue");
  assert(evidence.pasteSubmitStatus === 202, "paste submission");
  assert(evidence.uploadSubmitStatus === 202, "upload submission");
  assert(evidence.queuedStatus === "queued", "queued before worker");
  assert(evidence.crossTenantStatus === 404, "cross-tenant import isolation");
  assert(
    evidence.extractedProtocol ===
      "marketing-ai.knowledge-extraction-result.v1" &&
      evidence.provider === "deterministic-contract",
    "shared provider contract result",
  );
  assert(
    evidence.completedStatus === "completed",
    "every extracted item must be resolved",
  );
  assert(
    evidence.correctedAudienceAddress === "朋友们",
    "merchant correction persisted",
  );
  assert(
    evidence.finalSummary.brandProfile === 1 &&
      evidence.finalSummary.offering === 1 &&
      evidence.finalSummary.audience === 1 &&
      evidence.finalSummary.campaign === 1 &&
      evidence.finalSummary.memberSegment === 1 &&
      evidence.finalSummary.asset === 1,
    "confirmed six-entity usable knowledge base",
  );
  assert(
    evidence.realAssetIndexingStatus === "succeeded",
    "real asset indexing through shared worker",
  );
  assert(evidence.uploadDraftCount === 6, "uploaded source extraction");
  assert(evidence.pageHasGuardrail, "merchant review UI");
  assert(
    evidence.elapsedMilliseconds < 30 * 60 * 1000,
    "seed cold start must finish within 30 minutes",
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  for (const merchantId of merchantIds) {
    try {
      const assets = await database
        .forTenant(tenantId(merchantId))
        .knowledgeBase.listAssets();
      for (const asset of assets) {
        await removeAssetFile(asset.storageKey);
      }
    } catch {
      // Preserve the original acceptance failure if cleanup cannot inspect DB.
    }
  }
  if (merchantIds.length) {
    await cleanup.query(
      "DELETE FROM merchants WHERE id = ANY($1::uuid[])",
      [merchantIds],
    );
  }
  await cleanup.end();
  await database.close();
}
