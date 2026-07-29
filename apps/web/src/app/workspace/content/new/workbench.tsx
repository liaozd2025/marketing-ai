"use client";

import type {
  SkillContentResult,
  SkillRunResult,
} from "@marketing-ai/content-skills";
import { useState } from "react";

import { pollAgentTask } from "@/lib/poll-agent-task";

interface ContextItem {
  readonly count: number;
  readonly label: string;
  readonly percentage: number;
  readonly type: string;
}

async function submitRun(body: Record<string, unknown>): Promise<SkillRunResult> {
  const response = await fetch("/api/skills/daily-moments/runs", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const failure = (await response.json()) as { message?: string };
    throw new Error(failure.message ?? "无法创建生成任务");
  }
  const submitted = (await response.json()) as { task_id: string };
  const task = await pollAgentTask<SkillRunResult>(submitted.task_id);
  if (!task.result) throw new Error("任务完成但没有返回内容");
  return task.result;
}

function HighlightedText({
  item,
}: {
  readonly item: SkillContentResult;
}) {
  if (item.compliance.hits.length === 0) {
    return <p className="moments-copy">{item.text}</p>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [index, hit] of item.compliance.hits.entries()) {
    if (hit.start < cursor) continue;
    parts.push(item.text.slice(cursor, hit.start));
    parts.push(
      <mark className="compliance-hit" key={`${hit.start}-${index}`}>
        {item.text.slice(hit.start, hit.end)}
      </mark>,
    );
    cursor = hit.end;
  }
  parts.push(item.text.slice(cursor));
  return <p className="moments-copy">{parts}</p>;
}

function ResultCard({
  busy,
  item,
  onAction,
}: {
  readonly busy: boolean;
  readonly item: SkillContentResult;
  readonly onAction: (
    action: "refine" | "compliance_rewrite",
    item: SkillContentResult,
    instruction: string,
  ) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const refine = (value: string) => onAction("refine", item, value);

  return (
    <article className={`moments-card ${item.publishReady ? "" : "blocked"}`}>
      <header className="moments-card-header">
        <div>
          <span className="content-type">{item.label}</span>
          <h2>{item.label}朋友圈</h2>
        </div>
        <span className={item.publishReady ? "publish-ready" : "publish-blocked"}>
          {item.publishReady
            ? "✓ 已过校验，可复制发布"
            : `不可发布 · ${item.compliance.hits.length} 处违规`}
        </span>
      </header>

      <HighlightedText item={item} />

      {item.compliance.hits.length ? (
        <div className="lint-panel" role="alert">
          <strong>已阻止「可发布」，需修改后发布</strong>
          <ul>
            {item.compliance.hits.map((hit, index) => (
              <li key={`${hit.term}-${hit.start}-${index}`}>
                「{hit.term}」· {hit.category} ·
                {hit.replacement ? ` 建议改为「${hit.replacement}」` : " 请删除或改写"}
              </li>
            ))}
          </ul>
          <button
            disabled={busy}
            onClick={() =>
              onAction(
                "compliance_rewrite",
                item,
                "根据合规词表逐项改写，保留原意与真实经营信息",
              )
            }
            type="button"
          >
            一键合规改写
          </button>
        </div>
      ) : null}

      <section className="asset-advice">
        <strong>选图建议</strong>
        <p>{item.assetAdvice}</p>
        {item.assetSuggestions.length ? (
          <ul>
            {item.assetSuggestions.map((asset) => (
              <li key={asset.assetId}>
                <span>{asset.label}</span>
                {asset.originalName} · {asset.scene}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="refine-box">
        <label htmlFor={`refine-${item.contentType}`}>聊着改这一条</label>
        <div className="quick-refines">
          {["更口语", "更简短", "换个开头", "加点 emoji"].map((value) => (
            <button
              className="chip-button"
              disabled={busy}
              key={value}
              onClick={() => refine(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
        <div className="refine-row">
          <input
            maxLength={500}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：保留价格，结尾更自然"
            value={instruction}
          />
          <button
            disabled={busy || !instruction.trim()}
            onClick={() => refine(instruction)}
            type="button"
          >
            {busy ? "处理中…" : "修改"}
          </button>
        </div>
      </div>

      <button
        className="copy-button"
        disabled={!item.publishReady}
        onClick={() => navigator.clipboard.writeText(item.text)}
        type="button"
      >
        {item.publishReady ? "一键复制" : "修改合规后可复制"}
      </button>
    </article>
  );
}

export function DailyMomentsWorkbench({
  context,
}: {
  readonly context: readonly ContextItem[];
}) {
  const [selected, setSelected] = useState(
    context.filter((item) => item.count > 0).map((item) => item.type),
  );
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<SkillRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await submitRun({
          action: "generate",
          intent: intent || undefined,
          selected_knowledge_types: selected,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

  const runCardAction = async (
    action: "refine" | "compliance_rewrite",
    item: SkillContentResult,
    instruction: string,
  ) => {
    setBusyType(item.contentType);
    setError(null);
    try {
      const revised = await submitRun({
        action,
        content_type: item.contentType,
        instruction,
        source_text: item.text,
      });
      const replacement = revised.items[0];
      setResult((current) =>
        current && replacement
          ? {
              ...current,
              items: current.items.map((candidate) =>
                candidate.contentType === replacement.contentType
                  ? replacement
                  : candidate,
              ),
            }
          : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修改失败");
    } finally {
      setBusyType(null);
    }
  };

  const publishable =
    result?.items.filter((item) => item.publishReady).length ?? 0;
  const blocked = (result?.items.length ?? 0) - publishable;

  return (
    <>
      <section className="content-hero">
        <p className="eyebrow">朋友圈日更 Skill</p>
        <h1>今天想发点什么？</h1>
        <p>选好参考资料，一键生成「人设 / 种草 / 活动」三条朋友圈。</p>
        <div className="content-composer">
          <div className="context-selector">
            <span>本次参考的知识库上下文</span>
            <div className="context-chips">
              {context.map((item) => {
                const active = selected.includes(item.type);
                return (
                  <button
                    aria-pressed={active}
                    className={`context-chip ${active ? "active" : ""}`}
                    disabled={item.count === 0 || busy}
                    key={item.type}
                    onClick={() =>
                      setSelected((current) =>
                        active
                          ? current.filter((type) => type !== item.type)
                          : [...current, item.type],
                      )
                    }
                    type="button"
                  >
                    {item.label} {item.count} · {item.percentage}%
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            maxLength={2000}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="可选：补充今天的天气、门店状态或想说的话；留空也能直接生成。"
            rows={4}
            value={intent}
          />
          <div className="composer-footer">
            <small>
              选项用于强调参考重点；品牌档案、Offering、客群、活动和会员分层仍会全量注入。
            </small>
            <button disabled={busy} onClick={generate} type="button">
              {busy ? "Agent 正在生成…" : "一键生成今天的朋友圈（3 条）"}
            </button>
          </div>
        </div>
        {error ? <p className="result-banner error">{error}</p> : null}
      </section>

      {result ? (
        <section className="moments-results">
          <div className="publish-summary" role="status">
            <strong>共 {result.items.length} 条</strong>
            <span>{publishable} 可发布</span>
            <span className={blocked ? "danger-text" : ""}>{blocked} 待改</span>
          </div>
          <div className="moments-grid">
            {result.items.map((item) => (
              <ResultCard
                busy={busyType === item.contentType}
                item={item}
                key={item.contentType}
                onAction={runCardAction}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
