import React, { type CSSProperties, type ReactElement } from "react";

import { compositionStyles } from "./styles";
import type {
  CompositionDocument,
  CompositionTemplateProps,
} from "./types";

function canvasStyle(
  input: CompositionDocument,
  width: number,
  height: number,
): CSSProperties {
  return {
    "--brand-accent": input.brand.accentColor,
    "--brand-primary": input.brand.primaryColor,
    height,
    width,
  } as CSSProperties;
}

function TemplateStyle(): ReactElement {
  return <style dangerouslySetInnerHTML={{ __html: compositionStyles }} />;
}

export function XiaohongshuCoverTemplate({
  input,
}: CompositionTemplateProps): ReactElement {
  return (
    <>
      <TemplateStyle />
      <article
        className="composition-canvas composition-xhs"
        data-composition-canvas
        data-font-style={input.brand.fontStyle}
        style={canvasStyle(input, 1080, 1440)}
      >
        <div className="composition-xhs__photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={input.asset.alt}
            data-composition-asset
            src={input.asset.dataUrl}
          />
        </div>
        <div className="composition-xhs__veil" />
        <div
          className="composition-xhs__brand"
          data-copy-field="merchantName"
        >
          {input.brand.merchantName}
        </div>
        <section className="composition-xhs__copy">
          <p className="composition-xhs__eyebrow">到店日常 · 实拍记录</p>
          <h1
            className="composition-xhs__headline"
            data-copy-field="headline"
          >
            {input.copy.headline}
          </h1>
          <p className="composition-xhs__body" data-copy-field="body">
            {input.copy.body}
          </p>
        </section>
      </article>
    </>
  );
}

export function MomentsCopyCardTemplate({
  input,
}: CompositionTemplateProps): ReactElement {
  return (
    <>
      <TemplateStyle />
      <article
        className="composition-canvas composition-moments"
        data-composition-canvas
        data-font-style={input.brand.fontStyle}
        style={canvasStyle(input, 1080, 1080)}
      >
        <div className="composition-moments__frame">
          <div className="composition-moments__photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={input.asset.alt}
              data-composition-asset
              src={input.asset.dataUrl}
            />
          </div>
          <section className="composition-moments__copy">
            <p
              className="composition-moments__brand"
              data-copy-field="merchantName"
            >
              {input.brand.merchantName}
            </p>
            <h1
              className="composition-moments__headline"
              data-copy-field="headline"
            >
              {input.copy.headline}
            </h1>
            <div className="composition-moments__rule" />
            <p className="composition-moments__body" data-copy-field="body">
              {input.copy.body}
            </p>
            <p className="composition-moments__signature">真实分享 · 真诚表达</p>
          </section>
        </div>
      </article>
    </>
  );
}
