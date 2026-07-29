export type OfferingFieldType =
  | "number"
  | "select"
  | "text"
  | "textarea";

export interface OfferingFieldOption {
  readonly label: string;
  readonly value: string;
}

export interface OfferingFieldDefinition {
  readonly help?: string;
  readonly key: string;
  readonly label: string;
  readonly max?: number;
  readonly min?: number;
  readonly options?: readonly OfferingFieldOption[];
  readonly placeholder?: string;
  readonly required: boolean;
  readonly type: OfferingFieldType;
}

export interface ScenarioVocabulary {
  readonly key: string;
  readonly label: string;
  readonly terms: readonly string[];
}

export interface ComplianceLexiconEntry {
  readonly category: string;
  readonly replacement: string;
  readonly severity: "block" | "warn";
  readonly term: string;
}

export interface MemberTouchConfiguration {
  readonly maximumAlternatives: number;
  readonly minimumAlternatives: number;
  readonly placeholders: readonly {
    readonly description: string;
    readonly key: string;
    readonly label: string;
  }[];
}

export interface SkillPreset {
  readonly contentTypes: readonly {
    readonly assetGuidance: string;
    readonly goal: string;
    readonly id: string;
    readonly label: string;
  }[];
  readonly ctaLabel?: string;
  readonly defaultKnowledgeTypes: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly memberTouch?: MemberTouchConfiguration;
  readonly systemInstruction: string;
}

export interface VerticalPack {
  readonly complianceLexicon: readonly ComplianceLexiconEntry[];
  readonly id: string;
  readonly label: string;
  readonly offeringFields: readonly OfferingFieldDefinition[];
  readonly scenarioVocabulary: readonly ScenarioVocabulary[];
  readonly skillPresets: readonly SkillPreset[];
  readonly version: number;
  readonly vertical: string;
}
