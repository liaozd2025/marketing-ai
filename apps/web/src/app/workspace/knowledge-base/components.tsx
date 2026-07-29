import type {
  Asset,
  Audience,
  BrandProfile,
  Campaign,
  MemberSegment,
  Offering,
} from "@marketing-ai/database";
import type {
  OfferingFieldDefinition,
  VerticalPack,
} from "@marketing-ai/vertical-packs";
import Link from "next/link";

import type {
  KnowledgeEntityType,
  KnowledgeSummaryItem,
} from "@/lib/knowledge-base-summary";

import {
  createAssetAction,
  deleteAssetAction,
  deleteBrandProfileAction,
  deleteEntityAction,
  saveAudienceAction,
  saveBrandProfileAction,
  saveCampaignAction,
  saveMemberSegmentAction,
  saveOfferingAction,
  updateAssetAction,
} from "./actions";

interface KnowledgeRecords {
  readonly assets: readonly Asset[];
  readonly audiences: readonly Audience[];
  readonly brandProfile: BrandProfile | null;
  readonly campaigns: readonly Campaign[];
  readonly memberSegments: readonly MemberSegment[];
  readonly offerings: readonly Offering[];
}

function Field({
  children,
  help,
  label,
}: {
  readonly children: React.ReactNode;
  readonly help?: string;
  readonly label: string;
}) {
  return (
    <label className="kb-field">
      <span>{label}</span>
      {help ? <small>{help}</small> : null}
      {children}
    </label>
  );
}

function TextArea({
  defaultValue,
  name,
  placeholder,
  required = true,
}: {
  readonly defaultValue?: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly required?: boolean;
}) {
  return (
    <textarea
      defaultValue={defaultValue}
      maxLength={5000}
      name={name}
      placeholder={placeholder}
      required={required}
      rows={4}
    />
  );
}

function FormActions({
  cancelHref,
  isEditing,
}: {
  readonly cancelHref?: string;
  readonly isEditing: boolean;
}) {
  return (
    <div className="form-actions">
      <button type="submit">{isEditing ? "保存修改" : "添加"}</button>
      {cancelHref ? (
        <Link className="text-button" href={cancelHref}>
          取消编辑
        </Link>
      ) : null}
    </div>
  );
}

function DeleteButton({
  id,
  type,
}: {
  readonly id: string;
  readonly type: "audience" | "campaign" | "memberSegment" | "offering";
}) {
  return (
    <form action={deleteEntityAction.bind(null, type, id)}>
      <button className="danger-link" type="submit">
        删除
      </button>
    </form>
  );
}

function EmptyState({ label }: { readonly label: string }) {
  return <p className="empty-state">还没有{label}，从右侧表单添加第一条。</p>;
}

function RecordCard({
  children,
  editHref,
  title,
}: {
  readonly children: React.ReactNode;
  readonly editHref: string;
  readonly title: string;
}) {
  return (
    <article className="record-card">
      <div>
        <h4>{title}</h4>
        {children}
      </div>
      <Link className="text-button" href={editHref}>
        编辑
      </Link>
    </article>
  );
}

