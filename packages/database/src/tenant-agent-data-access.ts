import type { Pool, QueryResultRow } from "pg";

import {
  agentTaskColumns,
  type AgentTaskRow,
  type ProviderAttemptRow,
  toAgentTask,
  toProviderAttempt,
} from "./agent-row-mappers";
import type {
  AgentTaskView,
  Conversation,
  ConversationMessage,
  SubmitAssetSearchInput,
  SubmitAgentTaskInput,
  SubmittedAgentTask,
} from "./agent-types";
import type { TenantId } from "./types";

interface ConversationRow extends QueryResultRow {
  created_at: Date;
  id: string;
  status: "active" | "archived";
  updated_at: Date;
}

interface ConversationMessageRow extends QueryResultRow {
  content: string;
  created_at: Date;
  id: string;
  role: "user" | "assistant";
}

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation was not found");
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationBusyError extends Error {
  constructor() {
    super("Conversation already has a queued or running task");
    this.name = "ConversationBusyError";
  }
}

function toConversationMessage(
  row: ConversationMessageRow,
): ConversationMessage {
  return {
    content: row.content,
    createdAt: row.created_at,
    id: row.id,
    role: row.role,
  };
}

export class TenantAgentDataAccess {
  constructor(
    private readonly pool: Pool,
    private readonly merchantId: TenantId,
  ) {}

  async submitTask(
    memberId: string,
    input: SubmitAgentTaskInput,
  ): Promise<SubmittedAgentTask> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      let conversationId: string | null = null;

      if (input.capability === "text") {
        if ("conversationId" in input && input.conversationId) {
          const conversation = await client.query<{ id: string }>(
            `SELECT id
             FROM conversations
             WHERE merchant_id = $1 AND id = $2 AND status = 'active'
             FOR UPDATE`,
            [this.merchantId, input.conversationId],
          );
          if (!conversation.rows[0]) {
            throw new ConversationNotFoundError();
          }
          conversationId = conversation.rows[0].id;
          const outstandingTask = await client.query(
            `SELECT 1
             FROM agent_tasks
             WHERE merchant_id = $1
               AND conversation_id = $2
               AND status IN ('queued', 'running')
             LIMIT 1`,
            [this.merchantId, conversationId],
          );
          if (outstandingTask.rowCount) {
            throw new ConversationBusyError();
          }
        } else {
          const title =
            "kind" in input
              ? input.action === "generate"
                ? input.intent
                : input.instruction
              : input.prompt;
          const conversation = await client.query<{ id: string }>(
            `INSERT INTO conversations
               (merchant_id, created_by_member_id, title)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [this.merchantId, memberId, title.slice(0, 80)],
          );
          conversationId = conversation.rows[0].id;
        }

        const userMessage =
          "kind" in input
            ? input.action === "generate"
              ? input.intent
              : input.instruction
            : input.prompt;
        await client.query(
          `INSERT INTO conversation_messages
             (merchant_id, conversation_id, role, content)
           VALUES ($1, $2, 'user', $3)`,
          [this.merchantId, conversationId, userMessage],
        );
        await client.query(
          `UPDATE conversations
           SET updated_at = now()
           WHERE merchant_id = $1 AND id = $2`,
          [this.merchantId, conversationId],
        );
      }

      const taskInput =
        input.capability === "embedding"
          ? { texts: input.texts }
          : "kind" in input
            ? {
                action: input.action,
                ...(input.action === "generate"
                  ? {
                      ...("allowAiImage" in input
                        ? { allowAiImage: input.allowAiImage }
                        : {}),
                      ...("imageUsage" in input
                        ? { imageUsage: input.imageUsage }
                        : {}),
                      intent: input.intent,
                      selectedKnowledgeTypes: input.selectedKnowledgeTypes,
                    }
                  : {
                      contentType: input.contentType,
                      instruction: input.instruction,
                      sourceText: input.sourceText,
                    }),
                kind: input.kind,
                skillId: input.skillId,
              }
            : { prompt: input.prompt };
      const task = await client.query<{ id: string }>(
        `INSERT INTO agent_tasks
           (merchant_id, created_by_member_id, conversation_id, capability, input)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          this.merchantId,
          memberId,
          conversationId,
          input.capability,
          JSON.stringify(taskInput),
        ],
      );
      await client.query("COMMIT");

      return {
        conversationId,
        id: task.rows[0].id,
        status: "queued",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async submitAssetSearch(
    memberId: string,
    input: SubmitAssetSearchInput,
  ): Promise<SubmittedAgentTask> {
    if (input.offeringId) {
      const offering = await this.pool.query(
        `SELECT 1
         FROM offerings
         WHERE merchant_id = $1 AND id = $2`,
        [this.merchantId, input.offeringId],
      );
      if (!offering.rowCount) {
        throw new Error("Offering was not found for this merchant");
      }
    }
    const task = await this.pool.query<{ id: string }>(
      `INSERT INTO agent_tasks
         (merchant_id, created_by_member_id, capability, input)
       VALUES (
         $1,
         $2,
         'embedding',
         jsonb_build_object(
           'purpose', 'asset-search',
           'texts', jsonb_build_array($3::text),
           'filters', jsonb_build_object(
             'limit', $4::integer,
             'offeringId', $5::text,
             'scene', $6::text
           )
         )
       )
       RETURNING id`,
      [
        this.merchantId,
        memberId,
        input.query,
        input.limit,
        input.offeringId,
        input.scene,
      ],
    );
    return {
      conversationId: null,
      id: task.rows[0].id,
      status: "queued",
    };
  }

  async getTask(taskId: string): Promise<AgentTaskView | null> {
    const taskResult = await this.pool.query<AgentTaskRow>(
      `SELECT ${agentTaskColumns}
       FROM agent_tasks
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, taskId],
    );
    const task = taskResult.rows[0];
    if (!task) {
      return null;
    }

    const attemptResult = await this.pool.query<ProviderAttemptRow>(
      `SELECT
         capability, provider_id, route_position, task_attempt, status,
         error_code, error_message, started_at, completed_at
       FROM provider_attempts
       WHERE merchant_id = $1 AND task_id = $2
       ORDER BY task_attempt, route_position, started_at`,
      [this.merchantId, taskId],
    );
    return {
      ...toAgentTask(task),
      providerAttempts: attemptResult.rows.map(toProviderAttempt),
    };
  }

  async getConversation(
    conversationId: string,
  ): Promise<Conversation | null> {
    const result = await this.pool.query<ConversationRow>(
      `SELECT id, status, created_at, updated_at
       FROM conversations
       WHERE merchant_id = $1 AND id = $2`,
      [this.merchantId, conversationId],
    );
    const conversation = result.rows[0];
    if (!conversation) {
      return null;
    }

    const messages = await this.pool.query<ConversationMessageRow>(
      `SELECT id, role, content, created_at
       FROM conversation_messages
       WHERE merchant_id = $1 AND conversation_id = $2
       ORDER BY created_at, id`,
      [this.merchantId, conversationId],
    );
    return {
      createdAt: conversation.created_at,
      id: conversation.id,
      messages: messages.rows.map(toConversationMessage),
      status: conversation.status,
      updatedAt: conversation.updated_at,
    };
  }
}
