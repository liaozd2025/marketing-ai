import { builtinTemplateRegistry } from "@marketing-ai/template-composition";
import Link from "next/link";

import { logoutAction } from "@/app/actions";
import { requireTenantContext } from "@/lib/tenant-context";

import { CompositionStudio } from "./studio";

export const dynamic = "force-dynamic";

export default async function CompositionsPage() {
  const { merchant, tenant } = await requireTenantContext();
  const [assets, brandProfile, recent] = await Promise.all([
    tenant.knowledgeBase.listAssets(),
    tenant.knowledgeBase.getBrandProfile(),
    tenant.compositions.list(8),
  ]);
  const rasterAssets = assets.filter((asset) =>
    ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)
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
            <Link href="/workspace">工作台</Link>
            <Link href="/workspace/knowledge-base">我的资料</Link>
            <Link className="active" href="/workspace/compositions">
              模板出图
            </Link>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            退出登录
          </button>
        </form>
      </aside>

      <section className="workspace-content composition-page">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">HTML 模板合成</p>
            <h1>模板出图</h1>
            <p className="page-description">
              将 {merchant.name} 的品牌视觉、中文文案与授权实拍素材合成为平台图片。
            </p>
          </div>
          <span className="role-badge">真实素材优先</span>
        </header>

        {!brandProfile ? (
          <section className="studio-prerequisite">
            <h2>先完善品牌档案</h2>
            <p>模板需要品牌主色、辅助色和字体气质，完成后才能稳定出图。</p>
            <Link href="/workspace/knowledge-base?section=brandProfile">
              去建立品牌档案
            </Link>
          </section>
        ) : rasterAssets.length === 0 ? (
          <section className="studio-prerequisite">
            <h2>先上传实拍图片</h2>
            <p>当前没有可用于模板合成的 PNG、JPEG 或 WebP 商家素材。</p>
            <Link href="/workspace/knowledge-base?section=asset">
              去上传素材
            </Link>
          </section>
        ) : (
          <CompositionStudio
            assets={rasterAssets.map((asset) => ({
              id: asset.id,
              isEffectImage: asset.isEffectImage,
              name: asset.originalName,
              scene: asset.scene,
              url: `/api/knowledge-base/assets/${asset.id}/file`,
            }))}
            brand={{
              accentColor: brandProfile.accentColor,
              fontStyle: brandProfile.fontStyle,
              primaryColor: brandProfile.primaryColor,
            }}
            merchantName={merchant.name}
            templates={builtinTemplateRegistry.list()}
          />
        )}

        {recent.length ? (
          <section className="composition-history">
            <div>
              <p className="eyebrow">最近生成</p>
              <h2>已保存 PNG</h2>
            </div>
            <div className="composition-history-grid">
              {recent.map((composition) => (
                <a
                  href={`/api/compositions/${composition.id}/image`}
                  key={composition.id}
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={composition.headline}
                    src={`/api/compositions/${composition.id}/image`}
                  />
                  <strong>{composition.headline}</strong>
                  <span>
                    {composition.width}×{composition.height}
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
