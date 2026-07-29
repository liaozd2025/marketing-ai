import { describe, expect, it, vi } from "vitest";

import {
  AgentTaskFailedError,
  pollAgentTask,
} from "./poll-agent-task";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

describe("agent task polling seam", () => {
  it("waits through queued and running before returning the result", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "queued", task_id: "task-1" }))
      .mockResolvedValueOnce(response({ status: "running", task_id: "task-1" }))
      .mockResolvedValueOnce(
        response({
          result: { items: [1, 2, 3] },
          status: "succeeded",
          task_id: "task-1",
        }),
      );

    await expect(
      pollAgentTask("task-1", {
        fetcher,
        intervalMs: 0,
        maxAttempts: 3,
      }),
    ).resolves.toMatchObject({ result: { items: [1, 2, 3] } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("surfaces a terminal worker failure", async () => {
    await expect(
      pollAgentTask("task-1", {
        fetcher: vi.fn().mockResolvedValue(
          response({
            error: { code: "INVALID_SKILL_PROVIDER_OUTPUT", message: "bad JSON" },
            status: "failed",
            task_id: "task-1",
          }),
        ),
        intervalMs: 0,
      }),
    ).rejects.toBeInstanceOf(AgentTaskFailedError);
  });
});
