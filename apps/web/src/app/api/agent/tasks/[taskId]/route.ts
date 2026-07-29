import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import { agentTaskResponse } from "@/lib/agent-response";
import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ taskId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { taskId } = await context.params;
  const task = await database
    .agentForTenant(tenantId(session.merchantId))
    .getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  return NextResponse.json(agentTaskResponse(task));
}
