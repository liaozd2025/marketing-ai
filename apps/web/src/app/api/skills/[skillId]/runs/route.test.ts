import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentForTenant: vi.fn(),
  forTenant: vi.fn(),
  getSession: vi.fn(),
  submitTask: vi.fn(),
  tenantId: vi.fn((value: string) => value),
}));

vi.mock("@marketing-ai/database", () => ({
  database: {
    agentForTenant: mocks.agentForTenant,
    forTenant: mocks.forTenant,
  },
  tenantId: mocks.tenantId,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { POST } from "./route";

const context = { params: Promise.resolve({ skillId: "daily-moments" }) };
const memberTouchContext = {
  params: Promise.resolve({ skillId: "member-touch" }),
};

describe("POST /api/skills/[skillId]/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-from-session",
      merchantId: "merchant-from-session",
    });
    mocks.forTenant.mockReturnValue({
      getMerchant: vi.fn().mockResolvedValue({
        verticalPackId: "beauty-v1",
      }),
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

  it("returns 202 while the worker has not run and binds tenant from session", async () => {
    const response = await POST(
      new Request("http://localhost/api/skills/daily-moments/runs", {
        body: JSON.stringify({ intent: "今天写得松弛一点" }),
        method: "POST",
      }),
      context,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "queued",
      task_id: "task-1",
    });
    expect(mocks.submitTask).toHaveBeenCalledWith(
      "member-from-session",
      expect.objectContaining({
        intent: "今天写得松弛一点",
        kind: "skill",
        skillId: "daily-moments",
      }),
    );
    expect(mocks.tenantId).toHaveBeenCalledWith("merchant-from-session");
  });

  it("rejects client tenant injection and unauthenticated requests", async () => {
    const injected = await POST(
      new Request("http://localhost/api/skills/daily-moments/runs", {
        body: JSON.stringify({ intent: "x", merchant_id: "attacker" }),
        method: "POST",
      }),
      context,
    );
    expect(injected.status).toBe(400);
    expect(mocks.submitTask).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue(null);
    const unauthorized = await POST(
      new Request("http://localhost/api/skills/daily-moments/runs", {
        body: "{}",
        method: "POST",
      }),
      context,
    );
    expect(unauthorized.status).toBe(401);
  });

  it("queues member-touch without accepting any PII-bearing input fields", async () => {
    const accepted = await POST(
      new Request("http://localhost/api/skills/member-touch/runs", {
        body: "{}",
        method: "POST",
      }),
      memberTouchContext,
    );
    expect(accepted.status).toBe(202);
    expect(mocks.submitTask).toHaveBeenCalledWith(
      "member-from-session",
      expect.objectContaining({
        intent: "按会员分层与触达场景生成零 PII 话术模板",
        selectedKnowledgeTypes: [],
        skillId: "member-touch",
      }),
    );

    mocks.submitTask.mockClear();
    const rejected = await POST(
      new Request("http://localhost/api/skills/member-touch/runs", {
        body: JSON.stringify({
          member_name: "张女士",
          member_phone: "13800138000",
        }),
        method: "POST",
      }),
      memberTouchContext,
    );
    expect(rejected.status).toBe(400);
    expect(mocks.submitTask).not.toHaveBeenCalled();
  });

  it("submits the configured community preset through the same async endpoint", async () => {
    const response = await POST(
      new Request("http://localhost/api/skills/community/runs", {
        body: JSON.stringify({ intent: "准备今天的社群内容" }),
        method: "POST",
      }),
      { params: Promise.resolve({ skillId: "community" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.submitTask).toHaveBeenCalledWith(
      "member-from-session",
      expect.objectContaining({
        capability: "text",
        kind: "skill",
        skillId: "community",
      }),
    );
  });
});