function BrandProfileSection({
  profile,
}: {
  readonly profile: BrandProfile | null;
}) {
  return (
    <div className="kb-detail-grid single-record-grid">
      <div className="record-list">
        <h3>当前品牌档案</h3>
        {profile ? (
          <article className="record-card stacked">
            <div>
              <p className="record-label">品牌人设</p>
              <p>{profile.persona}</p>
              <p className="record-label">品牌语气</p>
              <p>{profile.tone}</p>
              <p className="record-label">品牌故事</p>
              <p>{profile.story}</p>
              <p className="record-label">禁忌表达</p>
              <p>
                {profile.tabooExpressions.length
                  ? profile.tabooExpressions.join("、")
                  : "未设置"}
              </p>
            </div>
            <form action={deleteBrandProfileAction}>
              <button className="danger-link" type="submit">
                清空品牌档案
              </button>
            </form>
          </article>
        ) : (
          <EmptyState label="品牌档案" />
        )}
      </div>

      <form action={saveBrandProfileAction} className="kb-form">
        <div>
          <p className="eyebrow">一商家一份</p>
          <h3>{profile ? "编辑品牌档案" : "建立品牌档案"}</h3>
        </div>
        <Field label="品牌人设">
          <TextArea
            defaultValue={profile?.persona}
            name="persona"
            placeholder="例如：懂审美、说人话的门店主理人"
          />
        </Field>
        <Field label="品牌语气">
          <TextArea
            defaultValue={profile?.tone}
            name="tone"
            placeholder="例如：亲切克制、专业但不说教"
          />
        </Field>
        <Field label="品牌故事">
          <TextArea
            defaultValue={profile?.story}
            name="story"
            placeholder="为什么开店、坚持什么、希望给客人什么体验"
          />
        </Field>
        <Field
          help="用逗号或换行分隔；这里是商家自己的禁忌，不替代垂类违禁词表。"
          label="禁忌表达（可选）"
        >
          <TextArea
            defaultValue={profile?.tabooExpressions.join("\n")}
            name="tabooExpressions"
            required={false}
          />
        </Field>
        <FormActions isEditing={Boolean(profile)} />
      </form>
    </div>
  );
}

function OfferingField({
  field,
  value,
}: {
  readonly field: OfferingFieldDefinition;
  readonly value: unknown;
}) {
  const common = {
    defaultValue: value === undefined ? "" : String(value),
    name: `field.${field.key}`,
    placeholder: field.placeholder,
    required: field.required,
  };

  return (
    <Field
      help={field.help}
      label={`${field.label}${field.required ? " *" : ""}`}
    >
      {field.type === "textarea" ? (
        <textarea {...common} rows={3} />
      ) : field.type === "select" ? (
        <select {...common}>
          <option value="">{field.placeholder ?? "请选择"}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          max={field.max}
          min={field.min}
          step={field.type === "number" ? "any" : undefined}
          type={field.type}
        />
      )}
    </Field>
  );
}

function OfferingSection({
  editing,
  offerings,
  pack,
}: {
  readonly editing: Offering | null;
  readonly offerings: readonly Offering[];
  readonly pack: VerticalPack;
}) {
  return (
    <div className="kb-detail-grid">
      <div className="record-list">
        <h3>已录入 Offering</h3>
        {offerings.length ? (
          offerings.map((offering) => (
            <RecordCard
              editHref={`/workspace/knowledge-base?section=offering&edit=${offering.id}`}
              key={offering.id}
              title={offering.name}
            >
              <p>{offering.description || "暂无补充说明"}</p>
              <div className="record-card-footer">
                <span>{Object.keys(offering.fieldValues).length} 个垂类字段</span>
                <DeleteButton id={offering.id} type="offering" />
              </div>
            </RecordCard>
          ))
        ) : (
          <EmptyState label="Offering" />
        )}
      </div>

      <form
        action={saveOfferingAction.bind(null, editing?.id ?? "")}
        className="kb-form"
      >
        <div>
          <p className="eyebrow">{pack.label}字段模板</p>
          <h3>{editing ? "编辑 Offering" : "添加 Offering"}</h3>
          <p className="form-note">
            以下垂类字段全部来自 {pack.id} 配置，配置变化会直接反映到表单。
          </p>
        </div>
        <Field label="名称 *">
          <input
            defaultValue={editing?.name}
            maxLength={120}
            name="name"
            placeholder="例如：肩颈舒缓护理"
            required
          />
        </Field>
        <Field label="基础说明（可选）">
          <TextArea
            defaultValue={editing?.description}
            name="description"
            required={false}
          />
        </Field>
        {pack.offeringFields.map((field) => (
          <OfferingField
            field={field}
            key={field.key}
            value={editing?.fieldValues[field.key]}
          />
        ))}
        <FormActions
          cancelHref={
            editing
              ? "/workspace/knowledge-base?section=offering"
              : undefined
          }
          isEditing={Boolean(editing)}
        />
      </form>
    </div>
  );
}

