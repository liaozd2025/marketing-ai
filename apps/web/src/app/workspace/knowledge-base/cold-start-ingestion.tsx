"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ImportSummary {
  readonly id: string;
  readonly source_kind: "paste" | "upload";
  readonly source_name: string;
  readonly source_size: number;
  readonly status: "completed" | "queued" | "review";
  readonly task_id: string;
}

interface DraftView {
  readonly confirmed_entity_id: string | null;
  readonly entity_type:
    | "asset"
    | "audience"
    | "brandProfile"
    | "campaign"
    | "memberSegment"
    | "offering";
  readonly id: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: "confirmed" | "pending" | "rejected";
}

interface ImportView extends ImportSummary {
  readonly drafts: readonly DraftView[];
  readonly task: {
    readonly error_code: string | null;
    readonly error_message: string | null;
    readonly result: {
      readonly counts?: Readonly<Record<string, number>>;
    } | null;
    readonly status: "failed" | "queued" | "running" | "succeeded";
  } | null;
}

const entityLabels: Readonly<Record<DraftView["entity_type"], string>> = {
  asset: "素材",
  audience: "客群",
  brandProfile: "品牌档案",
  campaign: "活动",
  memberSegment: "会员分层",
  offering: "Offering",
};
const entityOrder: readonly DraftView["entity_type"][] = [
  "brandProfile",
  "offering",
  "audience",
  "campaign",
  "memberSegment",
  "asset",
];

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? `请求失败（${response.status}）`;
}

async function fetchImportSummaries(): Promise<readonly ImportSummary[]> {
  const response = await fetch("/api/knowledge-base/imports");
  if (!response.ok) {
    throw new Error(await responseMessage(response));
  }
  const body = (await response.json()) as {
    imports: readonly ImportSummary[];
  };
  return body.imports;
}

async function fetchImportView(id: string): Promise<ImportView> {
  const response = await fetch(`/api/knowledge-base/imports/${id}`);
  if (!response.ok) {
    throw new Error(await responseMessage(response));
  }
  return (await response.json()) as ImportView;
}

