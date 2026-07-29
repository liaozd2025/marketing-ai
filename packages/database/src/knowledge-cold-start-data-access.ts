import { randomUUID } from "node:crypto";

import type { Pool, QueryResultRow } from "pg";

import { KnowledgeBaseDataAccess } from "./knowledge-base-data-access";
import type {
  ConfirmKnowledgeDraftInput,
  CreateKnowledgeImportInput,
  KnowledgeEntityDraft,
  KnowledgeImport,
  StoreKnowledgeDraftInput,
} from "./knowledge-cold-start-types";
import type { SqlExecutor, TenantId } from "./types";

interface KnowledgeImportRow extends QueryResultRow {
  completed_at: Date | null;
  created_at: Date;
  id: string;
  merchant_id: TenantId;
  source_hash: string;
  source_kind: KnowledgeImport["sourceKind"];
  source_media_type: string;
  source_name: string;
  source_size: number;
  status: KnowledgeImport["status"];
  task_id: string;
  updated_at: Date;
}

interface KnowledgeDraftRow extends QueryResultRow {
  confirmed_entity_id: string | null;
  created_at: Date;
  entity_type: KnowledgeEntityDraft["entityType"];
  id: string;
  import_id: string;
  merchant_id: TenantId;
  payload: Record<string, unknown>;
  position: number;
  resolved_at: Date | null;
  status: KnowledgeEntityDraft["status"];
  updated_at: Date;
}

const importColumns = `
  id, merchant_id, task_id, source_kind, source_name, source_media_type,
  source_size, source_hash, status, created_at, updated_at, completed_at
`;
const draftColumns = `
  id, merchant_id, import_id, entity_type, position, payload, status,
  confirmed_entity_id, created_at, updated_at, resolved_at
`;

function toImport(row: KnowledgeImportRow): KnowledgeImport {
  return {
    completedAt: row.completed_at,
    createdAt: row.created_at,
    id: row.id,
    merchantId: row.merchant_id,
    sourceHash: row.source_hash,
    sourceKind: row.source_kind,
    sourceMediaType: row.source_media_type,
    sourceName: row.source_name,
    sourceSize: row.source_size,
    status: row.status,
    taskId: row.task_id,
    updatedAt: row.updated_at,
  };
}

