import type { ClaimedAgentTask, Database } from "@marketing-ai/database";
import { describe, expect, it, vi } from "vitest";

import { ConfiguredSkillRuntime } from "./skill-runtime";

const task: ClaimedAgentTask = {
  attemptCount: 1,
  capability: "text",
  completedAt: null,
  conversationId: "conversation-1",
  createdAt: new Date(),
  createdByMemberId: "member-1",
  errorCode: null,
  errorMessage: null,
  id: "task-1",
  input: {
    action: "generate",
    intent: "按会员分层与触达场景生成零 PII 话术模板",
    kind: "skill",
    selectedKnowledgeTypes: [],
    skillId: "member-touch",
  },
  maxAttempts: 3,
  merchantId: "10000000-0000-4000-8000-000000000001",
  result: null,
  status: "running",
  updatedAt: new Date(),
};

describe("configured member-touch runtime seam", () => {
  it("prepares the strict zero-PII matrix protocol and finalizes all cells", async () => {
    const listAssets = vi.fn(() => {
      throw new Error("member-touch must not read assets");
    });
    const listAudiences = vi.fn(() => {
      throw new Error("member-touch must not read audiences");
    });
    const database = {
      forTenant: vi.fn(() => ({
        getMerchant: vi.fn().mockResolvedValue({
          name: "慢慢护理工作室",
          verticalPackId: "beauty-v1",
        }),
        knowledgeBase: {
          getBrandProfile: vi.fn().mockResolvedValue({
            accentColor: "#F4C7AB",
            fontStyle: "warm",
            persona: "社区护理主理人",
            primaryColor: "#7655FF",
            story: "认真经营十年",
            tabooExpressions: [],
            tone: "亲切克制",
          }),
          listAssets,
          listAudiences,
          listCampaigns: vi.fn().mockResolvedValue([]),
          listMemberSegments: vi.fn().mockResolvedValue([
            {
              communicationGoal: "温和提醒",
              definition: "连续 60 天未到店的老客分层",
              name: "60 天未到店",
              triggerScenarios: "换季关怀",
            },
          ]),
          listOfferings: vi.fn().mockResolvedValue([]),
        },
      })),
    } as unknown as Database;

    const prepared = await new ConfiguredSkillRuntime(database).prepare(task);
    const result = await prepared.execute(async (request) => {
      expect(request).toMatchObject({ capability: "text" });
      if (request.capability !== "text") {
        throw new Error("expected text request");
      }
      expect(request.request.messages[0].content).toContain(
        "MARKETING_AI_MEMBER_TOUCH_PROTOCOL_V1",
      );
      const payload = JSON.parse(request.request.messages[1].content);
      expect(payload.matrix).toHaveLength(6);
      expect(payload).not.toHaveProperty("assets");
      expect(payload).not.toHaveProperty("audiences");
      expect(listAssets).not.toHaveBeenCalled();
      expect(listAudiences).not.toHaveBeenCalled();
      return {
        capability: "text",
        output: {
          text: JSON.stringify({
            cells: payload.matrix.map(
              (cell: { scenario: string; segmentKey: string }) => ({
                ...cell,
                alternatives: [
                  `{{member_salutation}}，这是一条${cell.scenario}话术。`,
                  `{{member_salutation}}，这是另一条${cell.scenario}话术。`,
                ],
              }),
            ),
            protocolVersion: "marketing-ai.member-touch-output.v1",
          }),
        },
      };
    });
    expect(result).toMatchObject({
      cells: expect.arrayContaining([
        expect.objectContaining({
          alternatives: [
            expect.objectContaining({ copyReady: true }),
            expect.objectContaining({ copyReady: true }),
          ],
          scenario: "换季关怀",
        }),
      ]),
      protocolVersion: "marketing-ai.member-touch-result.v1",
      scenarios: [
        "新客欢迎",
        "复购唤醒",
        "沉睡唤醒",
        "卡项到期",
        "生日关怀",
        "换季关怀",
      ],
    });
  });
});