function DraftEditor({
  draft,
  importId,
  onResolved,
}: {
  readonly draft: DraftView;
  readonly importId: string;
  readonly onResolved: () => Promise<void>;
}) {
  const [payload, setPayload] = useState(
    JSON.stringify(draft.payload, null, 2),
  );
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = async (action: "confirm" | "reject") => {
    setError("");
    setSaving(true);
    try {
      let parsed: unknown;
      if (action === "confirm") {
        try {
          parsed = JSON.parse(payload);
        } catch {
          throw new Error("修正内容必须是有效 JSON");
        }
      }
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (action === "confirm" && draft.entity_type === "asset") {
        if (!assetFile) {
          throw new Error("确认素材草稿前，请选择对应的真实图片或视频");
        }
        const form = new FormData();
        form.set("action", action);
        form.set("payload", JSON.stringify(parsed));
        form.set("file", assetFile);
        body = form;
      } else {
        body = JSON.stringify({
          action,
          ...(action === "confirm" ? { payload: parsed } : {}),
        });
        headers = { "content-type": "application/json" };
      }
      const response = await fetch(
        `/api/knowledge-base/imports/${importId}/drafts/${draft.id}`,
        {
          body,
          headers,
          method: "PATCH",
        },
      );
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      await onResolved();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "处理草稿时发生错误",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`draft-card ${draft.status}`}>
      <div className="draft-card-header">
        <strong>{entityLabels[draft.entity_type]}</strong>
        <span>
          {{
            confirmed: "已确认入库",
            pending: "待确认",
            rejected: "不采纳",
          }[draft.status]}
        </span>
      </div>
      <textarea
        aria-label={`${entityLabels[draft.entity_type]}草稿 JSON`}
        disabled={draft.status !== "pending" || saving}
        onChange={(event) => setPayload(event.target.value)}
        rows={10}
        value={payload}
      />
      {draft.entity_type === "asset" && draft.status === "pending" ? (
        <>
          <label className="kb-field">
            <span>对应的真实素材文件</span>
            <input
              accept="image/*,video/*"
              disabled={saving}
              onChange={(event) =>
                setAssetFile(event.target.files?.[0] ?? null)
              }
              type="file"
            />
          </label>
          <p className="draft-note">
            元数据不能代替真实素材；确认时必须上传对应图片或视频，文件会沿用现有素材入库和向量化链路。
          </p>
        </>
      ) : null}
      {error ? <p className="draft-error">{error}</p> : null}
      {draft.status === "pending" ? (
        <div className="draft-actions">
          <button
            disabled={saving}
            onClick={() => void update("confirm")}
            type="button"
          >
            {saving ? "处理中…" : "确认并写入知识库"}
          </button>
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => void update("reject")}
            type="button"
          >
            不采纳
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ColdStartIngestion() {
  const router = useRouter();
  const [imports, setImports] = useState<readonly ImportSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<ImportView | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadImports = useCallback(async () => {
    const items = await fetchImportSummaries();
    setImports(items);
    setActiveId((current) => current ?? items[0]?.id ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchImportSummaries()
      .then((items) => {
        if (cancelled) return;
        setImports(items);
        setActiveId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : "读取批次失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = () => {
      void fetchImportView(activeId)
        .then((body) => {
          if (cancelled) return;
          setActive(body);
          if (
            body.task?.status === "queued" ||
            body.task?.status === "running"
          ) {
            timer = window.setTimeout(poll, 800);
          }
        })
        .catch((failure: unknown) => {
          if (!cancelled) {
            setError(
              failure instanceof Error ? failure.message : "读取抽取任务失败",
            );
          }
        });
    };
    poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeId]);

  const submit = async (formData: FormData) => {
    setError("");
    setSubmitting(true);
    try {
      const file = formData.get("file");
      const text = String(formData.get("text") ?? "").trim();
      let response: Response;
      if (file instanceof File && file.size > 0) {
        const upload = new FormData();
        upload.set("file", file);
        response = await fetch("/api/knowledge-base/imports", {
          body: upload,
          method: "POST",
        });
      } else {
        response = await fetch("/api/knowledge-base/imports", {
          body: JSON.stringify({
            source_name: String(formData.get("sourceName") ?? "").trim() ||
              undefined,
            text,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
      }
      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }
      const created = (await response.json()) as { import_id: string };
      setActive(null);
      setActiveId(created.import_id);
      await loadImports();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "提交资料时发生错误",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const refreshAfterResolution = async () => {
    if (activeId) {
      setActive(await fetchImportView(activeId));
    }
    await loadImports();
    router.refresh();
  };
  const counts = active?.task?.result?.counts ?? {};

  return (
    <details className="cold-start" open={Boolean(activeId)}>
      <summary>
        <span>
          <strong>从已有资料开始</strong>
          <small>粘贴或上传文本资料，由 AI 抽取为六类待确认草稿</small>
        </span>
        <span>AI 冷启动</span>
      </summary>
      <div className="cold-start-workspace">
        <form action={submit} className="cold-start-form">
          <div className="draft-guardrail">
            <strong>未确认不入库</strong>
            <span>
              AI 结果只进入草稿区；你必须逐条核对、修正并确认，或明确选择不采纳。
            </span>
          </div>
          <label className="kb-field">
            <span>资料名称（可选）</span>
            <input
              maxLength={200}
              name="sourceName"
              placeholder="例如：点评店铺介绍"
            />
          </label>
          <label className="kb-field">
            <span>粘贴商家资料</span>
            <textarea
              name="text"
              placeholder="粘贴店铺介绍、价目表、公众号文章等；不要上传会员个人明细。"
              rows={7}
            />
          </label>
          <div className="cold-start-divider">或上传一个文本文件</div>
          <label className="kb-field">
            <span>资料文件</span>
            <small>支持 TXT / Markdown / CSV / JSON / HTML，最大 100 KB</small>
            <input
              accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/plain,text/markdown,text/csv,application/json,text/html"
              name="file"
              type="file"
            />
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "正在提交…" : "AI 抽取为草稿"}
          </button>
          {error ? <p className="draft-error">{error}</p> : null}
        </form>

        <section className="cold-start-review">
          {imports.length ? (
            <div className="import-history" aria-label="冷启动批次">
              {imports.map((item) => (
                <button
                  className={activeId === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    setActive(null);
                    setActiveId(item.id);
                  }}
                  type="button"
                >
                  <span>{item.source_name}</span>
                  <small>
                    {{
                      completed: "已完成",
                      queued: "处理中",
                      review: "待逐项确认",
                    }[item.status]}
                  </small>
                </button>
              ))}
            </div>
          ) : null}
          {!activeId ? (
            <p className="empty-state">
              提交第一份种子资料后，六类抽取结果会在这里等待逐项确认。
            </p>
          ) : !active ? (
            <p className="empty-state">正在读取抽取任务…</p>
          ) : active.task?.status === "failed" ? (
            <p className="draft-error">
              抽取失败：{active.task.error_message ?? active.task.error_code}
            </p>
          ) : active.task?.status !== "succeeded" ? (
            <p className="empty-state">
              AI 抽取任务{active.task?.status === "running" ? "正在执行" : "已排队"}
              ，页面会自动刷新。
            </p>
          ) : (
            <>
              <div className="extraction-counts">
                {entityOrder.map((type) => (
                  <span key={type}>
                    {entityLabels[type]} {counts[type] ?? 0}
                  </span>
                ))}
              </div>
              <div className="draft-list">
                {active.drafts.length ? (
                  active.drafts.map((draft) => (
                    <DraftEditor
                      draft={draft}
                      importId={active.id}
                      key={draft.id}
                      onResolved={refreshAfterResolution}
                    />
                  ))
                ) : (
                  <p className="empty-state">
                    资料中没有足够依据形成实体草稿，知识库未发生变化。
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </details>
  );
}
