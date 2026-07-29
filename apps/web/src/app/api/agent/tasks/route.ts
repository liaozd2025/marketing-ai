import {
  ConversationBusyError,
  ConversationNotFoundError,
  database,
  tenantId,
} from "@marketing-ai/database";
import { NextResponse } from "next/server";

import {
  InvalidAgentRequestError,
  parseAgentTaskRequest,
} from "@/lib/agent-request";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const input = parseAgentTaskRequest(await request.json());
    const task = await database
      .agentForTenant(tenantId(session.merchantId))
      .submitTask(session.memberId, input);

    return NextResponse.json(
      {
        conversation_id: task.conversationId,
        status: task.status,
        task_id: task.id,
      },
      { status: 202 },
    );
  } catch (error) {
    if (
      error instanceof InvalidAgentRequestError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: error.message,
        },
        { status: 400 },
      );
    }
    if (error instanceof ConversationNotFoundError) {
      return NextResponse.json(
        { error: "conversation_not_found" },
        { status: 404 },
      );
    }
    if (error instanceof ConversationBusyError) {
      return NextResponse.json(
        { error: "conversation_busy" },
        { status: 409 },
      );
    }
    throw error;
  }
}
