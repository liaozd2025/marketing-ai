import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import { conversationResponse } from "@/lib/agent-response";
import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ conversationId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const conversation = await database
    .agentForTenant(tenantId(session.merchantId))
    .getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json(
      { error: "conversation_not_found" },
      { status: 404 },
    );
  }

  return NextResponse.json(conversationResponse(conversation));
}
