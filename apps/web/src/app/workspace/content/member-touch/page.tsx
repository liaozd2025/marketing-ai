import {
  resolveMemberTouchScenarios,
} from "@marketing-ai/content-skills";
import {
  getSkillPreset,
  getVerticalPack,
} from "@marketing-ai/vertical-packs";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { requireTenantContext } from "@/lib/tenant-context";

import { MemberTouchWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function MemberTouchPage() {
  const { merchant, tenant } = await requireTenantContext();
  const memberSegments = await tenant.knowledgeBase.listMemberSegments();
  const pack = getVerticalPack(merchant.verticalPackId);
  const preset = getSkillPreset(pack, "member-touch");
  if (!preset.memberTouch) {
    throw new Error("Member-touch configuration is missing");
  }
  const configuredScenarios =
    pack.scenarioVocabulary.find(({ key }) => key === preset.id)?.terms ?? [];
  const scenarios = resolveMemberTouchScenarios(
    configuredScenarios,
    memberSegments,
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
            <Link href="/workspace/content/new">
              新建内容
            </Link>
            <Link className="active" href="/workspace/content/member-touch">
              会员触达
            </Link>
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
          <Link href="/workspace/content/new">朋友圈日更</Link>
          <Link className="active" href="/workspace/content/member-touch">
            会员生命周期触达
          </Link>
        </nav>
        <MemberTouchWorkbench
          initialPlaceholders={preset.memberTouch.placeholders}
          initialScenarios={scenarios}
          segmentCount={memberSegments.length}
        />
      </section>
    </main>
  );
}
