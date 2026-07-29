import type {
  AssetInput,
  AudienceInput,
  BrandProfileInput,
  CampaignInput,
  MemberSegmentInput,
  OfferingInput,
} from "./knowledge-base-types";
import type { TenantId } from "./types";

export type KnowledgeDraftEntityType =
  | "asset"
  | "audience"
  | "brandProfile"
  | "campaign"
  | "memberSegment"
  | "offering";

export type KnowledgeDraftStatus = "confirmed" | "pending" | "rejected";
export type KnowledgeImportStatus = "completed" | "queued" | "review";

export interface KnowledgeImport {
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly id: string;
  readonly merchantId: TenantId;
  readonly sourceHash: string;
  readonly sourceKind: "paste" | "upload";
  readonly sourceMediaType: string;
  readonly sourceName: string;
  readonly sourceSize: number;
  readonly status: KnowledgeImportStatus;
  readonly taskId: string;
  readonly updatedAt: Date;
}

export interface KnowledgeEntityDraft {
  readonly confirmedEntityId: string | null;
  readonly createdAt: Date;
  readonly entityType: KnowledgeDraftEntityType;
  readonly id: string;
  readonly importId: string;
  readonly merchantId: TenantId;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly position: number;
  readonly resolvedAt: Date | null;
  readonly status: KnowledgeDraftStatus;
  readonly updatedAt: Date;
}

export interface CreateKnowledgeImportInput {
  readonly sourceHash: string;
  readonly sourceKind: "paste" | "upload";
  readonly sourceMediaType: string;
  readonly sourceName: string;
  readonly sourceSize: number;
  readonly sourceText: string;
}

export interface StoreKnowledgeDraftInput {
  readonly entityType: KnowledgeDraftEntityType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type ConfirmKnowledgeDraftInput =
  | {
      readonly draftPayload: {
        readonly isEffectImage: boolean;
        readonly notes: string;
        readonly originalName: string;
        readonly scene: string;
      };
      readonly entityType: "asset";
      readonly input: AssetInput;
    }
  | { readonly entityType: "audience"; readonly input: AudienceInput }
  | { readonly entityType: "brandProfile"; readonly input: BrandProfileInput }
  | { readonly entityType: "campaign"; readonly input: CampaignInput }
  | {
      readonly entityType: "memberSegment";
      readonly input: MemberSegmentInput;
    }
  | { readonly entityType: "offering"; readonly input: OfferingInput };
