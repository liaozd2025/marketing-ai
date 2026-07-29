"use client";

import type {
  XiaohongshuImageUsage,
  XiaohongshuPackageResult,
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
  running: "正在生成文案、语义选图并渲染封面",
  succeeded: "完整图文包已生成",
};

async function submitRun(
  input: {
    readonly allowAiImage: boolean;
    readonly imageUsage: XiaohongshuImageUsage;
    readonly intent: string;
  },
  onStatus: (status: RunStatus) => void,
): Promise<XiaohongshuPackageResult> {
  const response = await fetch("/api/skills/xiaohongshu/runs", {
    body: JSON.stringify({
      allow_ai_image: input.allowAiImage,
      image_usage: input.imageUsage,
      intent: input.intent || undefined,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    const failure = (await response.json()) as { message?: string };
    throw new Error(failure.message ?? "无法创建小红书图文任务");
  }
  const submitted = (await response.json()) as {
    status: "queued";
    task_id: string;
  };
  onStatus(submitted.status);
  const task = await pollAgentTask<XiaohongshuPackageResult>(
    submitted.task_id,
    { onStatus },
  );
  if (!task.result) throw new Error("任务完成但没有返回图文包");
  return task.result;
}

function ComplianceSummary({
  result,
}: {
  readonly result: XiaohongshuPackageResult;
}) {
  const fields = [
    ["标题", result.compliance.fields.title],
    ["正文", result.compliance.fields.body],
    ["封面标题", result.compliance.fields.coverHeadline],
    ["封面副文案", result.compliance.fields.coverBody],
  ] as const;
  const hits = fields.flatMap(([label, report]) =>
    report.hits.map((hit) => ({ ...hit, label })),
  );
  return hits.length ? (
    <div className="lint-panel" role="alert">
      <strong>命中违禁词，封面下载已阻断</strong>
      <ul>
        {hits.map((hit, index) => (
          <li key={`${hit.label}-${hit.term}-${hit.start}-${index}`}>
            {hit.label}：「{hit.term}」· {hit.category}
            {hit.replacement ? ` · 建议「${hit.replacement}」` : ""}
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <p className="publish-ready">标题、正文和封面文字均已通过违禁词校验</p>
  );
}

export function XiaohongshuWorkbench({
  description,
  merchantName,
}: {
  readonly description: string;
  readonly merchantName: string;
}) {
  const [intent, setIntent] = useState("");
  const [imageUsage, setImageUsage] =
    useState<XiaohongshuImageUsage>("atmosphere");
  const [allowAiImage, setAllowAiImage] = useState(false);
  const [result, setResult] = useState<XiaohongshuPackageResult | null>(null);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const busy = status === "queued" || status === "running";

  const generate = async () => {
    setError(null);
    setResult(null);
    try {
      const completed = await submitRun(
        { allowAiImage, imageUsage, intent },
        setStatus,
      );
      setResult(completed);
      setStatus("succeeded");
    } catch (caught) {
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "生成失败");
    }
  };

  return (
    <>
      <section className="content-hero xhs-hero">
        <p className="eyebrow">小红书种草图文 Skill</p>
        <h1>文案、封面和配图一次成包</h1>
        <p>{description}</p>
        <div className="content-composer xhs-composer">
          <label>
            <span>这次想写什么</span>
            <textarea
              maxLength={2_000}
              onChange={(event) => setIntent(event.target.value)}
              placeholder={`例如：用真实服务过程介绍 ${merchantName} 的晚间护理`}
              rows={4}
              value={intent}
            />
          </label>
          <fieldset className="xhs-usage">
            <legend>配图用途</legend>
            <label>
              <input
                checked={imageUsage === "atmosphere"}
                name="imageUsage"
                onChange={() => setImageUsage("atmosphere")}
                type="radio"
              />
              <span>
                <strong>氛围图</strong>
                优先使用本店实拍；无匹配素材时可选择 AI 辅路线
              </span>
            </label>
            <label>
              <input
                checked={imageUsage === "effect"}
                name="imageUsage"
                onChange={() => {
                  setImageUsage("effect");
                  setAllowAiImage(false);
                }}
                type="radio"
              />
              <span>
                <strong>效果呈现</strong>
                只允许本店已索引的真实效果素材，系统不存在 AI 生成路径
              </span>
            </label>
          </fieldset>
          <label className="xhs-ai-toggle">
            <input
              checked={allowAiImage}
              disabled={imageUsage === "effect"}
              onChange={(event) => setAllowAiImage(event.target.checked)}
              type="checkbox"
            />
            无实拍氛围图时，允许使用已配置的外部 AI 生图辅路线
          </label>
          <button disabled={busy} onClick={generate} type="button">
            {busy ? statusLabel[status] : "生成完整小红书图文包"}
          </button>
        </div>
        <p className={`task-status ${status}`} role="status">
          {statusLabel[status]}
        </p>
        {error ? <p className="result-banner error">{error}</p> : null}
      </section>

      {result ? (
        <section className="xhs-results">
          <div className="publish-summary">
            <strong>{result.publishReady ? "可人工发布" : "发布已阻断"}</strong>
            <span>封面 {result.cover.width}×{result.cover.height}</span>
            <span>{result.imageSources.length} 个配图来源</span>
          </div>
          <ComplianceSummary result={result} />
          <div className="xhs-package-grid">
            <article className="moments-card">
              <span className="content-type">标题</span>
              <h2>{result.title}</h2>
              <span className="content-type">正文</span>
              <p className="xhs-body">{result.body}</p>
            </article>
            <article className="moments-card xhs-cover-card">
              <span className="content-type">封面文案</span>
              <div className="xhs-cover-copy">
                <strong>{result.cover.headline}</strong>
                <span>{result.cover.body}</span>
              </div>
              {result.cover.downloadUrl && result.publishReady ? (
                <a
                  className="primary-link-button"
                  href={result.cover.downloadUrl}
                >
                  下载 3:4 PNG 封面
                </a>
              ) : (
                <button disabled type="button">封面下载不可用</button>
              )}
            </article>
          </div>
          <section className="xhs-sources">
            <h2>配图来源</h2>
            <div>
              {result.imageSources.map((source, index) => (
                <article
                  className="context-card"
                  key={`${source.kind}-${source.assetId ?? index}`}
                >
                  <span>
                    {source.kind === "merchant_asset"
                      ? "本店实拍"
                      : "AI 氛围辅图"}
                  </span>
                  <strong>{source.originalName ?? "新生成氛围图"}</strong>
                  <p>{source.reason}</p>
                  {source.assetId ? (
                    <a
                      href={`/api/knowledge-base/assets/${source.assetId}/file`}
                    >
                      查看原素材
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}
    </>
  );
}
