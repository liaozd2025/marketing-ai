import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ importId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { importId } = await context.params;
  const merchantId = tenantId(session.merchantId);
  const tenant = database.forTenant(merchantId);
  const item = await tenant.coldStart.getImport(importId);
  if (!item) {
    return NextResponse.json(
      { error: "knowledge_import_not_found" },
      { status: 404 },
    );
  }
  const [drafts, task] = await Promise.all([
    tenant.coldStart.listDrafts(importId),
    database.agentForTenant(merchantId).getTask(item.taskId),
  ]);
  return NextResponse.json({
    created_at: item.createdAt,
    drafts: drafts.map((draft) => ({
      confirmed_entity_id: draft.confirmedEntityId,
      entity_type: draft.entityType,
      id: draft.id,
      payload: draft.payload,
      status: draft.status,
    })),
    id: item.id,
    source_kind: item.sourceKind,
    source_name: item.sourceName,
    source_size: item.sourceSize,
    status: item.status,
    task: task
      ? {
          error_code: task.errorCode,
          error_message: task.errorMessage,
          provider_attempts: task.providerAttempts.map((attempt) => ({
            provider_id: attempt.providerId,
            status: attempt.status,
          })),
          result: task.result,
          status: task.status,
        }
      : null,
    task_id: item.taskId,
  });
}
