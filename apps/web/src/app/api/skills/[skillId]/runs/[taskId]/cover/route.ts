import { readCompositionFile } from "@marketing-ai/asset-storage";
import { XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL } from "@marketing-ai/content-skills";
import { database, tenantId } from "@marketing-ai/database";
import { z } from "zod";

import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  readonly params: Promise<{ skillId: string; taskId: string }>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { skillId, taskId } = await context.params;
  if (
    skillId !== "xiaohongshu" ||
    !z.uuid().safeParse(taskId).success
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const merchantId = tenantId(session.merchantId);
  const task = await database.agentForTenant(merchantId).getTask(taskId);
  if (
    !task ||
    !("kind" in task.input) ||
    task.input.kind !== "skill" ||
    task.input.skillId !== "xiaohongshu"
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (task.status !== "succeeded") {
    return Response.json({ error: "cover_not_ready" }, { status: 409 });
  }
  const result = record(task.result);
  if (
    !result ||
    result.protocolVersion !== XIAOHONGSHU_PACKAGE_RESULT_PROTOCOL
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (result.publishReady !== true) {
    return Response.json({ error: "download_blocked" }, { status: 423 });
  }
  const cover = record(result.cover);
  const compositionId = cover?.compositionId;
  if (
    typeof compositionId !== "string" ||
    !z.uuid().safeParse(compositionId).success
  ) {
    return Response.json({ error: "cover_not_found" }, { status: 404 });
  }
  const composition = await database
    .forTenant(merchantId)
    .compositions.get(compositionId);
  if (!composition || composition.sourceTaskId !== task.id) {
    return Response.json({ error: "cover_not_found" }, { status: 404 });
  }
  try {
    const png = await readCompositionFile(composition.storageKey);
    return new Response(new Uint8Array(png), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          `attachment; filename="xiaohongshu-${task.id}.png"`,
        "Content-Length": String(composition.byteSize),
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return Response.json({ error: "cover_not_found" }, { status: 404 });
    }
    throw error;
  }
}
