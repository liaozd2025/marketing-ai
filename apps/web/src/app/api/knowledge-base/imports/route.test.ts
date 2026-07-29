import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createImportAndQueueExtraction: vi.fn(),
  forTenant: vi.fn(),
  getSession: vi.fn(),
  listImports: vi.fn(),
  tenantId: vi.fn((value: string) => value),
}));

vi.mock("@marketing-ai/database", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@marketing-ai/database")
  >();
  return {
    ...actual,
    database: { forTenant: mocks.forTenant },
    tenantId: mocks.tenantId,
  };
});
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));

import { GET, POST } from "./route";

describe("/api/knowledge-base/imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      memberId: "member-from-session",
      merchantId: "merchant-from-session",
    });
    mocks.forTenant.mockReturnValue({
      coldStart: {
        createImportAndQueueExtraction: mocks.createImportAndQueueExtraction,
        listImports: mocks.listImports,
      },
    });
    mocks.createImportAndQueueExtraction.mockResolvedValue({
      id: "import-1",
      status: "queued",
      taskId: "task-1",
    });
    mocks.listImports.mockResolvedValue([]);
  });

  it("queues pasted material for the signed-in tenant without writing entities", async () => {
    const response = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: JSON.stringify({
          source_name: "点评店铺介绍",
          text: "溪岚护理是一家社区护理工作室。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      import_id: "import-1",
      status: "queued",
      task_id: "task-1",
    });
    expect(mocks.createImportAndQueueExtraction).toHaveBeenCalledWith(
      "member-from-session",
      expect.objectContaining({
        sourceKind: "paste",
        sourceMediaType: "text/plain",
        sourceName: "点评店铺介绍",
        sourceText: "溪岚护理是一家社区护理工作室。",
      }),
    );
    expect(mocks.tenantId).toHaveBeenCalledWith("merchant-from-session");
  });

  it("accepts a bounded text file and rejects tenant injection", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["# 价目表\n肩颈舒缓护理 298 元"], "价目表.md", {
        type: "text/markdown",
      }),
    );
    const uploaded = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: form,
        method: "POST",
      }),
    );
    expect(uploaded.status).toBe(202);
    expect(mocks.createImportAndQueueExtraction).toHaveBeenLastCalledWith(
      "member-from-session",
      expect.objectContaining({
        sourceKind: "upload",
        sourceMediaType: "text/markdown",
        sourceName: "价目表.md",
        sourceText: "# 价目表\n肩颈舒缓护理 298 元",
      }),
    );

    mocks.createImportAndQueueExtraction.mockClear();
    const injected = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: JSON.stringify({
          merchant_id: "attacker",
          text: "越权资料",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(injected.status).toBe(400);
    expect(mocks.createImportAndQueueExtraction).not.toHaveBeenCalled();
  });

  it("rejects binary content disguised as a supported text file", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [Uint8Array.from([0xff, 0xfe, 0x01, 0x02, 0x41, 0x42])],
        "伪装资料.txt",
        { type: "text/plain" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: form,
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      message: expect.stringContaining("UTF-8 文本"),
    });
    expect(mocks.createImportAndQueueExtraction).not.toHaveBeenCalled();
  });

  it("requires a signed session for submit and history", async () => {
    mocks.getSession.mockResolvedValue(null);
    const request = new Request(
      "http://localhost/api/knowledge-base/imports",
      {
        body: JSON.stringify({ text: "资料" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    expect((await POST(request)).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });

  it("rejects member PII before raw source material reaches the queue", async () => {
    const response = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: JSON.stringify({
          text: "会员张女士，手机号 13800138000，准备做沉睡唤醒。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_request",
      message: expect.stringContaining("个人信息"),
    });
    expect(mocks.createImportAndQueueExtraction).not.toHaveBeenCalled();
  });

  it("rejects labeled member names and WeChat identifiers before queueing", async () => {
    const response = await POST(
      new Request("http://localhost/api/knowledge-base/imports", {
        body: JSON.stringify({
          text: "会员姓名：张三，微信号：zhangsan_88，准备做沉睡唤醒。",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createImportAndQueueExtraction).not.toHaveBeenCalled();
  });
});