function AudienceSection({
  audiences,
  editing,
}: {
  readonly audiences: readonly Audience[];
  readonly editing: Audience | null;
}) {
  return (
    <div className="kb-detail-grid">
      <div className="record-list">
        <h3>已录入客群</h3>
        {audiences.length ? (
          audiences.map((audience) => (
            <RecordCard
              editHref={`/workspace/knowledge-base?section=audience&edit=${audience.id}`}
              key={audience.id}
              title={audience.name}
            >
              <p>{audience.painPoints}</p>
              <div className="record-card-footer">
                <span>称呼：{audience.addressStyle}</span>
                <DeleteButton id={audience.id} type="audience" />
              </div>
            </RecordCard>
          ))
        ) : (
          <EmptyState label="客群" />
        )}
      </div>
      <form
        action={saveAudienceAction.bind(null, editing?.id ?? "")}
        className="kb-form"
      >
        <h3>{editing ? "编辑客群" : "添加客群"}</h3>
        <Field label="客群名称">
          <input defaultValue={editing?.name} name="name" required />
        </Field>
        <Field label="核心痛点">
          <TextArea defaultValue={editing?.painPoints} name="painPoints" />
        </Field>
        <Field label="行动动机">
          <TextArea defaultValue={editing?.motivations} name="motivations" />
        </Field>
        <Field label="称呼方式">
          <input
            defaultValue={editing?.addressStyle}
            name="addressStyle"
            placeholder="例如：姐妹、宝妈朋友"
            required
          />
        </Field>
        <FormActions
          cancelHref={
            editing
              ? "/workspace/knowledge-base?section=audience"
              : undefined
          }
          isEditing={Boolean(editing)}
        />
      </form>
    </div>
  );
}

function dateTimeValue(value: Date | null | undefined): string {
  if (!value) {
    return "";
  }
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function CampaignSection({
  campaigns,
  editing,
}: {
  readonly campaigns: readonly Campaign[];
  readonly editing: Campaign | null;
}) {
  return (
    <div className="kb-detail-grid">
      <div className="record-list">
        <h3>已录入活动</h3>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <RecordCard
              editHref={`/workspace/knowledge-base?section=campaign&edit=${campaign.id}`}
              key={campaign.id}
              title={campaign.name}
            >
              <p>{campaign.offerDetails}</p>
              <div className="record-card-footer">
                <span>
                  {campaign.startsAt
                    ? campaign.startsAt.toLocaleDateString("zh-CN")
                    : "长期活动"}
                </span>
                <DeleteButton id={campaign.id} type="campaign" />
              </div>
            </RecordCard>
          ))
        ) : (
          <EmptyState label="活动" />
        )}
      </div>
      <form
        action={saveCampaignAction.bind(null, editing?.id ?? "")}
        className="kb-form"
      >
        <h3>{editing ? "编辑活动" : "添加活动"}</h3>
        <Field label="活动名称">
          <input defaultValue={editing?.name} name="name" required />
        </Field>
        <div className="field-row">
          <Field label="开始时间（可选）">
            <input
              defaultValue={dateTimeValue(editing?.startsAt)}
              name="startsAt"
              type="datetime-local"
            />
          </Field>
          <Field label="结束时间（可选）">
            <input
              defaultValue={dateTimeValue(editing?.endsAt)}
              name="endsAt"
              type="datetime-local"
            />
          </Field>
        </div>
        <Field label="活动力度">
          <TextArea
            defaultValue={editing?.offerDetails}
            name="offerDetails"
          />
        </Field>
        <Field label="参与规则">
          <TextArea defaultValue={editing?.rules} name="rules" />
        </Field>
        <FormActions
          cancelHref={
            editing
              ? "/workspace/knowledge-base?section=campaign"
              : undefined
          }
          isEditing={Boolean(editing)}
        />
      </form>
    </div>
  );
}

