import {
  buildMemberTouchPrompt,
  buildSkillPrompt,
  finalizeMemberTouchRun,
  finalizeSkillRun,
  parseMemberTouchOutput,
  parseSkillOutput,
  resolveMemberTouchScenarios,
  SkillProtocolError,
  type MemberTouchRunResult,
  type SkillKnowledgeSnapshot,
  type SkillRunResult,
  type SkillTaskInput,
} from "@marketing-ai/content-skills";
import {
  type ClaimedAgentTask,
  type Database,
  tenantId,
} from "@marketing-ai/database";
import {
  getSkillPreset,
  getVerticalPack,
} from "@marketing-ai/vertical-packs";
import type { AgentRequest } from "@marketing-ai/agent-service";

export interface PreparedSkillRun {
  readonly request: AgentRequest;
  finalize(providerText: string): MemberTouchRunResult | SkillRunResult;
}

export interface SkillRuntime {
  prepare(task: ClaimedAgentTask): Promise<PreparedSkillRun>;
}

function skillInput(task: ClaimedAgentTask): SkillTaskInput {
  if (!("kind" in task.input) || task.input.kind !== "skill") {
    throw new Error("Task input is not a Skill run");
  }
  return task.input;
}

export class ConfiguredSkillRuntime implements SkillRuntime {
  constructor(private readonly database: Database) {}

  async prepare(task: ClaimedAgentTask): Promise<PreparedSkillRun> {
    const input = skillInput(task);
    const tenant = this.database.forTenant(tenantId(task.merchantId));
    const merchant = await tenant.getMerchant();
    if (!merchant) {
      throw new Error("Skill merchant was not found");
    }
    const pack = getVerticalPack(merchant.verticalPackId);
    const preset = getSkillPreset(pack, input.skillId);
    if (preset.memberTouch) {
      const configuration = preset.memberTouch;
      if (input.action !== "generate") {
        throw new SkillProtocolError(
          "Member-touch only supports zero-PII generation requests",
        );
      }
      const [brandProfile, offerings, campaigns, segments] = await Promise.all([
        tenant.knowledgeBase.getBrandProfile(),
        tenant.knowledgeBase.listOfferings(),
        tenant.knowledgeBase.listCampaigns(),
        tenant.knowledgeBase.listMemberSegments(),
      ]);
      const knowledge = this.memberTouchKnowledge({
        brandProfile,
        campaigns,
        merchantName: merchant.name,
        offerings,
        segments,
      });
      const configuredScenarios =
        pack.scenarioVocabulary.find(({ key }) => key === preset.id)?.terms ??
        [];
      const scenarios = resolveMemberTouchScenarios(
        configuredScenarios,
        knowledge.memberSegments,
      );
      return {
        finalize: (providerText) =>
          finalizeMemberTouchRun({
            complianceLexicon: pack.complianceLexicon,
            configuration,
            knowledge,
            raw: parseMemberTouchOutput(providerText),
            scenarios,
            task: input,
          }),
        request: {
          capability: "text",
          request: {
            messages: buildMemberTouchPrompt({
              complianceLexicon: pack.complianceLexicon,
              configuration,
              knowledge,
              scenarios,
              systemInstruction: preset.systemInstruction,
              task: input,
            }),
          },
        },
      };
    }
    const [brandProfile, offerings, audiences, campaigns, segments, assets] =
      await Promise.all([
        tenant.knowledgeBase.getBrandProfile(),
        tenant.knowledgeBase.listOfferings(),
        tenant.knowledgeBase.listAudiences(),
        tenant.knowledgeBase.listCampaigns(),
        tenant.knowledgeBase.listMemberSegments(),
        tenant.knowledgeBase.listAssets(),
      ]);
    const knowledge: SkillKnowledgeSnapshot = {
      assets: assets.map((asset) => ({
        id: asset.id,
        isEffectImage: asset.isEffectImage,
        mimeType: asset.mimeType,
        notes: asset.notes,
        offeringId: asset.offeringId,
        originalName: asset.originalName,
        scene: asset.scene,
      })),
      audiences: audiences.map((audience) => ({
        addressStyle: audience.addressStyle,
        motivations: audience.motivations,
        name: audience.name,
        painPoints: audience.painPoints,
      })),
      brandProfile: brandProfile
        ? {
            persona: brandProfile.persona,
            story: brandProfile.story,
            tabooExpressions: brandProfile.tabooExpressions,
            tone: brandProfile.tone,
          }
        : null,
      campaigns: campaigns.map((campaign) => ({
        endsAt: campaign.endsAt?.toISOString() ?? null,
        name: campaign.name,
        offerDetails: campaign.offerDetails,
        rules: campaign.rules,
        startsAt: campaign.startsAt?.toISOString() ?? null,
      })),
      memberSegments: segments.map((segment) => ({
        communicationGoal: segment.communicationGoal,
        definition: segment.definition,
        name: segment.name,
        triggerScenarios: segment.triggerScenarios,
      })),
      merchantName: merchant.name,
      offerings: offerings.map((offering) => ({
        description: offering.description,
        fieldValues: offering.fieldValues,
        id: offering.id,
        name: offering.name,
      })),
    };
    return {
      finalize: (providerText) =>
        finalizeSkillRun({
          complianceLexicon: pack.complianceLexicon,
          knowledge,
          preset,
          raw: parseSkillOutput(providerText),
          task: input,
        }),
      request: {
        capability: "text",
        request: {
          messages: buildSkillPrompt({
            complianceLexicon: pack.complianceLexicon,
            knowledge,
            preset,
            task: input,
          }),
        },
      },
    };
  }

  private memberTouchKnowledge(input: {
    readonly brandProfile: {
      readonly persona: string;
      readonly story: string;
      readonly tabooExpressions: readonly string[];
      readonly tone: string;
    } | null;
    readonly campaigns: readonly {
      readonly endsAt: Date | null;
      readonly name: string;
      readonly offerDetails: string;
      readonly rules: string;
      readonly startsAt: Date | null;
    }[];
    readonly merchantName: string;
    readonly offerings: readonly {
      readonly description: string;
      readonly fieldValues: Readonly<Record<string, unknown>>;
      readonly id: string;
      readonly name: string;
    }[];
    readonly segments: readonly {
      readonly communicationGoal: string;
      readonly definition: string;
      readonly name: string;
      readonly triggerScenarios: string;
    }[];
  }): SkillKnowledgeSnapshot {
    return {
      assets: [],
      audiences: [],
      brandProfile: input.brandProfile,
      campaigns: input.campaigns.map((campaign) => ({
        endsAt: campaign.endsAt?.toISOString() ?? null,
        name: campaign.name,
        offerDetails: campaign.offerDetails,
        rules: campaign.rules,
        startsAt: campaign.startsAt?.toISOString() ?? null,
      })),
      memberSegments: input.segments.map((segment) => ({
        communicationGoal: segment.communicationGoal,
        definition: segment.definition,
        name: segment.name,
        triggerScenarios: segment.triggerScenarios,
      })),
      merchantName: input.merchantName,
      offerings: input.offerings.map((offering) => ({
        description: offering.description,
        fieldValues: offering.fieldValues,
        id: offering.id,
        name: offering.name,
      })),
    };
  }
}
