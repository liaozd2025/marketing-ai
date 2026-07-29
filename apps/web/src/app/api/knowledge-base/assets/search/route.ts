import { database, tenantId } from "@marketing-ai/database";
import { NextResponse } from "next/server";

import {
  InvalidAssetSearchError,
  parseAssetSearchRequest,
} from "@/lib/asset-search";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const input = parseAssetSearchRequest(await request.json());
    const task = await database
      .agentForTenant(tenantId(session.merchantId))
      .submitAssetSearch(session.memberId, input);
    return NextResponse.json(
      { status: task.status, task_id: task.id },
      { status: 202 },
    );
  } catch (error) {
    if (
      error instanceof InvalidAssetSearchError ||
      error instanceof SyntaxError
    ) {
      return NextResponse.json(
        { error: "invalid_request" },
        { status: 400 },
      );
    }
    if (
      error instanceof Error &&
      error.message === "Offering was not found for this merchant"
    ) {
      return NextResponse.json(
        { error: "offering_not_found" },
        { status: 404 },
      );
    }
    throw error;
  }
}
