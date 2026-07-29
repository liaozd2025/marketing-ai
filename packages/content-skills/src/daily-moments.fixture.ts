import type { SkillKnowledgeSnapshot } from "./types";

export const seedMerchantKnowledge: SkillKnowledgeSnapshot = {
  merchantName: "慢慢护理工作室",
  brandProfile: {
    persona: "在社区做了十年护理的主理人阿慢",
    story: "坚持先问感受、再做护理，不用焦虑营销催客。",
    tabooExpressions: ["包变美"],
    tone: "像熟人聊天，具体、克制、不说教",
  },
  offerings: [
    {
      id: "offering-1",
      name: "晚间肩颈舒缓护理",
      description: "60 分钟，先沟通日常状态，再做手法放松。",
      fieldValues: {
        offeringType: "service",
        price: 298,
        sellingPoints: "安静独立护理间，手法轻重可随时沟通",
        suitableFor: "久坐、下班后想放松的人",
      },
    },
  ],
  audiences: [
    {
      name: "久坐上班族",
      painPoints: "下班后肩颈容易紧绷，怕被推销",
      motivations: "想安静放松一小时",
      addressStyle: "姐妹",
    },
  ],
  campaigns: [
    {
      name: "八月晚间预约礼",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-08-31T15:59:59.000Z",
      offerDetails: "工作日晚 7 点后预约，到店赠热敷 10 分钟",
      rules: "需提前一天预约，每人限一次",
    },
  ],
  memberSegments: [
    {
      name: "60 天未到店",
      definition: "连续 60 天未到店的老客分层",
      triggerScenarios: "换季关怀",
      communicationGoal: "温和提醒，不制造焦虑",
    },
  ],
  assets: [
    {
      id: "asset-1",
      isEffectImage: false,
      mimeType: "image/jpeg",
      notes: "傍晚自然光，护理师正在整理床铺",
      offeringId: "offering-1",
      originalName: "晚间护理间.jpg",
      scene: "到店日常",
    },
    {
      id: "asset-2",
      isEffectImage: true,
      mimeType: "image/jpeg",
      notes: "已授权的真实护理记录",
      offeringId: "offering-1",
      originalName: "肩颈护理记录.jpg",
      scene: "护理记录",
    },
  ],
};
