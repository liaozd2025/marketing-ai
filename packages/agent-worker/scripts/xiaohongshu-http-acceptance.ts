import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  DeterministicEmbeddingProvider,
  DeterministicImageProvider,
  DeterministicTextProvider,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import {
  removeAssetFile,
  removeCompositionFile,
  storeAssetFile,
} from "@marketing-ai/asset-storage";
import type { XiaohongshuPackageResult } from "@marketing-ai/content-skills";
import {
  database as sharedDatabase,
  Database,
  tenantId,
} from "@marketing-ai/database";
import { Pool } from "pg";
import sharp from "sharp";

import { signSession } from "../../../apps/web/src/lib/session-token";
import { ConfiguredSkillRuntime } from "../src/skill-runtime";
import { AgentWorker } from "../src/worker";

const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const baseUrl =
  process.env.XHS_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3110";
assert(databaseUrl, "DATABASE_URL is required");
assert(
  sessionSecret && sessionSecret.length >= 32,
  "SESSION_SECRET must contain at least 32 characters",
);

function cookieFor(
  account: Awaited<
    ReturnType<InstanceType<typeof Database>["identity"]["registerMerchant"]>
  >,
): string {
  return `marketing_ai_session=${signSession(
    {
      expiresAt: Date.now() + 10 * 60 * 1000,
      memberId: account.member.id,
      merchantId: account.merchant.id,
    },
    sessionSecret!,
  )}`;
}

function pngDimensions(png: Buffer) {
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
}

