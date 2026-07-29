import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentForTenant: vi.fn(),
  getSession: vi.fn(),
  submitTask: vi.fn(),
  tenantId: vi.fn((value: string) => value),
}));

vi.mock("@marketing-ai/database", () => ({
  ConversationBusyError: class extends Error {},
  ConversationNotFoundError: class extends Error {},
  database: { agentForTenant: mocks.agentForTenant },
  tenantId: mocks.tenantId,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { POST } from "./route";

describe("POST /api/agent/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-from-session",
      merchantId: "merchant-from-session",
    });
    mocks.agentForTenant.mockReturnValue({
      submitTask: mocks.submitTask,
    });
    mocks.submitTask.mockResolvedValue({
      conversationId: "conversation-1",
      id: "task-1",
      status: "queued",
    });
  });

  it("persists a queued task and immediately returns 202", async () => {
    const response = await POST(
      new Request("http://localhost/api/agent/tasks", {
        body: JSON.stringify({ capability: "text", prompt: "hello" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      conversation_id: "conversation-1",
      status: "queued",
      task_id: "task-1",
    });
    expect(mocks.tenantId).toHaveBeenCalledWith("merchant-from-session");
    expect(mocks.submitTask).toHaveBeenCalledWith("member-from-session", {
      capability: "text",
      prompt: "hello",
    });
  });

  it("rejects client-supplied tenant identity before persistence", async () => {
    const response = await POST(
      new Request("http://localhost/api/agent/tasks", {
        body: JSON.stringify({
          capability: "text",
          merchant_id: "merchant-from-client",
          prompt: "hello",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitTask).not.toHaveBeenCalled();
  });

  it("requires the signed session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/agent/tasks", {
        body: JSON.stringify({ capability: "text", prompt: "hello" }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.submitTask).not.toHaveBeenCalled();
  });
});
