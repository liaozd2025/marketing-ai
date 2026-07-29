import type {
  Asset,
  Audience,
  BrandProfile,
  Campaign,
  MemberSegment,
  Offering,
} from "@marketing-ai/database";
import {
  offeringCompleteness,
  type VerticalPack,
} from "@marketing-ai/vertical-packs";

export type KnowledgeEntityType =
  | "asset"
  | "audience"
  | "brandProfile"
  | "campaign"
  | "memberSegment"
  | "offering";

export interface KnowledgeSummaryItem {
  readonly count: number;
  readonly label: string;
  readonly percentage: number;
  readonly type: KnowledgeEntityType;
}

function filled(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function percentage(values: readonly unknown[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(
    (values.filter((value) => filled(value)).length / values.length) * 100,
  );
}

function collectionPercentage<T>(
  records: readonly T[],
  fields: (record: T) => readonly unknown[],
): number {
  if (records.length === 0) {
    return 0;
  }
  return Math.round(
    records.reduce((total, record) => total + percentage(fields(record)), 0) /
      records.length,
  );
}

export function buildKnowledgeBaseSummary(input: {
  readonly assets: readonly Asset[];
  readonly audiences: readonly Audience[];
  readonly brandProfile: BrandProfile | null;
  readonly campaigns: readonly Campaign[];
  readonly memberSegments: readonly MemberSegment[];
  readonly offerings: readonly Offering[];
  readonly pack: VerticalPack;
}): readonly KnowledgeSummaryItem[] {
  const {
    assets,
    audiences,
    brandProfile,
    campaigns,
    memberSegments,
    offerings,
    pack,
  } = input;

  return [
    {
      count: brandProfile ? 1 : 0,
      label: "品牌档案",
      percentage: brandProfile
        ? percentage([
            brandProfile.persona,
            brandProfile.tone,
            brandProfile.story,
          ])
        : 0,
      type: "brandProfile",
    },
    {
      count: offerings.length,
      label: "Offering",
      percentage:
        offerings.length === 0
          ? 0
          : Math.round(
              offerings.reduce(
                (total, offering) =>
                  total +
                  offeringCompleteness(pack, offering.fieldValues),
                0,
              ) / offerings.length,
            ),
      type: "offering",
    },
    {
      count: audiences.length,
      label: "客群",
      percentage: collectionPercentage(audiences, (audience) => [
        audience.name,
        audience.painPoints,
        audience.motivations,
        audience.addressStyle,
      ]),
      type: "audience",
    },
    {
      count: campaigns.length,
      label: "活动",
      percentage: collectionPercentage(campaigns, (campaign) => [
        campaign.name,
        campaign.offerDetails,
        campaign.rules,
      ]),
      type: "campaign",
    },
    {
      count: memberSegments.length,
      label: "会员分层",
      percentage: collectionPercentage(memberSegments, (segment) => [
        segment.name,
        segment.definition,
        segment.triggerScenarios,
        segment.communicationGoal,
      ]),
      type: "memberSegment",
    },
    {
      count: assets.length,
      label: "素材",
      percentage: collectionPercentage(assets, (asset) => [
        asset.originalName,
        asset.scene,
        asset.storageKey,
      ]),
      type: "asset",
    },
  ];
}
