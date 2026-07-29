import type {
  AgentTaskView,
  Conversation,
} from "@marketing-ai/database";

export function agentTaskResponse(task: AgentTaskView) {
  return {
    attempt_count: task.attemptCount,
    capability: task.capability,
    completed_at: task.completedAt,
    conversation_id: task.conversationId,
    created_at: task.createdAt,
    error:
      task.errorCode || task.errorMessage
        ? { code: task.errorCode, message: task.errorMessage }
        : null,
    max_attempts: task.maxAttempts,
    provider_attempts: task.providerAttempts.map((attempt) => ({
      completed_at: attempt.completedAt,
      error:
        attempt.errorCode || attempt.errorMessage
          ? { code: attempt.errorCode, message: attempt.errorMessage }
          : null,
      provider_id: attempt.providerId,
      route_position: attempt.routePosition,
      started_at: attempt.startedAt,
      status: attempt.status,
      task_attempt: attempt.taskAttempt,
    })),
    result: task.result,
    status: task.status,
    task_id: task.id,
    updated_at: task.updatedAt,
  };
}

export function conversationResponse(conversation: Conversation) {
  return {
    conversation_id: conversation.id,
    created_at: conversation.createdAt,
    messages: conversation.messages.map((message) => ({
      content: message.content,
      created_at: message.createdAt,
      id: message.id,
      role: message.role,
    })),
    status: conversation.status,
    updated_at: conversation.updatedAt,
  };
}