async function main() {
  const database = new Database(databaseUrl);
  const cleanupPool = new Pool({ connectionString: databaseUrl });
  const suffix = randomUUID();
  const accountA = await database.identity.registerMerchant({
    email: `xhs-http-a-${suffix}@example.test`,
    merchantName: "HTTP 秋日护理",
    passwordHash: "unused",
  });
  const accountB = await database.identity.registerMerchant({
    email: `xhs-http-b-${suffix}@example.test`,
    merchantName: "HTTP 另一商户",
    passwordHash: "unused",
  });
  const merchantAId = tenantId(accountA.merchant.id);
  const tenantA = database.forTenant(merchantAId);
  const sourcePng = await sharp({
    create: {
      background: { b: 70, g: 132, r: 214 },
      channels: 3,
      height: 48,
      width: 48,
    },
  }).png().toBuffer();
  const sourceKey = await storeAssetFile(
    merchantAId,
    new File([Uint8Array.from(sourcePng).buffer], "秋日护理实拍.png", {
      type: "image/png",
    }),
  );
  let compositionStorageKey: string | null = null;
  let compositionId: string | null = null;

  try {
    await tenantA.knowledgeBase.saveBrandProfile({
      accentColor: "#F4C7AB",
      fontStyle: "modern",
      persona: "社区护理主理人",
      primaryColor: "#7C3F58",
      story: "坚持记录真实环境和过程",
      tabooExpressions: [],
      tone: "具体、克制",
    });
    const offering = await tenantA.knowledgeBase.createOffering({
      description: "先沟通状态，再做 60 分钟手法放松。",
      fieldValues: {
        offeringType: "service",
        price: 298,
        sellingPoints: "轻重可随时沟通",
        suitableFor: "久坐、下班后想放松的人",
      },
      name: "秋季肩颈舒缓护理",
    });
    await tenantA.knowledgeBase.createAssetAndQueueIndex(
      accountA.member.id,
      {
        byteSize: sourcePng.byteLength,
        isEffectImage: false,
        mimeType: "image/png",
        notes: "秋季暖色自然光",
        offeringId: offering.id,
        originalName: "秋日护理实拍.png",
        scene: "护理环境",
        storageKey: sourceKey,
      },
    );
    const worker = new AgentWorker(
      "xhs-http-acceptance",
      database.agentQueue,
      new ProviderRouter(
        {
          embedding: [new DeterministicEmbeddingProvider()],
          image: [new DeterministicImageProvider()],
          text: [new DeterministicTextProvider()],
        },
        database.agentQueue,
      ),
      new ConfiguredSkillRuntime(database, {
        aiImageFallbackConfigured: false,
      }),
    );
    while (await worker.runOnce()) {
      // Drain the source asset indexing task before submitting the package.
    }

    const requestBody = {
      allow_ai_image: true,
      image_usage: "atmosphere",
      intent: "写一篇秋季暖色氛围的真实护理笔记",
    };
    const unauthorized = await fetch(
      `${baseUrl}/api/skills/xiaohongshu/runs`,
      {
        body: JSON.stringify(requestBody),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    assert.equal(unauthorized.status, 401);
    const workspacePage = await fetch(
      `${baseUrl}/workspace/content/xiaohongshu`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    const workspaceHtml = await workspacePage.text();
    assert.equal(workspacePage.status, 200);
    assert(workspaceHtml.includes("文案、封面和配图一次成包"));
    assert(workspaceHtml.includes("效果呈现"));
    assert(workspaceHtml.includes("系统不存在 AI 生成路径"));

    const submittedResponse = await fetch(
      `${baseUrl}/api/skills/xiaohongshu/runs`,
      {
        body: JSON.stringify(requestBody),
        headers: {
          cookie: cookieFor(accountA),
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    assert.equal(submittedResponse.status, 202);
    const submitted = (await submittedResponse.json()) as {
      task_id: string;
    };
    const queuedResponse = await fetch(
      `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    const queued = (await queuedResponse.json()) as { status: string };
    assert.equal(queued.status, "queued");
    const crossTenantTask = await fetch(
      `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
      { headers: { cookie: cookieFor(accountB) } },
    );
    assert.equal(crossTenantTask.status, 404);

    await worker.runOnce();
    const completedResponse = await fetch(
      `${baseUrl}/api/agent/tasks/${submitted.task_id}`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    const completed = (await completedResponse.json()) as {
      error: { code: string; message: string } | null;
      result: XiaohongshuPackageResult;
      status: string;
    };
    assert.equal(
      completed.status,
      "succeeded",
      JSON.stringify(completed.error),
    );
    assert.equal(completed.result.publication.status, "ready");
    assert.equal(completed.result.imageSources[0]?.kind, "merchant_asset");
    assert.equal(completed.result.aiFallback.status, "not_needed");
    assert(completed.result.cover.downloadUrl);

    const coverResponse = await fetch(
      `${baseUrl}${completed.result.cover.downloadUrl}`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    assert.equal(coverResponse.status, 200);
    assert.equal(coverResponse.headers.get("content-type"), "image/png");
    const coverPng = Buffer.from(await coverResponse.arrayBuffer());
    assert.deepEqual(pngDimensions(coverPng), {
      height: 1440,
      width: 1080,
    });
    assert(coverPng.byteLength > 10_000);
    const crossTenantCover = await fetch(
      `${baseUrl}${completed.result.cover.downloadUrl}`,
      { headers: { cookie: cookieFor(accountB) } },
    );
    assert.equal(crossTenantCover.status, 404);

    const composition = await tenantA.compositions.get(
      completed.result.cover.compositionId!,
    );
    assert(composition);
    compositionId = composition.id;
    compositionStorageKey = composition.storageKey;
    const genericBypass = await fetch(
      `${baseUrl}/api/compositions/${composition.id}/image`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    assert.equal(genericBypass.status, 404);

    const blockedSubmitResponse = await fetch(
      `${baseUrl}/api/skills/xiaohongshu/runs`,
      {
        body: JSON.stringify({
          image_usage: "atmosphere",
          intent: "[[fixture:cover-violation]]",
        }),
        headers: {
          cookie: cookieFor(accountA),
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    assert.equal(blockedSubmitResponse.status, 202);
    const blockedSubmitted = (await blockedSubmitResponse.json()) as {
      task_id: string;
    };
    await worker.runOnce();
    const blockedTask = (await (
      await fetch(
        `${baseUrl}/api/agent/tasks/${blockedSubmitted.task_id}`,
        { headers: { cookie: cookieFor(accountA) } },
      )
    ).json()) as { result: XiaohongshuPackageResult; status: string };
    assert.equal(blockedTask.status, "succeeded");
    assert.equal(blockedTask.result.publication.status, "blocked");
    assert.equal(blockedTask.result.cover.downloadUrl, null);
    const blockedDownload = await fetch(
      `${baseUrl}/api/skills/xiaohongshu/runs/${blockedSubmitted.task_id}/cover`,
      { headers: { cookie: cookieFor(accountA) } },
    );
    assert.equal(blockedDownload.status, 423);

    process.stdout.write(
      `${JSON.stringify(
        {
          blocked_download_status: blockedDownload.status,
          cover_bytes: coverPng.byteLength,
          cover_dimensions: pngDimensions(coverPng),
          cover_status: coverResponse.status,
          cross_tenant_cover_status: crossTenantCover.status,
          cross_tenant_task_status: crossTenantTask.status,
          generic_bypass_status: genericBypass.status,
          queued_status: queued.status,
          result_status: completed.status,
          semantic_source: completed.result.imageSources[0]?.kind,
          submit_status: submittedResponse.status,
          unauthorized_status: unauthorized.status,
          workspace_status: workspacePage.status,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (compositionId) {
      await tenantA.compositions.delete(compositionId);
    }
    if (compositionStorageKey) {
      await removeCompositionFile(compositionStorageKey);
    }
    await removeAssetFile(sourceKey);
    await cleanupPool.query(
      "DELETE FROM merchants WHERE id = ANY($1::uuid[])",
      [[accountA.merchant.id, accountB.merchant.id]],
    );
    await cleanupPool.end();
    await database.close();
    await sharedDatabase.close();
  }
}

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
