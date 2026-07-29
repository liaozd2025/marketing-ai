import { database, tenantId } from "@marketing-ai/database";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions";
import { deleteSession, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  // merchantId is accepted only from a verified signed session. This route
  // intentionally has no tenant URL segment or tenant form parameter.
  const session = await requireSession();
  const tenant = database.forTenant(tenantId(session.merchantId));
  const [merchant, currentMember, members] = await Promise.all([
    tenant.getMerchant(),
    tenant.getMember(session.memberId),
    tenant.listMembers(),
  ]);

  if (!merchant || !currentMember) {
    await deleteSession();
    redirect("/login");
  }

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div>
          <Link className="sidebar-brand" href="/workspace">
            <span className="brand-mark small">M</span>
            <span>Marketing AI</span>
          </Link>
          <nav aria-label="主导航">
            <a className="active" href="#overview">
              工作台
            </a>
            <Link href="/workspace/knowledge-base">我的资料</Link>
            <a href="#members">成员</a>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            退出登录
          </button>
        </form>
      </aside>

      <section className="workspace-content">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">你的商家空间</p>
            <h1>{merchant.name}</h1>
          </div>
          <span className="role-badge">
            {currentMember.role === "owner" ? "所有者" : "成员"}
          </span>
        </header>

        <section className="welcome-panel" id="overview">
          <p className="eyebrow">平台基座已就绪</p>
          <h2>从真实商家知识开始生产内容</h2>
          <p>
            当前会话已绑定到 <strong>{merchant.name}</strong>，页面中的所有数据
            都通过该商家的租户数据层读取。
          </p>
          <button disabled type="button">
            新建内容（下一阶段）
          </button>
        </section>

        <div className="workspace-grid">
          <section className="info-card" id="knowledge-base">
            <span className="card-index">01</span>
            <h3>我的资料</h3>
            <p>品牌档案、Offering、客群、活动、会员分层和素材。</p>
            <Link className="status" href="/workspace/knowledge-base">
              进入录入
            </Link>
          </section>

          <section className="info-card" id="members">
            <span className="card-index">02</span>
            <h3>商家成员</h3>
            <ul className="member-list">
              {members.map((member) => (
                <li key={member.id}>
                  <span>{member.email}</span>
                  <span>{member.role === "owner" ? "所有者" : "成员"}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
