import type { QueryResultRow } from "pg";

import type {
  CompositionRecord,
  CompositionRecordInput,
} from "./composition-types";
import type { SqlExecutor, TenantId } from "./types";

interface CompositionRow extends QueryResultRow {
  asset_id: string | null;
  body: string;
  byte_size: number | string;
  created_at: Date;
  created_by_member_id: string;
  headline: string;
  height: number;
  id: string;
  merchant_id: TenantId;
  output_mime_type: "image/png";
  source_task_id: string | null;
  storage_key: string;
  template_id: string;
  usage: "effect" | "general";
  width: number;
}

const columns = `id, merchant_id, created_by_member_id, asset_id,
  template_id, usage, headline, body, output_mime_type, width, height,
  byte_size, storage_key, source_task_id, created_at`;

function toComposition(row: CompositionRow): CompositionRecord {
  return {
    assetId: row.asset_id,
    body: row.body,
    byteSize: Number(row.byte_size),
    createdAt: row.created_at,
    createdByMemberId: row.created_by_member_id,
    headline: row.headline,
    height: row.height,
    id: row.id,
    merchantId: row.merchant_id,
    outputMimeType: row.output_mime_type,
    sourceTaskId: row.source_task_id,
    storageKey: row.storage_key,
    templateId: row.template_id,
    usage: row.usage,
    width: row.width,
  };
}

export class CompositionDataAccess {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly merchantId: TenantId,
  ) {}

  async create(input: CompositionRecordInput): Promise<CompositionRecord> {
    const result = await this.executor.query<CompositionRow>(
      `INSERT INTO compositions
         (merchant_id, created_by_member_id, asset_id, template_id, usage,
          headline, body, output_mime_type, width, height, byte_size,
          storage_key, source_task_id)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'image/png', $8, $9, $10, $11, $12
       )
       RETURNING ${columns}`,
      [
        this.merchantId,
        input.createdByMemberId,
        input.assetId,
        input.templateId,
        input.usage,
        input.headline,
        input.body,
        input.width,
        input.height,
        input.byteSize,
        input.storageKey,
        input.sourceTaskId ?? null,
      ],
    );
    return toComposition(result.rows[0]);
  }

  async get(id: string): Promise<CompositionRecord | null> {
    const result = await this.executor.query<CompositionRow>(
      `SELECT ${columns}
       FROM compositions
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toComposition(result.rows[0]) : null;
  }

  async list(limit = 20): Promise<CompositionRecord[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
    const result = await this.executor.query<CompositionRow>(
      `SELECT ${columns}
       FROM compositions
       WHERE merchant_id = $1 AND source_task_id IS NULL
       ORDER BY created_at DESC, id
       LIMIT $2`,
      [this.merchantId, safeLimit],
    );
    return result.rows.map(toComposition);
  }

  async getBySourceTask(taskId: string): Promise<CompositionRecord | null> {
    const result = await this.executor.query<CompositionRow>(
      `SELECT ${columns}
       FROM compositions
       WHERE merchant_id = $1 AND source_task_id = $2`,
      [this.merchantId, taskId],
    );
    return result.rows[0] ? toComposition(result.rows[0]) : null;
  }

  async delete(id: string): Promise<CompositionRecord | null> {
    const result = await this.executor.query<CompositionRow>(
      `DELETE FROM compositions
       WHERE merchant_id = $1 AND id = $2
       RETURNING ${columns}`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toComposition(result.rows[0]) : null;
  }
}
