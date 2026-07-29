import { getVerticalPack } from "@marketing-ai/vertical-packs";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { buildKnowledgeBaseSummary } from "@/lib/knowledge-base-summary";
import { requireTenantContext } from "@/lib/tenant-context";

import { ContentSkillWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function NewContentPage() {
  const { merchant, tenant } = await requireTenantContext();
  const pack = getVerticalPack(merchant.verticalPackId);
  const [assets, audiences, brandProfile, campaigns, memberSegments, offerings] =
    await Promise.all([
      tenant.knowledgeBase.listAssets(),
      tenant.knowledgeBase.listAudiences(),
      tenant.knowledgeBase.getBrandProfile(),
      tenant.knowledgeBase.listCampaigns(),
      tenant.knowledgeBase.listMemberSegments(),
      tenant.knowledgeBase.listOfferings(),
    ]);
  const context = buildKnowledgeBaseSummary({
    assets,
    audiences,
    brandProfile,
    campaigns,
    memberSegments,
    offerings,
    pack,
  });
  const visibleSkillIds = new Set(["daily-moments", "community"]);
  const presets = pack.skillPresets.filter((preset) =>
    visibleSkillIds.has(preset.id),
  );

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div>
          <Link className="sidebar-brand" href="/workspace">
            <span className="brand-mark small">M</span>
            <span>Marketing AI</span>
          </Link>
          <nav aria-label="主导航">
            <Link className="active" href="/workspace/content/new">
              新建内容
            </Link>
            <a aria-disabled="true" href="#skills">Skill 技能</a>
            <Link href="/workspace/knowledge-base">我的资料</Link>
            <a aria-disabled="true" href="#content-library">内容库</a>
          </nav>
        </div>
        <div>
          <p className="sidebar-merchant">{merchant.name}</p>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">退出登录</button>
          </form>
        </div>
      </aside>
      <section className="workspace-content content-workspace">
        <nav aria-label="内容 Skill" className="skill-switcher">
          <Link href="/workspace/content/member-touch">
            会员生命周期触达
          </Link>
        </nav>
        <ContentSkillWorkbench context={context} presets={presets} />
      </section>
    </main>
  );
}