function MemberSegmentSection({
  editing,
  segments,
}: {
  readonly editing: MemberSegment | null;
  readonly segments: readonly MemberSegment[];
}) {
  return (
    <>
      <div className="privacy-notice">
        <strong>零个人信息</strong>
        <span>
          这里只定义“新客、活跃、沉睡”等分层及触达场景，不上传姓名、手机号、微信号或会员明细。
        </span>
      </div>
      <div className="kb-detail-grid">
        <div className="record-list">
          <h3>已定义会员分层</h3>
          {segments.length ? (
            segments.map((segment) => (
              <RecordCard
                editHref={`/workspace/knowledge-base?section=memberSegment&edit=${segment.id}`}
                key={segment.id}
                title={segment.name}
              >
                <p>{segment.definition}</p>
                <div className="record-card-footer">
                  <span>{segment.triggerScenarios}</span>
                  <DeleteButton id={segment.id} type="memberSegment" />
                </div>
              </RecordCard>
            ))
          ) : (
            <EmptyState label="会员分层" />
          )}
        </div>
        <form
          action={saveMemberSegmentAction.bind(null, editing?.id ?? "")}
          className="kb-form"
        >
          <h3>{editing ? "编辑会员分层" : "添加会员分层"}</h3>
          <Field label="分层名称">
            <input
              defaultValue={editing?.name}
              name="name"
              placeholder="例如：卡项将到期"
              required
            />
          </Field>
          <Field label="分层定义">
            <TextArea defaultValue={editing?.definition} name="definition" />
          </Field>
          <Field label="触达场景">
            <TextArea
              defaultValue={editing?.triggerScenarios}
              name="triggerScenarios"
            />
          </Field>
          <Field label="沟通目标">
            <TextArea
              defaultValue={editing?.communicationGoal}
              name="communicationGoal"
            />
          </Field>
          <FormActions
            cancelHref={
              editing
                ? "/workspace/knowledge-base?section=memberSegment"
                : undefined
            }
            isEditing={Boolean(editing)}
          />
        </form>
      </div>
    </>
  );
}

