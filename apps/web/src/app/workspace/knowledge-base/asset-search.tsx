"use client";

import { FormEvent, useState } from "react";

interface SearchResult {
  readonly asset: {
    readonly id: string;
    readonly is_effect_image: boolean;
    readonly notes: string;
    readonly offering_id: string | null;
    readonly original_name: string;
    readonly scene: string;
  };
  readonly similarity: number;
}

interface SearchTaskResponse {
  readonly error?: string | null;
  readonly results?: readonly SearchResult[];
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly task_id: string;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export function AssetSemanticSearch({
  offerings,
  scenes,
}: {
  readonly offerings: readonly { id: string; name: string }[];
  readonly scenes: readonly string[];
}) {
  const [status, setStatus] = useState<
    "idle" | SearchTaskResponse["status"]
  >("idle");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResults([]);
    setStatus("queued");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/knowledge-base/assets/search", {
      body: JSON.stringify({
        limit: 12,
        offering_id: form.get("offeringId") || null,
        query: form.get("query"),
        scene: form.get("scene") || null,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setError("搜索任务创建失败，请检查输入后重试。");
      setStatus("failed");
      return;
    }

    let task = (await response.json()) as SearchTaskResponse;
    for (let poll = 0; poll < 120 && task.status !== "succeeded"; poll += 1) {
      if (task.status === "failed") {
        setError(task.error || "向量检索失败，请稍后重试。");
        setStatus("failed");
        return;
      }
      setStatus(task.status);
      await wait(500);
      const polled = await fetch(
        `/api/knowledge-base/assets/search/${encodeURIComponent(task.task_id)}`,
        { cache: "no-store" },
      );
      if (!polled.ok && polled.status !== 202) {
        setError("搜索任务状态读取失败。");
        setStatus("failed");
        return;
      }
      task = (await polled.json()) as SearchTaskResponse;
    }
    if (task.status !== "succeeded") {
      setError("搜索仍在处理中，请稍后重试。");
      setStatus("failed");
      return;
    }
    setResults(task.results ?? []);
    setStatus("succeeded");
  }

  return (
    <section className="asset-search-panel">
      <div>
        <p className="eyebrow">多模态语义检索</p>
        <h3>用自然语言找实拍素材</h3>
        <p className="form-note">
          查询由异步 worker 向量化，可同时按场景和 Offering 筛选。
        </p>
      </div>
      <form className="asset-search-form" onSubmit={submit}>
        <input
          aria-label="素材搜索语句"
          name="query"
          placeholder="例如：适合秋季护肤氛围的图"
          required
        />
        <select aria-label="场景筛选" defaultValue="" name="scene">
          <option value="">全部场景</option>
          {scenes.map((scene) => (
            <option key={scene} value={scene}>
              {scene}
            </option>
          ))}
        </select>
        <select aria-label="Offering 筛选" defaultValue="" name="offeringId">
          <option value="">全部 Offering</option>
          {offerings.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {offering.name}
            </option>
          ))}
        </select>
        <button disabled={status === "queued" || status === "running"}>
          {status === "queued" || status === "running"
            ? "检索中…"
            : "语义检索"}
        </button>
      </form>
      {error ? <p className="search-feedback error">{error}</p> : null}
      {status === "succeeded" && results.length === 0 ? (
        <p className="search-feedback">没有符合当前条件的已索引素材。</p>
      ) : null}
      {results.length ? (
        <div className="asset-search-results">
          {results.map(({ asset, similarity }) => (
            <article key={asset.id}>
              <strong>{asset.original_name}</strong>
              <span>
                {asset.scene} · 相似度 {(similarity * 100).toFixed(1)}%
              </span>
              <a
                href={`/api/knowledge-base/assets/${asset.id}/file`}
                rel="noreferrer"
                target="_blank"
              >
                查看实拍
              </a>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
