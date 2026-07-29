import type { TenantId } from "./types";

export interface CompositionRecord {
  readonly assetId: string | null;
  readonly body: string;
  readonly byteSize: number;
  readonly createdAt: Date;
  readonly createdByMemberId: string;
  readonly headline: string;
  readonly height: number;
  readonly id: string;
  readonly merchantId: TenantId;
  readonly outputMimeType: "image/png";
  readonly sourceTaskId: string | null;
  readonly storageKey: string;
  readonly templateId: string;
  readonly usage: "effect" | "general";
  readonly width: number;
}

export interface CompositionRecordInput {
  readonly assetId: string | null;
  readonly body: string;
  readonly byteSize: number;
  readonly createdByMemberId: string;
  readonly headline: string;
  readonly height: number;
  readonly storageKey: string;
  readonly sourceTaskId?: string | null;
  readonly templateId: string;
  readonly usage: "effect" | "general";
  readonly width: number;
}
