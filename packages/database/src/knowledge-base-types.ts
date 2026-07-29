import type { TenantId } from "./types";

interface TenantRecord {
  readonly createdAt: Date;
  readonly id: string;
  readonly merchantId: TenantId;
  readonly updatedAt: Date;
}

export interface BrandProfile extends TenantRecord {
  readonly accentColor: string;
  readonly fontStyle: "editorial" | "modern" | "warm";
  readonly persona: string;
  readonly primaryColor: string;
  readonly story: string;
  readonly tabooExpressions: readonly string[];
  readonly tone: string;
}

export interface Offering extends TenantRecord {
  readonly description: string;
  readonly fieldValues: Readonly<Record<string, unknown>>;
  readonly name: string;
}

export interface Audience extends TenantRecord {
  readonly addressStyle: string;
  readonly motivations: string;
  readonly name: string;
  readonly painPoints: string;
}

export interface Campaign extends TenantRecord {
  readonly endsAt: Date | null;
  readonly name: string;
  readonly offerDetails: string;
  readonly rules: string;
  readonly startsAt: Date | null;
}

export interface MemberSegment extends TenantRecord {
  readonly communicationGoal: string;
  readonly definition: string;
  readonly name: string;
  readonly triggerScenarios: string;
}

export interface Asset extends TenantRecord {
  readonly byteSize: number;
  readonly indexedAt: Date | null;
  readonly indexingError: string | null;
  readonly indexingStatus: AssetIndexingStatus;
  readonly indexingTaskId: string | null;
  readonly isEffectImage: boolean;
  readonly isReal: boolean;
  readonly mimeType: string;
  readonly notes: string;
  readonly offeringId: string | null;
  readonly originalName: string;
  readonly scene: string;
  readonly storageKey: string;
}

export type AssetIndexingStatus =
  | "not_indexed"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface AssetSearchFilters {
  readonly isEffectImage?: boolean | null;
  readonly limit: number;
  readonly offeringId: string | null;
  readonly rasterOnly?: boolean;
  readonly realOnly?: boolean;
  readonly scene: string | null;
}

export interface AssetSearchResult {
  readonly asset: Asset;
  readonly similarity: number;
}

export interface BrandProfileInput {
  readonly accentColor?: string;
  readonly fontStyle?: "editorial" | "modern" | "warm";
  readonly persona: string;
  readonly primaryColor?: string;
  readonly story: string;
  readonly tabooExpressions: readonly string[];
  readonly tone: string;
}

export interface OfferingInput {
  readonly description: string;
  readonly fieldValues: Readonly<Record<string, unknown>>;
  readonly name: string;
}

export interface AudienceInput {
  readonly addressStyle: string;
  readonly motivations: string;
  readonly name: string;
  readonly painPoints: string;
}

export interface CampaignInput {
  readonly endsAt: Date | null;
  readonly name: string;
  readonly offerDetails: string;
  readonly rules: string;
  readonly startsAt: Date | null;
}

export interface MemberSegmentInput {
  readonly communicationGoal: string;
  readonly definition: string;
  readonly name: string;
  readonly triggerScenarios: string;
}

export interface AssetInput {
  readonly byteSize: number;
  readonly isEffectImage: boolean;
  readonly mimeType: string;
  readonly notes: string;
  readonly offeringId: string | null;
  readonly originalName: string;
  readonly scene: string;
  readonly storageKey: string;
}
