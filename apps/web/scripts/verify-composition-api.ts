import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import { database, tenantId } from "@marketing-ai/database";

import {
  removeAssetFile,
  storeAssetFile,
} from "../src/lib/asset-storage";
import { removeCompositionFile } from "../src/lib/composition-storage";
import { signSession } from "../src/lib/session-token";

const baseUrl = process.env.COMPOSITION_VERIFY_BASE_URL ??
  "http://127.0.0.1:3019";
const sessionSecret = process.env.SESSION_SECRET;
assert(
  sessionSecret && sessionSecret.length >= 32,
  "SESSION_SECRET must contain at least 32 characters",
);
const verifiedSessionSecret = sessionSecret;

function pngDimensions(png: Buffer) {
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
}

async function main(): Promise<void> {
const sourcePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2s6O9QAAAABJRU5ErkJggg==",
  "base64",
);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const accountA = await database.identity.registerMerchant({
  email: `composition-a-${suffix}@example.com`,
  merchantName: "春风里皮肤管理",
  passwordHash: "verification-only",
});
const accountB = await database.identity.registerMerchant({
  email: `composition-b-${suffix}@example.com`,
  merchantName: "另一家独立商户",
  passwordHash: "verification-only",
});
const merchantAId = tenantId(accountA.merchant.id);
const tenantA = database.forTenant(merchantAId);
const sourceKey = await storeAssetFile(
  merchantAId,
  new File([sourcePng], "授权实拍.png", { type: "image/png" }),
);
const asset = await tenantA.knowledgeBase.createAsset({
  byteSize: sourcePng.byteLength,
  isEffectImage: true,
  mimeType: "image/png",
  notes: "API 验收专用",
  offeringId: null,
  originalName: "授权实拍.png",
  scene: "真实效果记录",
  storageKey: sourceKey,
});
await tenantA.knowledgeBase.saveBrandProfile({
  accentColor: "#F4C7AB",
  fontStyle: "modern",
  persona: "懂审美、说人话的门店主理人",
  primaryColor: "#7C3F58",
  story: "坚持使用授权实拍素材",
  tabooExpressions: ["夸大承诺"],
  tone: "亲切克制",
});

function cookieFor(account: typeof accountA): string {
  return `marketing_ai_session=${signSession(
    {
      expiresAt: Date.now() + 10 * 60 * 1000,
      memberId: account.member.id,
      merchantId: account.merchant.id,
    },
    verifiedSessionSecret,
  )}`;
}

const cookieA = cookieFor(accountA);
const cookieB = cookieFor(accountB);
const requestBody = {
  assetId: asset.id,
  body: "到店后的松弛感，藏在每一次认真护理里。",
  headline: "今天，也要好好照顾自己",
  templateId: "xiaohongshu-cover-3x4",
  usage: "effect",
};
let compositionId: string | undefined;
let compositionStorageKey: string | undefined;

try {
  const unauthorized = await fetch(`${baseUrl}/api/compositions`, {
    body: JSON.stringify(requestBody),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const tampered = await fetch(`${baseUrl}/api/compositions`, {
    headers: {
      Cookie: `${cookieA.slice(0, -1)}x`,
    },
  });
  assert.equal(tampered.status, 401);

  const tenantInjection = await fetch(`${baseUrl}/api/compositions`, {
    body: JSON.stringify({
      ...requestBody,
      merchantId: accountB.merchant.id,
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieA,
    },
    method: "POST",
  });
  assert.equal(tenantInjection.status, 400);

  const crossTenantAsset = await fetch(`${baseUrl}/api/compositions`, {
    body: JSON.stringify(requestBody),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieB,
    },
    method: "POST",
  });
  assert.equal(crossTenantAsset.status, 404);

  const createdResponse = await fetch(`${baseUrl}/api/compositions`, {
    body: JSON.stringify(requestBody),
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieA,
    },
    method: "POST",
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as {
    composition: {
      height: number;
      id: string;
      imageUrl: string;
      width: number;
    } & Record<string, unknown>;
  };
  assert.equal(created.composition.width, 1080);
  assert.equal(created.composition.height, 1440);
  assert(!("merchantId" in created.composition));
  assert(!("storageKey" in created.composition));
  compositionId = created.composition.id;

  const imageResponse = await fetch(
    `${baseUrl}${created.composition.imageUrl}`,
    { headers: { Cookie: cookieA } },
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
  const png = Buffer.from(await imageResponse.arrayBuffer());
  assert.deepEqual(pngDimensions(png), { height: 1440, width: 1080 });
  assert(png.byteLength > 10_000);

  const outputPath = process.env.COMPOSITION_VERIFY_OUTPUT;
  if (outputPath) {
    await writeFile(outputPath, png);
  }

  const crossTenantImage = await fetch(
    `${baseUrl}${created.composition.imageUrl}`,
    { headers: { Cookie: cookieB } },
  );
  assert.equal(crossTenantImage.status, 404);

  const studioResponse = await fetch(`${baseUrl}/workspace/compositions`, {
    headers: { Cookie: cookieA },
  });
  assert.equal(studioResponse.status, 200);
  const studioHtml = await studioResponse.text();
  assert(studioHtml.includes("模板出图"));
  assert(studioHtml.includes("浏览器实时预览"));

  const stored = await tenantA.compositions.get(compositionId);
  assert(stored);
  compositionStorageKey = stored.storageKey;

  console.log(
    JSON.stringify({
      asset_cross_tenant_status: crossTenantAsset.status,
      image_cross_tenant_status: crossTenantImage.status,
      output_bytes: png.byteLength,
      output_dimensions: pngDimensions(png),
      output_path: outputPath ?? null,
      signed_create_status: createdResponse.status,
      tampered_session_status: tampered.status,
      tenant_injection_status: tenantInjection.status,
      unauthorized_status: unauthorized.status,
    }),
  );
} finally {
  if (compositionId) {
    await tenantA.compositions.delete(compositionId);
  }
  if (compositionStorageKey) {
    await removeCompositionFile(compositionStorageKey);
  }
  await tenantA.knowledgeBase.deleteAsset(asset.id);
  await removeAssetFile(sourceKey);
  await database.close();
}
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
