import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import {
  builtinTemplateRegistry,
  createTemplateRegistry,
  parseCompositionDocument,
  type CompositionTemplate,
} from "./index";
import { renderCompositionHtml } from "./document";

const documentInput = {
  asset: {
    alt: "门店实拍",
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  },
  brand: {
    accentColor: "#F4C7AB",
    fontStyle: "modern" as const,
    merchantName: "春风里皮肤管理",
    primaryColor: "#7C3F58",
  },
  copy: {
    body: "到店后的松弛感，藏在每一次认真护理里。",
    headline: "今天，也要好好照顾自己",
  },
  templateId: "xiaohongshu-cover-3x4",
  usage: "general" as const,
};

describe("template registry public interface", () => {
  it("resolves the first two platform templates and their exact output sizes", () => {
    expect(builtinTemplateRegistry.list()).toEqual([
      expect.objectContaining({
        height: 1440,
        id: "xiaohongshu-cover-3x4",
        width: 1080,
      }),
      expect.objectContaining({
        height: 1080,
        id: "moments-copy-card",
        width: 1080,
      }),
    ]);
  });

  it("adds a template by registration without changing the renderer", () => {
    function CustomTemplate(): ReactElement {
      return <article data-composition-canvas>自定义模板</article>;
    }
    const custom: CompositionTemplate = {
      component: CustomTemplate,
      description: "测试扩展模板",
      height: 400,
      id: "custom-square",
      label: "自定义方图",
      width: 400,
    };
    const registry = createTemplateRegistry([]);

    registry.register(custom);

    expect(registry.resolve("custom-square")).toBe(custom);
    expect(() => registry.register(custom)).toThrow(
      'Template "custom-square" is already registered',
    );
  });
});

describe("shared composition document", () => {
  it("validates constrained brand values and renders Chinese copy exactly once", () => {
    const input = parseCompositionDocument(documentInput);
    const html = renderCompositionHtml(
      builtinTemplateRegistry.resolve(input.templateId),
      input,
    );

    expect(html).toContain("今天，也要好好照顾自己");
    expect(html).toContain("到店后的松弛感，藏在每一次认真护理里。");
    expect(html).toContain("春风里皮肤管理");
    expect(html.match(/今天，也要好好照顾自己/g)).toHaveLength(1);
  });

  it("escapes copy as text and rejects CSS or remote-asset injection", () => {
    const escaped = parseCompositionDocument({
      ...documentInput,
      copy: {
        ...documentInput.copy,
        headline: '<img src=x onerror="alert(1)">原样中文',
      },
    });
    const html = renderCompositionHtml(
      builtinTemplateRegistry.resolve(escaped.templateId),
      escaped,
    );

    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;原样中文",
    );
    expect(html).not.toContain("<img src=x");
    expect(() =>
      parseCompositionDocument({
        ...documentInput,
        brand: { ...documentInput.brand, primaryColor: "url(javascript:x)" },
      }),
    ).toThrow();
    expect(() =>
      parseCompositionDocument({
        ...documentInput,
        asset: { ...documentInput.asset, dataUrl: "https://evil.example/a.png" },
      }),
    ).toThrow();
  });
});
