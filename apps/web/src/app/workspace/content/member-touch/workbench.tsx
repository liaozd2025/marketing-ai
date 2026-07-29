"use client";

import type {
  MemberTouchAlternativeResult,
  MemberTouchPlaceholderDefinition,
  MemberTouchRunResult,
} from "@marketing-ai/content-skills";
import { useState } from "react";

import { pollAgentTask } from "@/lib/poll-agent-task";

type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

const statusLabel: Record<RunStatus, string> = {
  failed: "生成失败",
  idle: "尚未生成",
  queued: "已进入异步队列",
  running: "Worker 正在生成并校验",
  succeeded: "矩阵已生成",
};

async function submitRun(
  onStatus: (status: RunStatus) => void,
): Promise<MemberTouchRunResult> {
  const response = await fetch("/api/skills/member-touch/runs", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const failure = (await response.json()) as { message?: string };
    throw new Error(failure.message ?? "无法创建会员触达任务");
  }
  const submitted = (await response.json()) as {
    status: "queued";
    task_id: string;
  };
  onStatus(submitted.status);
  const task = await pollAgentTask<MemberTouchRunResult>(submitted.task_id, {
    onStatus,
  });
  if (!task.result) throw new Error("任务完成但没有返回话术矩阵");
  return task.result;
}

function TemplateText({
  alternative,
}: {
  readonly alternative: MemberTouchAlternativeResult;
}) {
  const parts = alternative.text.split(/(\{\{[a-z][a-z0-9_]*\}\})/g);
  return (
    <p className="touch-copy">
      {parts.map((part, index) =>
        /^\{\{[a-z][a-z0-9_]*\}\}$/.test(part) ? (
          <code key={`${part}-${index}`}>{part}</code>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function AlternativeCard({
  alternative,
  index,
}: {
  readonly alternative: MemberTouchAlternativeResult;
  readonly index: number;
}) {
  return (
    <article
      className={`touch-alternative ${alternative.copyReady ? "" : "blocked"}`}
    >
      <header>
        <strong>话术 {index + 1}</strong>
        <span
          className={alternative.copyReady ? "publish-ready" : "publish-blocked"}
        >
          {alternative.copyReady ? "已过违禁词校验" : "命中违禁词，禁止复制"}
        </span>
      </header>
      <TemplateText alternative={alternative} />
      <p className="placeholder-usage">
        占位符：{alternative.placeholders.map((key) => `{{${key}}}`).join("、")}
      </p>
      {alternative.compliance.hits.length ? (
        <div className="lint-panel" role="alert">
          <strong>必须先处理以下命中项</strong>
          <ul>
            {alternative.compliance.hits.map((hit, hitIndex) => (
              <li key={`${hit.term}-${hit.start}-${hitIndex}`}>
                「{hit.term}」· {hit.category}
                {hit.replacement ? ` · 建议「${hit.replacement}」` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        className="copy-button"
        disabled={!alternative.copyReady}
        onClick={() => navigator.clipboard.writeText(alternative.text)}
        type="button"
      >
        {alternative.copyReady ? "复制模板" : "违禁词处理后才能复制"}
      </button>
    </article>
  );
}

export function MemberTouchWorkbench({
  initialPlaceholders,
  initialScenarios,
  segmentCount,
}: {
  readonly initialPlaceholders: readonly MemberTouchPlaceholderDefinition[];
  readonly initialScenarios: readonly string[];
  readonly segmentCount: number;
}) {
  const [result, setResult] = useState<MemberTouchRunResult | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    try {
      const completed = await submitRun(setStatus);
      setResult(completed);
      setStatus("succeeded");
    } catch (caught) {
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "生成失败");
    }
  };
  const busy = status === "queued" || status === "running";
  const placeholders = result?.placeholderDefinitions ?? initialPlaceholders;
  const scenarios = result?.scenarios ?? initialScenarios;
  const blockedCount =
    result?.cells.reduce(
      (count, cell) =>
        count +
        cell.alternatives.filter((alternative) => !alternative.copyReady)
          .length,
      0,
    ) ?? 0;

  return (
    <>
      <section className="touch-hero">
        <p className="eyebrow">会员生命周期触达 Skill</p>
        <h1>一次生成完整分层话术矩阵</h1>
        <p>
          按知识库中的会员分层 × {scenarios.length} 个触达场景生成，每格提供
          2–3 条选择。
        </p>

        <div className="zero-pii-panel">
          <strong>平台零 PII</strong>
          <p>
            本页没有会员姓名、手机号等输入框，也不接收或保存任何会员个人数据。
            复制模板后，请在平台外将占位符替换为实际内容再发送。
          </p>
          <div className="placeholder-guide">
            {placeholders.map((placeholder) => (
              <div key={placeholder.key}>
                <code>{`{{${placeholder.key}}}`}</code>
                <strong>{placeholder.label}</strong>
                <small>{placeholder.description}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="touch-generate-panel">
          <div>
            <strong>
              {segmentCount} 个分层 × {scenarios.length} 个场景
            </strong>
            <p>{scenarios.join(" / ")}</p>
          </div>
          <button
            disabled={busy || segmentCount === 0}
            onClick={generate}
            type="button"
          >
            {busy ? statusLabel[status] : "生成全部话术"}
          </button>
        </div>
        {segmentCount === 0 ? (
          <p className="result-banner error">
            请先在知识库中建立至少一个会员分层定义。
          </p>
        ) : null}
        <p className={`task-status ${status}`} role="status">
          {statusLabel[status]}
        </p>
        {error ? <p className="result-banner error">{error}</p> : null}
      </section>

      {result ? (
        <section className="touch-results">
          <div className="publish-summary">
            <strong>{result.cells.length} 个矩阵格</strong>
            <span>{result.cells.length * 2}+ 条可选话术</span>
            <span className={blockedCount ? "danger-text" : ""}>
              {blockedCount} 条因违禁词禁止复制
            </span>
          </div>
          {result.cells.map((cell) => (
            <section
              className="touch-cell"
              key={`${cell.segment.key}-${cell.scenario}`}
            >
              <header className="touch-cell-header">
                <div>
                  <span className="content-type">{cell.segment.name}</span>
                  <h2>{cell.scenario}</h2>
                </div>
                <p>{cell.segment.communicationGoal}</p>
              </header>
              <div className="touch-alternatives">
                {cell.alternatives.map((alternative, index) => (
                  <AlternativeCard
                    alternative={alternative}
                    index={index}
                    key={`${cell.scenario}-${index}`}
                  />
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : null}
    </>
  );
}
