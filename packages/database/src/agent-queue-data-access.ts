import type { ProviderAttemptRecorder } from "@marketing-ai/agent-service";
import type { Pool, QueryResultRow } from "pg";

import {
  agentTaskColumns,
  type AgentTaskRow,
  toClaimedAgentTask,
} from "./agent-row-mappers";
import type {
  ClaimedAgentTask,
  ConversationMessage,
} from "./agent-types";

interface AttemptMerchantRow extends QueryResultRow {
  id: string;
}

interface ConversationMessageRow extends QueryResultRow {
  content: string;
  created_at: Date;
  id: string;
  role: "user" | "assistant";
}

export class AgentQueueDataAccess implements ProviderAttemptRecorder {
  constructor(private readonly pool: Pool) {}

  async claimNextTask(workerId: string): Promise<ClaimedAgentTask | null> {
    const result = await this.pool.query<AgentTaskRow>(
      `WITH next_task AS (
         SELECT id
         FROM agent_tasks
         WHERE status = 'queued' AND available_at <= now()
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE agent_tasks task
       SET
         status = 'running',
         attempt_count = task.attempt_count + 1,
         locked_at = now(),
         locked_by = $1,
         started_at = COALESCE(task.started_at, now()),
         updated_at = now(),
         error_code = NULL,
         error_message = NULL
       FROM next_task
       WHERE task.id = next_task.id
       RETURNING ${agentTaskColumns
         .split(",")
         .map((column) => `task.${column.trim()}`)
         .join(", ")}`,
      [workerId],
    );
    return result.rows[0] ? toClaimedAgentTask(result.rows[0]) : null;
  }

  async getConversationMessages(
    task: ClaimedAgentTask,
  ): Promise<ConversationMessage[]> {
    if (!task.conversationId) {
      return [];
    }
    const result = await this.pool.query<ConversationMessageRow>(
      `SELECT id, role, content, created_at
       FROM conversation_messages
       WHERE merchant_id = $1 AND conversation_id = $2
       ORDER BY created_at, id`,
      [task.merchantId, task.conversationId],
    );
    return result.rows.map((row) => ({
      content: row.content,
      createdAt: row.created_at,
      id: row.id,
      role: row.role,
    }));
  }

  async completeTask(
    task: ClaimedAgentTask,
    workerId: string,
    result: unknown,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE agent_tasks
         SET
           status = 'succeeded',
           result = $3,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = now(),
           completed_at = now()
         WHERE id = $1 AND status = 'running' AND locked_by = $2`,
        [task.id, workerId, JSON.stringify(result)],
      );
      if (updated.rowCount !== 1) {
        throw new Error("Task lease was lost before completion");
      }

      if (
        task.capability === "text" &&
        task.conversationId &&
        typeof result === "object" &&
        result !== null &&
        "text" in result &&
        typeof result.text === "string"
      ) {
        await client.query(
          `INSERT INTO conversation_messages
             (merchant_id, conversation_id, role, content)
           VALUES ($1, $2, 'assistant', $3)`,
          [task.merchantId, task.conversationId, result.text],
        );
        await client.query(
          `UPDATE conversations
           SET updated_at = now()
           WHERE merchant_id = $1 AND id = $2`,
          [task.merchantId, task.conversationId],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async failOrRetryTask(
    task: ClaimedAgentTask,
    workerId: string,
    error: { code: string; message: string; retryable: boolean },
  ): Promise<"queued" | "failed"> {
    const retry = error.retryable && task.attemptCount < task.maxAttempts;
    const status = retry ? "queued" : "failed";
    const delaySeconds = Math.min(2 ** task.attemptCount, 30);
    const result = await this.pool.query(
      `UPDATE agent_tasks
       SET
         status = $3,
         error_code = $4,
         error_message = $5,
         available_at = CASE
           WHEN $3 = 'queued' THEN now() + ($6 * interval '1 second')
           ELSE available_at
         END,
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now(),
         completed_at = CASE WHEN $3 = 'failed' THEN now() ELSE NULL END
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
      [task.id, workerId, status, error.code, error.message, delaySeconds],
    );
    if (result.rowCount !== 1) {
      throw new Error("Task lease was lost before failure handling");
    }
    return status;
  }

  async recoverStaleTasks(leaseSeconds = 600): Promise<number> {
    const result = await this.pool.query(
      `UPDATE agent_tasks
       SET
         status = CASE
           WHEN attempt_count < max_attempts THEN 'queued'
           ELSE 'failed'
         END,
         error_code = 'WORKER_LEASE_EXPIRED',
         error_message = 'Worker stopped before completing the task',
         available_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         updated_at = now(),
         completed_at = CASE
           WHEN attempt_count >= max_attempts THEN now()
           ELSE NULL
         END
       WHERE status = 'running'
         AND locked_at < now() - ($1 * interval '1 second')`,
      [leaseSeconds],
    );
    await this.pool.query(
      `UPDATE provider_attempts attempts
       SET
         status = 'failed',
         error_code = 'WORKER_LEASE_EXPIRED',
         error_message = 'Worker stopped during provider call',
         completed_at = now()
       FROM agent_tasks tasks
       WHERE attempts.task_id = tasks.id
         AND attempts.merchant_id = tasks.merchant_id
         AND attempts.status = 'running'
         AND tasks.error_code = 'WORKER_LEASE_EXPIRED'`,
    );
    return result.rowCount ?? 0;
  }

  async startProviderAttempt(input: {
    capability: "text" | "image" | "embedding";
    providerId: string;
    routePosition: number;
    taskAttempt: number;
    taskId: string;
  }): Promise<string> {
    const result = await this.pool.query<AttemptMerchantRow>(
      `INSERT INTO provider_attempts
         (
           merchant_id, task_id, capability, provider_id, route_position,
           task_attempt, status
         )
       SELECT
         merchant_id, id, $2, $3, $4, $5, 'running'
       FROM agent_tasks
       WHERE id = $1 AND status = 'running'
       RETURNING id`,
      [
        input.taskId,
        input.capability,
        input.providerId,
        input.routePosition,
        input.taskAttempt,
      ],
    );
    if (!result.rows[0]) {
      throw new Error("Cannot record an attempt for an unclaimed task");
    }
    return result.rows[0].id;
  }

  async finishProviderAttempt(
    attemptId: string,
    result: {
      errorCode?: string;
      errorMessage?: string;
      status: "succeeded" | "failed";
    },
  ): Promise<void> {
    const updated = await this.pool.query(
      `UPDATE provider_attempts
       SET
         status = $2,
         error_code = $3,
         error_message = $4,
         completed_at = now()
       WHERE id = $1 AND status = 'running'`,
      [
        attemptId,
        result.status,
        result.errorCode ?? null,
        result.errorMessage ?? null,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new Error("Provider attempt was already completed or missing");
    }
  }
}