function toDraft(row: KnowledgeDraftRow): KnowledgeEntityDraft {
  return {
    confirmedEntityId: row.confirmed_entity_id,
    createdAt: row.created_at,
    entityType: row.entity_type,
    id: row.id,
    importId: row.import_id,
    merchantId: row.merchant_id,
    payload: row.payload,
    position: row.position,
    resolvedAt: row.resolved_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export class KnowledgeColdStartDataAccess {
  constructor(
    private readonly pool: Pool,
    private readonly merchantId: TenantId,
  ) {}

  async createImportAndQueueExtraction(
    memberId: string,
    input: CreateKnowledgeImportInput,
  ): Promise<KnowledgeImport> {
    const client = await this.pool.connect();
    const importId = randomUUID();
    try {
      await client.query("BEGIN");
      const conversation = await client.query<{ id: string }>(
        `INSERT INTO conversations
           (merchant_id, created_by_member_id, title)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [this.merchantId, memberId, `知识库冷启动：${input.sourceName}`.slice(0, 80)],
      );
      await client.query(
        `INSERT INTO conversation_messages
           (merchant_id, conversation_id, role, content)
         VALUES ($1, $2, 'user', $3)`,
        [
          this.merchantId,
          conversation.rows[0].id,
          `提交资料用于知识库冷启动：${input.sourceName}`,
        ],
      );
      const task = await client.query<{ id: string }>(
        `INSERT INTO agent_tasks
           (
             merchant_id, created_by_member_id, conversation_id, capability,
             input
           )
         VALUES ($1, $2, $3, 'text', $4)
         RETURNING id`,
        [
          this.merchantId,
          memberId,
          conversation.rows[0].id,
          JSON.stringify({
            importId,
            kind: "knowledge-extraction",
            sourceName: input.sourceName,
            sourceText: input.sourceText,
          }),
        ],
      );
      const created = await client.query<KnowledgeImportRow>(
        `INSERT INTO knowledge_imports
           (
             id, merchant_id, created_by_member_id, task_id, source_kind,
             source_name, source_media_type, source_size, source_hash
           )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${importColumns}`,
        [
          importId,
          this.merchantId,
          memberId,
          task.rows[0].id,
          input.sourceKind,
          input.sourceName,
          input.sourceMediaType,
          input.sourceSize,
          input.sourceHash,
        ],
      );
      await client.query("COMMIT");
      return toImport(created.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listImports(limit = 10): Promise<KnowledgeImport[]> {
    const result = await this.pool.query<KnowledgeImportRow>(
      `SELECT ${importColumns}
       FROM knowledge_imports
       WHERE merchant_id = $1
       ORDER BY created_at DESC, id
       LIMIT $2`,
      [this.merchantId, Math.max(1, Math.min(limit, 50))],
    );
    return result.rows.map(toImport);
  }

  async getImport(id: string): Promise<KnowledgeImport | null> {
    const result = await this.pool.query<KnowledgeImportRow>(
      `SELECT ${importColumns}
       FROM knowledge_imports
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, id],
    );
    return result.rows[0] ? toImport(result.rows[0]) : null;
  }

  async listDrafts(importId: string): Promise<KnowledgeEntityDraft[]> {
    const result = await this.pool.query<KnowledgeDraftRow>(
      `SELECT ${draftColumns}
       FROM knowledge_entity_drafts
       WHERE merchant_id = $1 AND import_id = $2
       ORDER BY position, id`,
      [this.merchantId, importId],
    );
    return result.rows.map(toDraft);
  }

  async getDraft(
    importId: string,
    draftId: string,
  ): Promise<KnowledgeEntityDraft | null> {
    const result = await this.pool.query<KnowledgeDraftRow>(
      `SELECT ${draftColumns}
       FROM knowledge_entity_drafts
       WHERE merchant_id = $1 AND import_id = $2 AND id = $3`,
      [this.merchantId, importId, draftId],
    );
    return result.rows[0] ? toDraft(result.rows[0]) : null;
  }

  async storeExtractionDrafts(
    importId: string,
    drafts: readonly StoreKnowledgeDraftInput[],
  ): Promise<KnowledgeEntityDraft[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query<{ id: string }>(
        `SELECT id
         FROM knowledge_imports
         WHERE merchant_id = $1 AND id = $2
         FOR UPDATE`,
        [this.merchantId, importId],
      );
      if (!target.rows[0]) {
        throw new Error("Knowledge import was not found");
      }
      const resolved = await client.query(
        `SELECT 1
         FROM knowledge_entity_drafts
         WHERE merchant_id = $1
           AND import_id = $2
           AND status <> 'pending'
         LIMIT 1`,
        [this.merchantId, importId],
      );
      if (resolved.rowCount) {
        throw new Error("Knowledge import already has resolved drafts");
      }
      await client.query(
        `DELETE FROM knowledge_entity_drafts
         WHERE merchant_id = $1 AND import_id = $2`,
        [this.merchantId, importId],
      );
      const stored: KnowledgeEntityDraft[] = [];
      for (const [position, draft] of drafts.entries()) {
        const created = await client.query<KnowledgeDraftRow>(
          `INSERT INTO knowledge_entity_drafts
             (merchant_id, import_id, entity_type, position, payload)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING ${draftColumns}`,
          [
            this.merchantId,
            importId,
            draft.entityType,
            position,
            JSON.stringify(draft.payload),
          ],
        );
        stored.push(toDraft(created.rows[0]));
      }
      await client.query(
        `UPDATE knowledge_imports
         SET
           status = $3,
           completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
           updated_at = now()
         WHERE merchant_id = $1 AND id = $2`,
        [this.merchantId, importId, drafts.length ? "review" : "completed"],
      );
      await client.query("COMMIT");
      return stored;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async confirmDraft(
    draftId: string,
    confirmation: ConfirmKnowledgeDraftInput,
    memberId?: string,
  ): Promise<KnowledgeEntityDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<KnowledgeDraftRow>(
        `SELECT ${draftColumns}
         FROM knowledge_entity_drafts
         WHERE merchant_id = $1 AND id = $2
         FOR UPDATE`,
        [this.merchantId, draftId],
      );
      const draft = selected.rows[0];
      if (!draft) {
        throw new Error("Draft was not found");
      }
      if (draft.status !== "pending") {
        throw new Error("Draft is not pending");
      }
      if (draft.entity_type !== confirmation.entityType) {
        throw new Error("Draft entity type does not match confirmation");
      }

      const knowledge = new KnowledgeBaseDataAccess(
        client as unknown as SqlExecutor,
        this.merchantId,
      );
      const entity =
        confirmation.entityType === "asset"
          ? memberId
            ? await knowledge.createAssetAndQueueIndex(
                memberId,
                confirmation.input,
              )
            : (() => {
                throw new Error(
                  "Asset confirmation requires an authenticated member",
                );
              })()
          : confirmation.entityType === "brandProfile"
          ? await knowledge.saveBrandProfile(confirmation.input)
          : confirmation.entityType === "offering"
            ? await knowledge.createOffering(confirmation.input)
            : confirmation.entityType === "audience"
              ? await knowledge.createAudience(confirmation.input)
              : confirmation.entityType === "campaign"
                ? await knowledge.createCampaign(confirmation.input)
                : await knowledge.createMemberSegment(confirmation.input);
      const updated = await client.query<KnowledgeDraftRow>(
        `UPDATE knowledge_entity_drafts
         SET
           payload = $3,
           status = 'confirmed',
           confirmed_entity_id = $4,
           resolved_at = now(),
           updated_at = now()
         WHERE merchant_id = $1 AND id = $2
         RETURNING ${draftColumns}`,
        [
          this.merchantId,
          draftId,
          JSON.stringify(
            confirmation.entityType === "asset"
              ? confirmation.draftPayload
              : confirmation.input,
          ),
          entity.id,
        ],
      );
      await this.completeImportWhenResolved(client, draft.import_id);
      await client.query("COMMIT");
      return toDraft(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async rejectDraft(draftId: string): Promise<KnowledgeEntityDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<KnowledgeDraftRow>(
        `UPDATE knowledge_entity_drafts
         SET status = 'rejected', resolved_at = now(), updated_at = now()
         WHERE merchant_id = $1 AND id = $2 AND status = 'pending'
         RETURNING ${draftColumns}`,
        [this.merchantId, draftId],
      );
      const draft = updated.rows[0];
      if (!draft) {
        const exists = await client.query(
          `SELECT 1
           FROM knowledge_entity_drafts
           WHERE merchant_id = $1 AND id = $2`,
          [this.merchantId, draftId],
        );
        throw new Error(
          exists.rowCount ? "Draft is not pending" : "Draft was not found",
        );
      }
      await this.completeImportWhenResolved(client, draft.import_id);
      await client.query("COMMIT");
      return toDraft(draft);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async completeImportWhenResolved(
    executor: SqlExecutor,
    importId: string,
  ): Promise<void> {
    await executor.query(
      `UPDATE knowledge_imports target
       SET status = 'completed', completed_at = now(), updated_at = now()
       WHERE target.merchant_id = $1
         AND target.id = $2
         AND NOT EXISTS (
           SELECT 1
           FROM knowledge_entity_drafts draft
           WHERE draft.merchant_id = target.merchant_id
             AND draft.import_id = target.id
             AND draft.status = 'pending'
         )`,
      [this.merchantId, importId],
    );
  }
}
