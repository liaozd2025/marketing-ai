import { getVerticalPack } from "@marketing-ai/vertical-packs";

import { buildKnowledgeBaseSummary } from "@/lib/knowledge-base-summary";
import { getTenantContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getTenantContext();
  if (!context) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { knowledgeBase } = context.tenant;
  const [
    assets,
    audiences,
    brandProfile,
    campaigns,
    memberSegments,
    offerings,
  ] = await Promise.all([
    knowledgeBase.listAssets(),
    knowledgeBase.listAudiences(),
    knowledgeBase.getBrandProfile(),
    knowledgeBase.listCampaigns(),
    knowledgeBase.listMemberSegments(),
    knowledgeBase.listOfferings(),
  ]);
  const pack = getVerticalPack(context.merchant.verticalPackId);

  return Response.json(
    buildKnowledgeBaseSummary({
      assets,
      audiences,
      brandProfile,
      campaigns,
      memberSegments,
      offerings,
      pack,
    }),
  );
}
