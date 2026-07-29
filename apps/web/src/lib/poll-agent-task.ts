export interface PolledAgentTask<Result = unknown> {
  readonly error: { readonly code: string | null; readonly message: string | null } | null;
  readonly result: Result | null;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly task_id: string;
}

export class AgentTaskFailedError extends Error {
  constructor(
    readonly task: PolledAgentTask,
  ) {
    super(task.error?.message ?? "生成任务执行失败");
    this.name = "AgentTaskFailedError";
  }
}

export async function pollAgentTask<Result>(
  taskId: string,
  options: {
    readonly fetcher?: typeof fetch;
    readonly intervalMs?: number;
    readonly maxAttempts?: number;
    readonly onStatus?: (status: PolledAgentTask["status"]) => void;
  } = {},
): Promise<PolledAgentTask<Result>> {
  const fetcher = options.fetcher ?? fetch;
  const intervalMs = options.intervalMs ?? 800;
  const maxAttempts = options.maxAttempts ?? 150;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetcher(`/api/agent/tasks/${taskId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`轮询任务失败（HTTP ${response.status}）`);
    }
    const task = (await response.json()) as PolledAgentTask<Result>;
    options.onStatus?.(task.status);
    if (task.status === "succeeded") return task;
    if (task.status === "failed") throw new AgentTaskFailedError(task);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("生成任务等待超时，请稍后重试");
}
