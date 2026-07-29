import { createElement, type ReactElement } from "react";

import { builtinTemplateRegistry } from "./registry";
import type {
  CompositionDocument,
  CompositionTemplate,
} from "./types";

export function CompositionCanvas({
  input,
  template = builtinTemplateRegistry.resolve(input.templateId),
}: {
  readonly input: CompositionDocument;
  readonly template?: CompositionTemplate;
}): ReactElement {
  return createElement(template.component, { input });
}
