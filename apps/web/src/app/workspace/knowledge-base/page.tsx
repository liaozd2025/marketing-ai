import { getVerticalPack } from "@marketing-ai/vertical-packs";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import {
  buildKnowledgeBaseSummary,
  type KnowledgeEntityType,
} from "@/lib/knowledge-base-summary";
import { requireTenantContext } from "@/lib/tenant-context";

import {
  KnowledgeEntitySection,
  KnowledgeSummary,
} from "./components";
import { ColdStartIngestion } from "./cold-start-ingestion";

export const dynamic = "force-dynamic";

const entityTypes = new Set<KnowledgeEntityType>([
  "asset",
  "audience",
  "brandProfile",
  "campaign",
  "memberSegment",
  "offering",
]);

function activeSection(value: string | undefined): KnowledgeEntityType {
  return value && entityTypes.has(value as KnowledgeEntityType)
    ? (value as KnowledgeEntityType)
    : "brandProfile";
}

const resultMessages: Record<string, string> = {
  deleted: "已删除。",
  "invalid-input": "请检查必填项、字段格式和素材文件后重试。",
  "not-found": "未找到该商家空间中的记录。",
  saved: "已保存。",
};

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    error?: string;
    section?: string;
    status?: string;
  }>;
}) {
  const query = await searchParams;
  const active = activeSection(query.section);
  const { merchant, tenant } = await requireTenantContext();
  const { knowledgeBase } = tenant;
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
  const pack = getVerticalPack(merchant.verticalPackId);
  const records = {
    assets,
    audiences,
    brandProfile,
    campaigns,
    memberSegments,
    offerings,
  };
  const summary = buildKnowledgeBaseSummary({ ...records, pack });
  const result = query.error ?? query.status;

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div>
          <Link className="sidebar-brand" href="/workspace">
            <span className="brand-mark small">M</span>
            <span>Marketing AI</span>
          </Link>
          <nav aria-label="主导航">
            <Link href="/workspace">工作台</Link>
            <Link className="active" href="/workspace/knowledge-base">
              我的资料
            </Link>
            <Link href="/workspace/compositions">模板出图</Link>
            <a aria-disabled="true" href="#content-library">
              内容库
            </a>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            退出登录
          </button>
        </form>
      </aside>

      <section className="workspace-content knowledge-page">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">结构化知识库</p>
            <h1>我的资料</h1>
            <p className="page-description">
              为 {merchant.name} 录入可核对、可维护的真实经营信息。
            </p>
          </div>
          <span className="role-badge">{pack.label}</span>
        </header>

        {result && resultMessages[result] ? (
          <p
            className={query.error ? "result-banner error" : "result-banner"}
            role="status"
          >
            {resultMessages[result]}
          </p>
        ) : null}

        <KnowledgeSummary active={active} items={summary} />
        <ColdStartIngestion />
        <KnowledgeEntitySection
          active={active}
          editId={query.edit}
          pack={pack}
          records={records}
        />
      </section>
    </main>
  );
}
