import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentForTenant: vi.fn(),
  forTenant: vi.fn(),
  getComposition: vi.fn(),
  getSession: vi.fn(),
  getTask: vi.fn(),
  readCompositionFile: vi.fn(),
  tenantId: vi.fn((value: string) => value),
}));

vi.mock("@marketing-ai/database", () => ({
  database: {
    agentForTenant: mocks.agentForTenant,
    forTenant: mocks.forTenant,
  },
  tenantId: mocks.tenantId,
}));
vi.mock("@marketing-ai/asset-storage", () => ({
  readCompositionFile: mocks.readCompositionFile,
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { GET } from "./route";

const context = {
  params: Promise.resolve({
    skillId: "xiaohongshu",
    taskId: "11111111-1111-4111-8111-111111111111",
  }),
};
const baseTask = {
  id: "11111111-1111-4111-8111-111111111111",
  input: { kind: "skill", skillId: "xiaohongshu" },
  result: {
    cover: {
      compositionId: "22222222-2222-4222-8222-222222222222",
    },
    protocolVersion: "marketing-ai.xiaohongshu-package-result.v1",
    publishReady: true,
  },
  status: "succeeded",
};

describe("GET Xiaohongshu cover download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-a",
      merchantId: "merchant-a",
    });
    mocks.agentForTenant.mockReturnValue({ getTask: mocks.getTask });
    mocks.forTenant.mockReturnValue({
      compositions: { get: mocks.getComposition },
    });
    mocks.getTask.mockResolvedValue(baseTask);
    mocks.getComposition.mockResolvedValue({
      byteSize: 8,
      id: "22222222-2222-4222-8222-222222222222",
      sourceTaskId: baseTask.id,
    });
    mocks.readCompositionFile.mockResolvedValue(
      Buffer.from("89504e470d0a1a0a", "hex"),
    );
  });

  it("downloads only a publish-ready cover linked to the same persisted task", async () => {
    const response = await GET(
      new Request("http://localhost/x"),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(mocks.getTask).toHaveBeenCalledWith(baseTask.id);
  });

  it("blocks prohibited covers and returns 404 across tenant boundaries", async () => {
    mocks.getTask.mockResolvedValue({
      ...baseTask,
      result: {
        ...baseTask.result,
        cover: { compositionId: null },
        publishReady: false,
      },
    });
    const blocked = await GET(new Request("http://localhost/x"), context);
    expect(blocked.status).toBe(423);
    expect(mocks.readCompositionFile).not.toHaveBeenCalled();

    mocks.getTask.mockResolvedValue(null);
    const crossTenant = await GET(new Request("http://localhost/x"), context);
    expect(crossTenant.status).toBe(404);
  });
});
