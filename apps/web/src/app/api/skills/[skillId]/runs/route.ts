import { database, tenantId } from "@marketing-ai/database";
import {
  getSkillPreset,
  getVerticalPack,
} from "@marketing-ai/vertical-packs";
import { NextResponse } from "next/server";

import {
  InvalidSkillRequestError,
  parseSkillRunRequest,
} from "@/lib/skill-request";
import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ skillId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { skillId } = await context.params;
    const tenant = database.forTenant(tenantId(session.merchantId));
    const merchant = await tenant.getMerchant();
    if (!merchant) {
      return NextResponse.json({ error: "merchant_not_found" }, { status: 404 });
    }
    const preset = getSkillPreset(
      getVerticalPack(merchant.verticalPackId),
      skillId,
    );
    const input = parseSkillRunRequest(await request.json(), skillId, {
      zeroPiiGenerateOnly: Boolean(preset.memberTouch),
    });
    if (
      "kind" in input &&
      input.action !== "generate" &&
      !preset.contentTypes.some(({ id }) => id === input.contentType)
    ) {
      throw new InvalidSkillRequestError(
        "content_type is not configured for this Skill",
      );
    }
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
      error instanceof InvalidSkillRequestError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        { error: "invalid_request", message: error.message },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      (error.message.startsWith("Unknown Skill preset") ||
        error.message.startsWith("Unknown vertical pack"))
    ) {
      return NextResponse.json({ error: "skill_not_found" }, { status: 404 });
    }
    throw error;
  }
}
