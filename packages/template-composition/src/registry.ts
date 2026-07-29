import {
  MomentsCopyCardTemplate,
  XiaohongshuCoverTemplate,
} from "./templates";
import type {
  CompositionTemplate,
  CompositionTemplateDescriptor,
} from "./types";

export interface TemplateRegistry {
  list(): readonly CompositionTemplateDescriptor[];
  register(template: CompositionTemplate): void;
  resolve(id: string): CompositionTemplate;
}

const builtinTemplates: readonly CompositionTemplate[] = [
  {
    component: XiaohongshuCoverTemplate,
    description: "小红书 3:4 实拍封面，适合标题型图文首图。",
    height: 1440,
    id: "xiaohongshu-cover-3x4",
    label: "小红书 3:4 封面",
    width: 1080,
  },
  {
    component: MomentsCopyCardTemplate,
    description: "朋友圈方形话术卡片，实拍图与完整话术并排呈现。",
    height: 1080,
    id: "moments-copy-card",
    label: "朋友圈话术卡片",
    width: 1080,
  },
];

export function createTemplateRegistry(
  templates: readonly CompositionTemplate[] = builtinTemplates,
): TemplateRegistry {
  const registered = new Map<string, CompositionTemplate>();

  function register(template: CompositionTemplate): void {
    if (registered.has(template.id)) {
      throw new Error(`Template "${template.id}" is already registered`);
    }
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(template.id) ||
      !Number.isInteger(template.width) ||
      !Number.isInteger(template.height) ||
      template.width < 1 ||
      template.height < 1
    ) {
      throw new Error(`Template "${template.id}" has invalid metadata`);
    }
    registered.set(template.id, template);
  }

  for (const template of templates) {
    register(template);
  }

  return {
    list: () =>
      [...registered.values()].map((template) => ({
        description: template.description,
        height: template.height,
        id: template.id,
        label: template.label,
        width: template.width,
      })),
    register,
    resolve: (id) => {
      const template = registered.get(id);
      if (!template) {
        throw new Error(`Unknown composition template "${id}"`);
      }
      return template;
    },
  };
}

export const builtinTemplateRegistry = createTemplateRegistry();
