import { renderToStaticMarkup } from "react-dom/server.browser";

import { CompositionCanvas } from "./canvas";
import type {
  CompositionDocument,
  CompositionTemplate,
} from "./types";

export function renderCompositionHtml(
  template: CompositionTemplate,
  input: CompositionDocument,
): string {
  const markup = renderToStaticMarkup(
    <CompositionCanvas input={input} template={template} />,
  );
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
    <meta name="color-scheme" content="only light">
    <style>html,body{margin:0;padding:0;width:${template.width}px;height:${template.height}px;overflow:hidden;background:#fff}</style>
  </head>
  <body>${markup}</body>
</html>`;
}
