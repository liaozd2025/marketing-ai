import type {
  ComplianceHit,
  ComplianceRule,
} from "@marketing-ai/compliance";

export const SKILL_PROTOCOL = "marketing-ai.skill-output.v1";
export const SKILL_RESULT_PROTOCOL = "marketing-ai.skill-result.v1";

export interface SkillContentType {
  readonly assetGuidance: string;
  readonly goal: string;
  readonly id: string;
  readonly label: string;
}

export interface ConfiguredSkillPreset {
  readonly contentTypes: readonly SkillContentType[];
  readonly ctaLabel?: string;
  readonly defaultKnowledgeTypes: readonly string[];
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly memberTouch?: MemberTouchConfiguration;
  readonly systemInstruction: string;
}

export interface MemberTouchPlaceholderDefinition {
  readonly description: string;
  readonly key: string;
  readonly label: string;
}

export interface MemberTouchConfiguration {
  readonly maximumAlternatives: number;
  readonly minimumAlternatives: number;
  readonly placeholders: readonly MemberTouchPlaceholderDefinition[];
}

export interface SkillKnowledgeSnapshot {
  readonly assets: readonly {
    readonly id: string;
    readonly isEffectImage: boolean;
    readonly mimeType: string;
    readonly notes: string;
    readonly offeringId: string | null;
    readonly originalName: string;
    readonly scene: string;
  }[];
  readonly audiences: readonly {
    readonly addressStyle: string;
    readonly motivations: string;
    readonly name: string;
    readonly painPoints: string;
  }[];
  readonly brandProfile: {
    readonly accentColor: string;
    readonly fontStyle: "editorial" | "modern" | "warm";
    readonly persona: string;
    readonly primaryColor: string;
    readonly story: string;
    readonly tabooExpressions: readonly string[];
    readonly tone: string;
  } | null;
  readonly campaigns: readonly {
    readonly endsAt: string | null;
    readonly name: string;
    readonly offerDetails: string;
    readonly rules: string;
    readonly startsAt: string | null;
  }[];
  readonly memberSegments: readonly {
    readonly communicationGoal: string;
    readonly definition: string;
    readonly name: string;
    readonly triggerScenarios: string;
  }[];
  readonly merchantName: string;
  readonly offerings: readonly {
    readonly description: string;
    readonly fieldValues: Readonly<Record<string, unknown>>;
    readonly id: string;
    readonly name: string;
  }[];
}

export type SkillTaskInput =
  | {
      readonly allowAiImage?: boolean;
      readonly action: "generate";
      readonly imageUsage?: "atmosphere" | "effect";
      readonly intent: string;
      readonly kind: "skill";
      readonly selectedKnowledgeTypes: readonly string[];
      readonly skillId: string;
    }
  | {
      readonly action: "refine" | "compliance_rewrite";
      readonly contentType: string;
      readonly instruction: string;
      readonly kind: "skill";
      readonly sourceText: string;
      readonly skillId: string;
    };

export interface SkillPromptMessage {
  readonly content: string;
  readonly role: "system" | "user";
}

export interface RawSkillItem {
  readonly assetQuery: {
    readonly effectImage: boolean;
    readonly offeringNames: readonly string[];
    readonly reason: string;
    readonly sceneTags: readonly string[];
  };
  readonly contentType: string;
  readonly text: string;
}

export interface RawSkillOutput {
  readonly items: readonly RawSkillItem[];
  readonly protocolVersion: typeof SKILL_PROTOCOL;
}

export interface SkillAssetSuggestion {
  readonly assetId: string;
  readonly isEffectImage: boolean;
  readonly label: "实拍" | "效果类实拍";
  readonly originalName: string;
  readonly reason: string;
  readonly scene: string;
}

export interface SkillContentResult {
  readonly assetAdvice: string;
  readonly assetSuggestions: readonly SkillAssetSuggestion[];
  readonly compliance: {
    readonly blocked: boolean;
    readonly hits: readonly ComplianceHit[];
  };
  readonly contentType: string;
  readonly label: string;
  readonly publishReady: boolean;
  readonly text: string;
}

export interface SkillRunResult {
  readonly action: SkillTaskInput["action"];
  readonly context: {
    readonly assets: number;
    readonly audiences: number;
    readonly brandProfile: number;
    readonly campaigns: number;
    readonly memberSegments: number;
    readonly offerings: number;
  };
  readonly items: readonly SkillContentResult[];
  readonly protocolVersion: typeof SKILL_RESULT_PROTOCOL;
  readonly skillId: string;
}

export interface FinalizeSkillInput {
  readonly complianceLexicon: readonly ComplianceRule[];
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly preset: ConfiguredSkillPreset;
  readonly raw: RawSkillOutput;
  readonly task: SkillTaskInput;
}

export interface RawMemberTouchCell {
  readonly alternatives: readonly string[];
  readonly scenario: string;
  readonly segmentKey: string;
}

export interface RawMemberTouchOutput {
  readonly cells: readonly RawMemberTouchCell[];
  readonly protocolVersion: "marketing-ai.member-touch-output.v1";
}

export interface MemberTouchAlternativeResult {
  readonly compliance: {
    readonly blocked: boolean;
    readonly hits: readonly ComplianceHit[];
  };
  readonly copyReady: boolean;
  readonly placeholders: readonly string[];
  readonly text: string;
}

export interface MemberTouchCellResult {
  readonly alternatives: readonly MemberTouchAlternativeResult[];
  readonly scenario: string;
  readonly segment: {
    readonly communicationGoal: string;
    readonly definition: string;
    readonly key: string;
    readonly name: string;
    readonly triggerScenarios: string;
  };
}

export interface MemberTouchRunResult {
  readonly action: "generate";
  readonly cells: readonly MemberTouchCellResult[];
  readonly context: {
    readonly brandProfile: number;
    readonly campaigns: number;
    readonly memberSegments: number;
    readonly offerings: number;
  };
  readonly placeholderDefinitions: readonly MemberTouchPlaceholderDefinition[];
  readonly protocolVersion: "marketing-ai.member-touch-result.v1";
  readonly scenarios: readonly string[];
  readonly skillId: string;
}

export interface FinalizeMemberTouchInput {
  readonly complianceLexicon: readonly ComplianceRule[];
  readonly configuration: MemberTouchConfiguration;
  readonly knowledge: SkillKnowledgeSnapshot;
  readonly raw: RawMemberTouchOutput;
  readonly scenarios: readonly string[];
  readonly task: SkillTaskInput;
}
