import {
  database,
  embeddingVector,
  tenantId,
} from "@marketing-ai/database";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

interface RouteContext {
  readonly params: Promise<{ taskId: string }>;
}

function taskEmbedding(result: unknown): {
  embedding: number[];
  embeddingSpace: string;
} {
  if (
    typeof result !== "object" ||
    result === null ||
    !("embeddingSpace" in result) ||
    typeof result.embeddingSpace !== "string" ||
    !result.embeddingSpace ||
    !("embeddings" in result) ||
    !Array.isArray(result.embeddings) ||
    result.embeddings.length !== 1
  ) {
    throw new Error("Asset search task returned an invalid embedding result");
  }
  return {
    embedding: embeddingVector(result.embeddings[0]),
    embeddingSpace: result.embeddingSpace,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { taskId } = await context.params;
  const merchantId = tenantId(session.merchantId);
  const agent = database.agentForTenant(merchantId);
  const task = await agent.getTask(taskId);
  if (
    !task ||
    task.capability !== "embedding" ||
    !("purpose" in task.input) ||
    task.input.purpose !== "asset-search"
  ) {
    return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  if (task.status !== "succeeded") {
    return NextResponse.json(
      {
        error: task.errorMessage,
        provider_attempts: task.providerAttempts,
        status: task.status,
        task_id: task.id,
      },
      { status: task.status === "failed" ? 200 : 202 },
    );
  }

  const tenant = database.forTenant(merchantId);
  const queryEmbedding = taskEmbedding(task.result);
  const results = await tenant.knowledgeBase.searchAssets(
    queryEmbedding.embedding,
    queryEmbedding.embeddingSpace,
    task.input.filters,
  );
  return NextResponse.json({
    results: results.map(({ asset, similarity }) => ({
      asset: {
        id: asset.id,
        indexed_at: asset.indexedAt,
        is_effect_image: asset.isEffectImage,
        mime_type: asset.mimeType,
        notes: asset.notes,
        offering_id: asset.offeringId,
        original_name: asset.originalName,
        scene: asset.scene,
      },
      similarity,
    })),
    status: task.status,
    task_id: task.id,
  });
}
