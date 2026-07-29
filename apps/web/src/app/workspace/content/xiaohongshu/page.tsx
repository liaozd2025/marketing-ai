import {
  getSkillPreset,
  getVerticalPack,
} from "@marketing-ai/vertical-packs";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { requireTenantContext } from "@/lib/tenant-context";

import { XiaohongshuWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

export default async function XiaohongshuPage() {
  const { merchant } = await requireTenantContext();
  const preset = getSkillPreset(
    getVerticalPack(merchant.verticalPackId),
    "xiaohongshu",
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
            <Link href="/workspace/content/member-touch">会员触达</Link>
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
          <Link href="/workspace/content/new">朋友圈 / 社群</Link>
          <Link href="/workspace/content/member-touch">会员生命周期触达</Link>
          <Link className="active" href="/workspace/content/xiaohongshu">
            小红书图文
          </Link>
        </nav>
        <XiaohongshuWorkbench
          description={preset.description}
          merchantName={merchant.name}
        />
      </section>
    </main>
  );
}
