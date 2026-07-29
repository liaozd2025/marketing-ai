"use client";

import {
  CompositionCanvas,
  type BrandFontStyle,
  type CompositionDocument,
  type CompositionTemplateDescriptor,
} from "@marketing-ai/template-composition";
import { useMemo, useState } from "react";

interface StudioAsset {
  readonly id: string;
  readonly isEffectImage: boolean;
  readonly name: string;
  readonly scene: string;
  readonly url: string;
}

interface CreatedComposition {
  readonly id: string;
  readonly imageUrl: string;
}

export function CompositionStudio({
  assets,
  brand,
  merchantName,
  templates,
}: {
  readonly assets: readonly StudioAsset[];
  readonly brand: {
    readonly accentColor: string;
    readonly fontStyle: BrandFontStyle;
    readonly primaryColor: string;
  };
  readonly merchantName: string;
  readonly templates: readonly CompositionTemplateDescriptor[];
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [headline, setHeadline] = useState("今天，也要好好照顾自己");
  const [body, setBody] = useState(
    "到店后的松弛感，藏在每一次认真护理里。",
  );
  const [usage, setUsage] = useState<"effect" | "general">("general");
  const [created, setCreated] = useState<CreatedComposition | null>(null);
  const [state, setState] = useState<
    "error" | "idle" | "rendering" | "success"
  >("idle");
  const template = templates.find((item) => item.id === templateId) ??
    templates[0];
  const asset = assets.find((item) => item.id === assetId) ?? assets[0];

  const previewInput = useMemo<CompositionDocument | null>(
    () =>
      template && asset
        ? {
            asset: {
              alt: `${asset.scene} · ${asset.name}`,
              // The browser preview URL is server-authenticated. The headless
              // renderer independently receives an embedded, validated data URL.
              dataUrl: asset.url,
            },
            brand: { ...brand, merchantName },
            copy: { body, headline },
            templateId: template.id,
            usage,
          }
        : null,
    [asset, body, brand, headline, merchantName, template, usage],
  );

  async function renderComposition() {
    if (!asset || !template) {
      return;
    }
    setCreated(null);
    setState("rendering");
    const response = await fetch("/api/compositions", {
      body: JSON.stringify({
        assetId: asset.id,
        body,
        headline,
        templateId: template.id,
        usage,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    const result = (await response.json()) as {
      composition: CreatedComposition;
    };
    setCreated(result.composition);
    setState("success");
  }

  if (!template || !asset || !previewInput) {
    return null;
  }

  const previewScale = 0.32;

  return (
    <div className="composition-studio">
      <section className="composition-controls">
        <div>
          <p className="eyebrow">模板参数</p>
          <h2>写文案，选实拍素材</h2>
          <p className="form-note">
            预览与出图使用同一个模板组件；最终 PNG 会由服务端 Chromium 重新渲染。
          </p>
        </div>

        <label className="studio-field">
          <span>模板</span>
          <select
            onChange={(event) => setTemplateId(event.target.value)}
            value={template.id}
          >
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.width}×{item.height}
              </option>
            ))}
          </select>
          <small>{template.description}</small>
        </label>

        <label className="studio-field">
          <span>实拍素材</span>
          <select
            onChange={(event) => setAssetId(event.target.value)}
            value={asset.id}
          >
            {assets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.scene} · {item.name}
                {item.isEffectImage ? " · 效果类" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="studio-field">
          <span>标题（最多 80 字）</span>
          <textarea
            maxLength={80}
            onChange={(event) => setHeadline(event.target.value)}
            required
            rows={3}
            value={headline}
          />
        </label>

        <label className="studio-field">
          <span>正文（最多 600 字）</span>
          <textarea
            maxLength={600}
            onChange={(event) => setBody(event.target.value)}
            required
            rows={5}
            value={body}
          />
        </label>

        <label className="checkbox-field">
          <input
            checked={usage === "effect"}
            onChange={(event) =>
              setUsage(event.target.checked ? "effect" : "general")
            }
            type="checkbox"
          />
          <span>
            这是效果类内容
            <small>开启后只能使用已标记为效果类的商家实拍图片。</small>
          </span>
        </label>

        {usage === "effect" && !asset.isEffectImage ? (
          <p className="studio-warning" role="alert">
            当前素材未标记为效果类，请更换素材或先在「我的资料」中更新标签。
          </p>
        ) : null}

        <button
          disabled={
            state === "rendering" ||
            !headline.trim() ||
            !body.trim() ||
            (usage === "effect" && !asset.isEffectImage)
          }
          onClick={renderComposition}
          type="button"
        >
          {state === "rendering" ? "Chromium 出图中…" : "生成并保存 PNG"}
        </button>
        {state === "error" ? (
          <p className="studio-error" role="alert">
            生成失败。请检查文字长度、素材类型与效果类标签后重试。
          </p>
        ) : null}
        {state === "success" && created ? (
          <a
            className="studio-download"
            download={`composition-${created.id}.png`}
            href={created.imageUrl}
          >
            下载刚生成的 PNG
          </a>
        ) : null}
      </section>

      <section className="composition-preview-panel">
        <div className="composition-preview-heading">
          <div>
            <p className="eyebrow">浏览器实时预览</p>
            <h2>{template.label}</h2>
          </div>
          <span>
            {template.width}×{template.height}
          </span>
        </div>
        <div
          className="composition-preview-viewport"
          style={{
            height: template.height * previewScale,
            width: template.width * previewScale,
          }}
        >
          <div
            style={{
              height: template.height,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
              width: template.width,
            }}
          >
            <CompositionCanvas input={previewInput} />
          </div>
        </div>
      </section>
    </div>
  );
}
