import type { ComponentType } from "react";

export type BrandFontStyle = "editorial" | "modern" | "warm";
export type CompositionUsage = "effect" | "general";

export interface CompositionDocument {
  readonly asset: {
    readonly alt: string;
    readonly dataUrl: string;
  };
  readonly brand: {
    readonly accentColor: string;
    readonly fontStyle: BrandFontStyle;
    readonly merchantName: string;
    readonly primaryColor: string;
  };
  readonly copy: {
    readonly body: string;
    readonly headline: string;
  };
  readonly templateId: string;
  readonly usage: CompositionUsage;
}

export interface CompositionTemplateProps {
  readonly input: CompositionDocument;
}

export interface CompositionTemplate {
  readonly component: ComponentType<CompositionTemplateProps>;
  readonly description: string;
  readonly height: number;
  readonly id: string;
  readonly label: string;
  readonly width: number;
}

export type CompositionTemplateDescriptor = Omit<
  CompositionTemplate,
  "component"
>;
