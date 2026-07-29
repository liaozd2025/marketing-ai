import type { QueryResultRow } from "pg";

import type {
  AgentTask,
  AgentTaskInput,
  ClaimedAgentTask,
  ProviderAttempt,
} from "./agent-types";

export interface AgentTaskRow extends QueryResultRow {
  attempt_count: number;
  capability: AgentTask["capability"];
  completed_at: Date | null;
  conversation_id: string | null;
  created_at: Date;
  created_by_member_id: string;
  error_code: string | null;
  error_message: string | null;
  id: string;
  input: AgentTaskInput;
  max_attempts: number;
  merchant_id: string;
  result: unknown | null;
  status: AgentTask["status"];
  updated_at: Date;
}

export interface ProviderAttemptRow extends QueryResultRow {
  capability: ProviderAttempt["capability"];
  completed_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  provider_id: string;
  route_position: number;
  started_at: Date;
  status: ProviderAttempt["status"];
  task_attempt: number;
}

export const agentTaskColumns = `
  id, merchant_id, created_by_member_id, conversation_id, capability, status, input, result,
  error_code, error_message, attempt_count, max_attempts, created_at,
  updated_at, completed_at
`;

export function toAgentTask(row: AgentTaskRow): AgentTask {
  return {
    attemptCount: row.attempt_count,
    capability: row.capability,
    completedAt: row.completed_at,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    createdByMemberId: row.created_by_member_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    id: row.id,
    input: row.input,
    maxAttempts: row.max_attempts,
    result: row.result,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function toClaimedAgentTask(row: AgentTaskRow): ClaimedAgentTask {
  return { ...toAgentTask(row), merchantId: row.merchant_id };
}

export function toProviderAttempt(row: ProviderAttemptRow): ProviderAttempt {
  return {
    capability: row.capability,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    providerId: row.provider_id,
    routePosition: row.route_position,
    startedAt: row.started_at,
    status: row.status,
    taskAttempt: row.task_attempt,
  };
}
