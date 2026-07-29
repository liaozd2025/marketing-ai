import {
  buildMemberTouchPrompt,
  buildSkillPrompt,
  finalizeMemberTouchRun,
  type XiaohongshuTaskInput,
  finalizeSkillRun,
  parseMemberTouchOutput,
  parseSkillOutput,
  resolveMemberTouchScenarios,
  SkillProtocolError,
  type SkillKnowledgeSnapshot,
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

import {
  buildKnowledgeExtractionPrompt,
  parseKnowledgeExtractionOutput,
} from "./knowledge-extraction";
import {
  prepareXiaohongshuPackage,
  type SkillProviderExecutor,
  type XiaohongshuRuntimeOptions,
} from "./xiaohongshu-runtime";

export interface PreparedSkillRun {
  execute(executeProvider: SkillProviderExecutor): Promise<unknown>;
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
  constructor(
    private readonly database: Database,
    private readonly xiaohongshuOptions?: XiaohongshuRuntimeOptions,
  ) {}

  async prepare(task: ClaimedAgentTask): Promise<PreparedSkillRun> {
    const tenant = this.database.forTenant(tenantId(task.merchantId));
    const merchant = await tenant.getMerchant();
    if (!merchant) {
      throw new Error("Skill merchant was not found");
    }
    const pack = getVerticalPack(merchant.verticalPackId);
    if (
      "kind" in task.input &&
      task.input.kind === "knowledge-extraction"
    ) {
      const input = task.input;
      const request: AgentRequest = {
        capability: "text",
        request: {
          messages: buildKnowledgeExtractionPrompt({
            merchantName: merchant.name,
            pack,
            sourceContent: input.sourceText,
            sourceName: input.sourceName,
          }),
        },
      };
      return {
        execute: async (executeProvider) => {
          const result = await executeProvider(request);
          if (result.capability !== "text") {
            throw new Error(
              "Knowledge extraction text provider returned wrong capability",
            );
          }
          const extraction = parseKnowledgeExtractionOutput(
            result.output.text,
            pack,
          );
          const drafts = await tenant.coldStart.storeExtractionDrafts(
            input.importId,
            extraction.drafts,
          );
          return {
            counts: extraction.counts,
            draftCount: drafts.length,
            importId: input.importId,
            protocolVersion: "marketing-ai.knowledge-extraction-result.v1",
          };
        },
      };
    }
    const input = skillInput(task);
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
      const request: AgentRequest = {
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
      };
      return {
        execute: async (executeProvider) => {
          const result = await executeProvider(request);
          if (result.capability !== "text") {
            throw new Error(
              "Member-touch text provider returned wrong capability",
            );
          }
          return finalizeMemberTouchRun({
            complianceLexicon: pack.complianceLexicon,
            configuration,
            knowledge,
            raw: parseMemberTouchOutput(result.output.text),
            scenarios,
            task: input,
          });
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
            accentColor: brandProfile.accentColor,
            fontStyle: brandProfile.fontStyle,
            persona: brandProfile.persona,
            primaryColor: brandProfile.primaryColor,
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
    if (input.skillId === "xiaohongshu") {
      if (
        input.action !== "generate" ||
        (input.imageUsage !== "atmosphere" &&
          input.imageUsage !== "effect") ||
        typeof input.allowAiImage !== "boolean"
      ) {
        throw new Error("Xiaohongshu package input is incomplete");
      }
      return prepareXiaohongshuPackage({
        complianceLexicon: pack.complianceLexicon,
        database: this.database,
        knowledge,
        merchant,
        options: this.xiaohongshuOptions,
        systemInstruction: preset.systemInstruction,
        task,
        taskInput: input as XiaohongshuTaskInput,
      });
    }
    const request: AgentRequest = {
      capability: "text",
      request: {
        messages: buildSkillPrompt({
          complianceLexicon: pack.complianceLexicon,
          knowledge,
          preset,
          task: input,
        }),
      },
    };
    return {
      execute: async (executeProvider) => {
        const result = await executeProvider(request);
        if (result.capability !== "text") {
          throw new Error("Configured Skill text provider returned wrong capability");
        }
        return finalizeSkillRun({
          complianceLexicon: pack.complianceLexicon,
          knowledge,
          preset,
          raw: parseSkillOutput(result.output.text),
          task: input,
        });
      },
    };
  }

  private memberTouchKnowledge(input: {
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
