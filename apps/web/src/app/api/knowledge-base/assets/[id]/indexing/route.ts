import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getTenantContext();
  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const asset = await context.tenant.knowledgeBase.getAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const task = asset.indexingTaskId
    ? await database
        .agentForTenant(tenantId(context.session.merchantId))
        .getTask(asset.indexingTaskId)
    : null;
  return NextResponse.json({
    error: asset.indexingError,
    indexed_at: asset.indexedAt,
    provider_attempts: task?.providerAttempts ?? [],
    status: asset.indexingStatus,
    task_id: asset.indexingTaskId,
  });
}
