import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import {
  InvalidKnowledgeImportError,
  parseKnowledgeImportRequest,
} from "@/lib/knowledge-import-input";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const input = await parseKnowledgeImportRequest(request);
    const created = await database
      .forTenant(tenantId(session.merchantId))
      .coldStart.createImportAndQueueExtraction(session.memberId, input);
    return NextResponse.json(
      {
        import_id: created.id,
        status: created.status,
        task_id: created.taskId,
      },
      { status: 202 },
    );
  } catch (error) {
    if (
      error instanceof InvalidKnowledgeImportError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const imports = await database
    .forTenant(tenantId(session.merchantId))
    .coldStart.listImports();
  return NextResponse.json({
    imports: imports.map((item) => ({
      created_at: item.createdAt,
      id: item.id,
      source_kind: item.sourceKind,
      source_name: item.sourceName,
      source_size: item.sourceSize,
      status: item.status,
      task_id: item.taskId,
    })),
  });
}