function AssetMetadataFields({
  asset,
  offerings,
}: {
  readonly asset?: Asset | null;
  readonly offerings: readonly Offering[];
}) {
  return (
    <>
      <Field label="场景标签">
        <input
          defaultValue={asset?.scene}
          name="scene"
          placeholder="例如：到店日常、效果记录、环境展示"
          required
        />
      </Field>
      <Field label="关联 Offering（可选）">
        <select defaultValue={asset?.offeringId ?? ""} name="offeringId">
          <option value="">不关联</option>
          {offerings.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {offering.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="素材说明（可选）">
        <TextArea
          defaultValue={asset?.notes}
          name="notes"
          required={false}
        />
      </Field>
      <label className="checkbox-field">
        <input
          defaultChecked={asset?.isEffectImage}
          name="isEffectImage"
          type="checkbox"
        />
        <span>
          这是效果类图
          <small>效果类图按 ADR-0002 只能使用本次上传的实拍素材。</small>
        </span>
      </label>
    </>
  );
}

function AssetSection({
  assets,
  editing,
  offerings,
}: {
  readonly assets: readonly Asset[];
  readonly editing: Asset | null;
  readonly offerings: readonly Offering[];
}) {
  return (
    <div className="kb-detail-grid">
      <div className="record-list">
        <h3>已上传素材</h3>
        {assets.length ? (
          assets.map((asset) => (
            <article className="record-card" key={asset.id}>
              <div>
                <div className="asset-title">
                  <h4>{asset.originalName}</h4>
                  <span className="real-badge">实拍</span>
                  {asset.isEffectImage ? (
                    <span className="effect-badge">效果类图</span>
                  ) : null}
                </div>
                <p>
                  {asset.scene} · {(asset.byteSize / 1024 / 1024).toFixed(1)} MB
                </p>
                <div className="record-card-footer">
                  <Link
                    className="text-button"
                    href={`/api/knowledge-base/assets/${asset.id}/file`}
                    target="_blank"
                  >
                    查看原文件
                  </Link>
                  <form action={deleteAssetAction.bind(null, asset.id)}>
                    <button className="danger-link" type="submit">
                      删除
                    </button>
                  </form>
                </div>
              </div>
              <Link
                className="text-button"
                href={`/workspace/knowledge-base?section=asset&edit=${asset.id}`}
              >
                编辑标签
              </Link>
            </article>
          ))
        ) : (
          <EmptyState label="素材" />
        )}
      </div>

      {editing ? (
        <form
          action={updateAssetAction.bind(null, editing.id)}
          className="kb-form"
        >
          <div>
            <p className="eyebrow">仅更新结构化元数据</p>
            <h3>编辑素材标签</h3>
            <p className="form-note">{editing.originalName}</p>
          </div>
          <AssetMetadataFields asset={editing} offerings={offerings} />
          <FormActions
            cancelHref="/workspace/knowledge-base?section=asset"
            isEditing
          />
        </form>
      ) : (
        <form action={createAssetAction} className="kb-form">
          <div>
            <p className="eyebrow">真实上传</p>
            <h3>上传实拍素材</h3>
            <p className="form-note">
              支持图片或视频，单文件不超过 20 MB；文件受签名会话和租户隔离保护。
            </p>
          </div>
          <Field label="素材文件">
            <input
              accept="image/*,video/*"
              name="file"
              required
              type="file"
            />
          </Field>
          <AssetMetadataFields offerings={offerings} />
          <FormActions isEditing={false} />
        </form>
      )}
    </div>
  );
}

export function KnowledgeSummary({
  active,
  items,
}: {
  readonly active: KnowledgeEntityType;
  readonly items: readonly KnowledgeSummaryItem[];
}) {
  return (
    <div className="knowledge-summary" aria-label="知识库完善度">
      {items.map((item) => (
        <Link
          className={active === item.type ? "summary-card active" : "summary-card"}
          href={`/workspace/knowledge-base?section=${item.type}`}
          key={item.type}
        >
          <div className="summary-card-header">
            <strong>{item.label}</strong>
            <span>{item.count} 条</span>
          </div>
          <div
            aria-label={`${item.label}完善度 ${item.percentage}%`}
            className="progress-track"
          >
            <span style={{ width: `${item.percentage}%` }} />
          </div>
          <span className="completion-value">完善度 {item.percentage}%</span>
        </Link>
      ))}
    </div>
  );
}

export function ColdStartIngestion() {
  return (
    <details className="cold-start">
      <summary>
        <span>
          <strong>从已有资料开始</strong>
          <small>上传文件或添加链接，后续可用于 AI 抽取预填</small>
        </span>
        <span>冷启动入口</span>
      </summary>
      <div className="cold-start-options">
        <div>
          <strong>上传资料文件</strong>
          <p>结构化抽取能力将在独立 Skill 中接入，当前请使用下方表单录入。</p>
        </div>
        <div>
          <strong>添加资料链接</strong>
          <p>链接抓取尚未启用，不会把散文档直接写入知识库。</p>
        </div>
      </div>
    </details>
  );
}

export function KnowledgeEntitySection({
  active,
  editId,
  pack,
  records,
}: {
  readonly active: KnowledgeEntityType;
  readonly editId?: string;
  readonly pack: VerticalPack;
  readonly records: KnowledgeRecords;
}) {
  if (active === "brandProfile") {
    return <BrandProfileSection profile={records.brandProfile} />;
  }
  if (active === "offering") {
    return (
      <OfferingSection
        editing={
          records.offerings.find((offering) => offering.id === editId) ?? null
        }
        offerings={records.offerings}
        pack={pack}
      />
    );
  }
  if (active === "audience") {
    return (
      <AudienceSection
        audiences={records.audiences}
        editing={
          records.audiences.find((audience) => audience.id === editId) ?? null
        }
      />
    );
  }
  if (active === "campaign") {
    return (
      <CampaignSection
        campaigns={records.campaigns}
        editing={
          records.campaigns.find((campaign) => campaign.id === editId) ?? null
        }
      />
    );
  }
  if (active === "memberSegment") {
    return (
      <MemberSegmentSection
        editing={
          records.memberSegments.find((segment) => segment.id === editId) ??
          null
        }
        segments={records.memberSegments}
      />
    );
  }
  return (
    <AssetSection
      assets={records.assets}
      editing={records.assets.find((asset) => asset.id === editId) ?? null}
      offerings={records.offerings}
    />
  );
}
