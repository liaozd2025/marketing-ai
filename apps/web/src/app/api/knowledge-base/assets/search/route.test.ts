import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentForTenant: vi.fn(),
  getSession: vi.fn(),
  submitAssetSearch: vi.fn(),
  tenantId: vi.fn((value: string) => value),
}));

vi.mock("@marketing-ai/database", () => ({
  database: { agentForTenant: mocks.agentForTenant },
  tenantId: mocks.tenantId,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { POST } from "./route";

describe("POST /api/knowledge-base/assets/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-from-session",
      merchantId: "merchant-from-session",
    });
    mocks.agentForTenant.mockReturnValue({
      submitAssetSearch: mocks.submitAssetSearch,
    });
    mocks.submitAssetSearch.mockResolvedValue({
      conversationId: null,
      id: "search-task-1",
      status: "queued",
    });
  });

  it("returns 202 without waiting for the embedding provider", async () => {
    const response = await POST(
      new Request("http://localhost/api/knowledge-base/assets/search", {
        body: JSON.stringify({
          limit: 12,
          query: "适合秋季护肤氛围的图",
          scene: "护理记录",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "queued",
      task_id: "search-task-1",
    });
    expect(mocks.submitAssetSearch).toHaveBeenCalledWith(
      "member-from-session",
      {
        limit: 12,
        offeringId: null,
        query: "适合秋季护肤氛围的图",
        scene: "护理记录",
      },
    );
    expect(mocks.tenantId).toHaveBeenCalledWith("merchant-from-session");
  });

  it("rejects client-supplied tenant identity", async () => {
    const response = await POST(
      new Request("http://localhost/api/knowledge-base/assets/search", {
        body: JSON.stringify({
          merchant_id: "merchant-from-client",
          query: "query",
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.submitAssetSearch).not.toHaveBeenCalled();
  });
});
