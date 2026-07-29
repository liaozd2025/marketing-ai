# 电商 / 品牌零售垂类包纸面校验

日期：2026-07-30
对应 Issue：[#12 T11 电商垂类包纸面校验](https://github.com/liaozd2025/marketing-ai/issues/12)

## 结论

**有条件成立。**

现有「固定 Offering 核心实体 + 垂类包配置」可以承载电商内容营销 MVP，
不需要为电商新建独立数据库 schema，也不需要引入 EAV 实体引擎。成立的前提是：

1. 电商中的一个 Offering 固定表示**一个可独立定价、售卖和履约的 SKU / 商品变体**，
   不是包含多个规格组合的商品族。
2. Offering 只保存相对稳定的商品事实，以及人工确认过的价格、库存和履约快照；
   它不是库存、订单、仓配或价格中心。
3. 限时促销价格与规则归入「活动」，图片与视频归入「素材」，不重复塞进
   Offering。

纸面试填证明，SKU、单一规格组合、卖点、单价、库存状态、发货时效和售后说明
都能进入当前 `name + description + fieldValues` 结构，并完整传入 Skill。
但当前字段模板仅支持 `text`、`textarea`、`number`、`select` 四种标量类型，
不能可靠表达商品族—变体关系、可重复规格项、区域运费矩阵、条件必填规则和
库存时效。把这些复杂数据压成文本虽然“能存”，但不可可靠校验，不能视为完整
表达。

因此，本次校验不推翻 ADR-0001，但需要收紧 Offering 粒度与事实边界；已同步
回写 [ADR-0001](../adr/0001-vertical-pack-over-per-vertical-schema.md) 和
[CONTEXT.md](../../CONTEXT.md)。在真正上线电商垂类包前，还需扩展垂类字段契约，
详见「缺陷与后续门槛」。

## 校验范围与判定标准

本报告只做文档级纸面校验，不新增 `ecommerce-v1` 配置，不修改产品代码，也不
声称已完成电商系统集成。

校验对象：

- Offering 的固定字段：`name`、`description`。
- Offering 的垂类字段：`fieldValues`。
- 垂类包的四部分：Offering 字段模板、场景词表、违禁词表、Skill 预设。
- Offering 与活动、素材之间的职责划分。

判定标准：

- **能表达**：可用当前字段类型保存，服务端可以按配置校验，UI 可以按配置录入，
  Skill 能收到原值。
- **降级表达**：可以塞入字符串，但会丢失结构、条件或时效，不能做可靠自动校验。
- **不能表达**：当前配置契约没有对应的数据结构或规则，必须改机制或接外部系统。

样例值均为本报告构造的虚构测试数据，只用于验证结构，不是商家商品事实或
市场调研结论。

## 证据基线

### 仓库事实

| 证据 | 当前事实 | 对本次校验的意义 |
|---|---|---|
| [Offering 数据类型](../../packages/database/src/knowledge-base-types.ts) | 固定字段为 `name`、`description`、`fieldValues` | 电商差异可以进入 JSON 对象，不要求新增列 |
| [数据库迁移](../../packages/database/migrations/0002_knowledge_base.sql) | `field_values` 是必须为对象的 `jsonb` | 标量字段可持久化；数据库本身不约束字段语义 |
| [垂类包字段契约](../../packages/vertical-packs/src/types.ts) | 字段类型仅有 `number/select/text/textarea` | 可配置标量表单成立，嵌套与重复结构缺位 |
| [垂类包加载与校验](../../packages/vertical-packs/src/index.ts) | 校验器按 `offeringFields` 逐项读取、校验并输出值 | 同一配置驱动服务端校验；未配置字段不会进入结果 |
| [知识库表单解析](../../apps/web/src/lib/knowledge-base-input.ts) | UI 提交值由当前商家的垂类包解析 | 不需要电商条件分支即可换字段模板 |
| [Skill runtime](../../packages/agent-worker/src/skill-runtime.ts) | `fieldValues` 原样进入结构化知识快照 | 电商字段可以被通用 Skill prompt 消费 |
| [美业 v1 示例](../../packages/vertical-packs/config/beauty-v1.json) | 四部分配置已在一个 JSON 包内落地 | 电商包可沿用同一外形，但目前仓库只注册了美业包 |

### 外部字段依据

- [Google Merchant Center 商品数据规范](https://support.google.com/merchants/answer/7052112?hl=en)
  把商品唯一标识、标题、描述、价格、可售状态、变体组、规格、配送成本与时效、
  退货政策作为不同属性，并要求频繁变化的价格与可售状态保持新鲜。它支持本报告
  对字段覆盖面和“动态事实不能当静态文案资料”的判断。
- [Shopify ProductVariant 官方模型](https://shopify.dev/docs/api/admin-graphql/latest/objects/ProductVariant)
  把一个颜色 / 尺码组合视为一个变体，并在变体层管理 SKU、价格、库存、媒体和
  履约关联。它支持“一个 Offering 对应一个可售 SKU / 变体”的粒度选择。
- [市场监管总局《网络购买商品七日无理由退货暂行办法》](https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2023/art_26ca8fe29e184edd899fa0a7a060d935.html)
  规定了七日无理由退货、例外商品、商品完好标准、退货运费与显著确认等差异化
  条件。它证明售后不能只用一个真假值表达。本报告不构成法律意见，正式上线前
  仍需按商品类目和实际经营规则复核。

## 候选电商 Offering 字段模板

以下模板严格使用当前 `OfferingFieldDefinition` 已支持的四种字段类型。`name`
和 `description` 是 Offering 固定字段，不重复放入 `fieldValues`。

| key | 中文名 | 类型 | 必填 | 示例 | 说明 |
|---|---|---:|---:|---|---|
| `sku` | 商家 SKU 编码 | text | 是 | `CUP-500-CREAM` | 单个可售变体的稳定标识 |
| `itemGroupId` | 商品族编码 | text | 否 | `CUP-TRITAN` | 同款不同规格的分组提示；当前无引用完整性 |
| `productBrand` | 商品品牌 | text | 是 | `山岚器物（虚构）` | 多品牌零售商不能只依赖商家级品牌档案 |
| `category` | 商品类目 | text | 是 | `饮水杯` | 用于内容语境和售后规则提示 |
| `barcode` | 条码 | text | 否 | 留空 | 不伪造真实 GTIN；有真实值时录入 |
| `specification` | 本 SKU 规格 | textarea | 是 | `容量=500 mL；颜色=奶油白；材质=Tritan` | 当前为降级表达，键值项不可单独校验 |
| `price` | 日常售价 | number | 是 | `129` | 只放日常价；限时价归入活动 |
| `currency` | 币种 | select | 是 | `CNY` | 选项可先只开放人民币 |
| `sellingPoints` | 核心卖点 | textarea | 是 | `一键开盖；杯身刻度；可拆洗密封圈` | 只写可证明的商品事实 |
| `usageAndCare` | 使用与养护 | textarea | 否 | `首次使用前清洗；不适用于微波炉` | 降低误用风险 |
| `availabilityStatus` | 可售状态 | select | 是 | `in_stock` | 建议选项：有货、缺货、预售、补货中 |
| `inventoryQuantity` | 可售库存快照 | number | 否 | `37` | 仅快照，不是实时库存 |
| `inventoryObservedAt` | 库存确认时间 | text | 否 | `2026-07-30T10:00:00+08:00` | 当前只能按文本保存，不能校验时间或过期 |
| `dispatchWithinHours` | 承诺发货时限（小时） | number | 是 | `48` | 只表达发货，不等同于签收时效 |
| `shippingPolicy` | 配送范围与运费 | textarea | 是 | `中国大陆大部分地区包邮；偏远地区以结算页为准` | 区域矩阵只能降级为文本 |
| `returnEligibility` | 无理由退货规则 | select | 是 | `seven_day_reasonless` | 选项需包含依法适用、需确认的例外等状态 |
| `afterSalesPolicy` | 售后条件 | textarea | 是 | `签收次日起 7 日内按规则申请；退回时商品、配件及赠品需齐全` | 必须按类目与实际承诺复核 |

对应的配置片段可以写成：

```json
{
  "key": "availabilityStatus",
  "label": "可售状态",
  "type": "select",
  "required": true,
  "options": [
    { "value": "in_stock", "label": "有货" },
    { "value": "out_of_stock", "label": "缺货" },
    { "value": "preorder", "label": "预售" },
    { "value": "backorder", "label": "补货中" }
  ],
  "help": "动态快照；生成前必须确认仍然有效。"
}
```

## 样例试填与实体映射

### 模拟业务输入

| 来源 | 原始字段 | 测试值 |
|---|---|---|
| 商品主数据 | 商品族 | `CUP-TRITAN` / 山岚 Tritan 随行杯 |
| 商品主数据 | SKU | `CUP-500-CREAM` |
| 商品主数据 | 规格组合 | 500 mL / 奶油白 / Tritan 杯身 |
| 商品主数据 | 稳定卖点 | 一键开盖、杯身刻度、可拆洗密封圈 |
| 价格中心 | 日常售价 | 129 CNY |
| 库存系统 | 可售库存 | 37；2026-07-30 10:00 +08:00 确认 |
| 履约规则 | 发货 | 付款后 48 小时内发货 |
| 配送规则 | 范围与运费 | 中国大陆大部分地区包邮；偏远地区以结算页为准 |
| 售后规则 | 退货 | 样例规则见下方；正式值须经商家与法务确认 |
| 营销活动 | 限时权益 | 2026-08-01 至 2026-08-03，活动价 109 CNY |
| 素材库 | SKU 主图 | 奶油白 500 mL 实拍图 |

### 映射结果

| 业务字段 | 目标位置 | 结果 | 原因 |
|---|---|---|---|
| 商品标题 + 规格摘要 | `Offering.name` | 能表达 | 名称唯一指向本 SKU |
| 商品长说明 | `Offering.description` | 能表达 | 适合放稳定的商品定位和使用场景 |
| SKU / 商品族编码 | `fieldValues.sku/itemGroupId` | 能表达 | 都是稳定标量；商品族关系暂不受约束 |
| 规格组合 | `fieldValues.specification` | 降级表达 | 能给模型阅读，不能逐项筛选或校验 |
| 稳定卖点 | `fieldValues.sellingPoints` | 能表达 | 与当前美业 `sellingPoints` 用法一致 |
| 日常售价 | `fieldValues.price/currency` | 能表达 | 两字段可存，但当前无跨字段原子校验 |
| 限时活动价与日期 | `Campaign.offerDetails/startsAt/endsAt` | 能表达 | 避免把短期活动写成商品长期事实 |
| 库存数量与确认时间 | `fieldValues.inventoryQuantity/inventoryObservedAt` | 降级表达 | 可存快照，但没有 TTL、来源或自动刷新 |
| 发货时限 | `fieldValues.dispatchWithinHours` | 能表达 | 单一数字可校验；不代表预计签收 |
| 区域运费规则 | `fieldValues.shippingPolicy` | 降级表达 | 多地区、多服务等级矩阵被压成文本 |
| 售后规则 | `fieldValues.returnEligibility/afterSalesPolicy` | 降级表达 | 能供文案引用，但复杂条件不能自动验证 |
| SKU 实拍图 | `Asset.offeringId` | 能表达 | 素材可关联到本 Offering |

### 形成的 Offering 记录

```json
{
  "name": "山岚 Tritan 随行杯 500 mL / 奶油白（虚构样例）",
  "description": "面向通勤和日常饮水场景的随行杯。本记录只验证字段结构。",
  "fieldValues": {
    "sku": "CUP-500-CREAM",
    "itemGroupId": "CUP-TRITAN",
    "productBrand": "山岚器物（虚构）",
    "category": "饮水杯",
    "specification": "容量=500 mL；颜色=奶油白；材质=Tritan 杯身",
    "price": 129,
    "currency": "CNY",
    "sellingPoints": "一键开盖；杯身刻度；可拆洗密封圈",
    "usageAndCare": "首次使用前清洗；不适用于微波炉",
    "availabilityStatus": "in_stock",
    "inventoryQuantity": 37,
    "inventoryObservedAt": "2026-07-30T10:00:00+08:00",
    "dispatchWithinHours": 48,
    "shippingPolicy": "中国大陆大部分地区包邮；偏远地区以结算页为准",
    "returnEligibility": "seven_day_reasonless",
    "afterSalesPolicy": "签收次日起 7 日内按规则申请；退回时商品、配件及赠品需齐全"
  }
}
```

若同款还有 `650 mL / 松柏绿`，应创建第二个 Offering，使用不同 `sku`，沿用
同一个 `itemGroupId`。不得把两个规格的价格和库存数组塞进同一个 Offering，
否则当前字段模板无法判断文案引用的是哪个 SKU。

## 垂类包其余三部分试填

### 场景词表

| Skill key | 候选场景词 |
|---|---|
| `daily-moments` | 新品上架、单品讲解、使用场景、补货提醒、买家问答 |
| `member-touch` | 新客欢迎、首购转化、复购提醒、沉睡唤醒、会员日 |
| `community` | 新品预告、选购指南、开箱答疑、售后说明、活动提醒 |
| `xiaohongshu` | 单品种草、真实测评、使用教程、规格对比、搭配清单 |

`ScenarioVocabulary` 的 `key/label/terms[]` 可以直接承载以上内容，结论为
**能表达**。

### 违禁词表

候选项可以沿用当前 `term/category/severity/replacement` 契约，例如：

| term | category | severity | replacement |
|---|---|---|---|
| 全网最低价 | 价格绝对化 | block | 当前活动价 |
| 100%正品 | 绝对化承诺 | block | 商品来源信息以商家公示为准 |
| 永不损坏 | 性能绝对化 | block | 按说明正常使用 |
| 七天无理由一律不退 | 售后规则冲突 | block | 按适用规则说明退货条件 |

词项式校验可以落入现有配置，结论为**能表达基础阻断词**；但它不能理解价格
比较证据、类目例外和上下文条件，不能替代人工合规审核。

### Skill 预设

| Skill | 电商内容目标 | 当前配置是否可承载 |
|---|---|---|
| 朋友圈日更 | 单品卖点、上新、活动、补货信息 | 可以；`systemInstruction` 与 `contentTypes` 都是配置 |
| 会员触达 | 首购、复购、会员日、补货提醒话术 | 可以；继续遵守零 PII 占位符模式 |
| 社群运营 | 新品预告、选购指南、售后说明 | 可以 |
| 小红书图文 | 规格讲解、使用教程、场景种草 | 可以 |

当前 Skill runtime 按商家的 `verticalPackId` 取预设并注入 Offering，不按垂类
写分支。纸面上可以替换为电商指令，结论为**机制成立**。但仓库当前只注册
`beauty-v1`，所以这不是运行态验收。

## 能表达与不能表达

| 能力 | 结论 | 证据或限制 |
|---|---|---|
| 单 SKU 编码、名称、说明 | 能表达 | 固定字段 + text |
| 单 SKU 的一组规格 | 降级表达 | textarea 可读，不可按规格项查询 |
| 稳定卖点、使用说明 | 能表达 | textarea |
| 单一日常价 + 币种 | 能表达 | number + select；无跨字段校验 |
| 限时促销 | 能表达 | 应映射到活动，不写入 Offering |
| 粗粒度可售状态 | 能表达 | select |
| 库存数量快照 | 降级表达 | 无来源、刷新和过期语义 |
| 实时多仓库存 | 不能表达 | 需要库存系统及按仓数据结构 |
| 单一发货时限 | 能表达 | number |
| 区域 × 运费 × 时效矩阵 | 不能可靠表达 | 当前无嵌套或重复组字段 |
| 售后说明文本 | 降级表达 | 可供人和模型阅读，不能校验条件组合 |
| 商品族包含多个 SKU | 不能作为一个 Offering 表达 | 必须拆成多个 Offering；分组仅为字符串 |
| SKU 唯一性 | 不能保证 | `fieldValues.sku` 没有数据库唯一约束 |
| 预售时强制填写到货日期 | 不能表达 | 当前字段模板无条件必填 / 跨字段规则 |
| 价格、库存、发货承诺的时效 | 不能保证 | 没有 `source/observedAt/validUntil` 机制和外部同步 |

## 风险登记

| 风险 | 等级 | 触发方式 | 影响 | 当前控制 / 建议 |
|---|---|---|---|---|
| 过期价格或库存被写成确定事实 | 高 | 人工快照长期未更新，Skill 仍全量注入 | 错价、超卖式文案或履约投诉 | 现阶段生成前人工确认；运行态接入前增加新鲜度与过期阻断 |
| 一个 Offering 混入多个 SKU | 高 | 沿用“产品”粒度，把多个规格价格放进同一 textarea | 文案串用价格、规格和素材 | 术语与 ADR 已明确一个 Offering = 一个 SKU / 变体 |
| 配送与售后文本不可自动判定 | 高 | 区域、类目和商品状态条件被压成自然语言 | 规则遗漏或不当承诺 | 强制人工复核；后续增加重复组与条件规则 |
| SKU 或商品族编码冲突 | 中 | `fieldValues` 无唯一约束或引用完整性 | 素材错绑、更新错对象 | 接入时在校验层增加唯一性；达到重审条件再提升为核心关系 |
| 违禁词表只做字面匹配 | 中 | 违规含义未命中固定词项，或合法语句误报 | 合规漏检 / 误拦截 | 保留人工审核，词表不作为最终法律判断 |
| 商家切换垂类包后旧值失去语义 | 中 | 修改商家级 `vertical_pack_id`，历史 Offering 未迁移 | 字段丢失、完善度和 Skill 上下文错误 | 当前不支持静默切换；多包或迁移成为真实需求时重审 ADR |

## 缺陷与后续门槛

### 已在文档层修正

1. **Offering 粒度含混**：原术语把电商 Offering 写成“SKU / 产品”，容易让
   一个 Offering 同时包含多个变体。本次明确为一个可独立售卖的 SKU / 变体。
2. **知识库与运营系统边界未写清**：本次明确价格、库存、发货承诺只能作为
   人工确认快照；限时权益归活动，实时事实以外部交易系统为准。

### 上线电商垂类包前需完成

以下是垂类字段契约的缺口，不要求在 Issue #12 中写产品代码：

1. 增加可重复键值规格或对象列表，避免把所有规格压成不可校验的 textarea。
2. 增加 `dateTime` 及条件校验，例如预售时必须填写预计可售时间。
3. 为动态字段增加来源与新鲜度语义，至少能表示 `observedAt/validUntil`，
   并在过期时禁止 Skill 把库存、价格或发货时效写成确定性承诺。
4. 明确 SKU 唯一性和商品族关系的校验层。若未来需要按商品族批量更新、查询或
   维护引用完整性，再评估是否把关系提升为核心字段；现在不因此新建电商 schema。
5. 电商包投入运行时，需补充配置加载测试、字段校验测试和至少两个不同规格 SKU
   的端到端 Skill 注入测试。

### 非本抽象应承担的能力

- 实时库存、多仓可售量和库存扣减。
- 订单、退款、逆向物流和实际发货状态。
- 渠道价格同步、自动上下架和履约承诺计算。
- 法律或平台规则的自动最终判定。

这些能力未来应由交易、库存、履约或规则来源提供，Offering 只消费经确认的
营销事实。把它们继续堆入 `fieldValues` 会让“能保存 JSON”被误判为“具备业务
能力”。

## 验证记录

2026-07-30 在 Issue #12 工作区执行：

- `gh issue view 12 --comments --json ...`：Issue 为 OPEN、标签为
  `ready-for-agent`、评论为空；前置 Issue #3 已关闭。
- 相对 Markdown 链接检查：本报告、ADR-0001 与 CONTEXT.md 中的仓库内链接
  全部存在。
- `pnpm lint`：通过。
- `pnpm --filter @marketing-ai/vertical-packs test`：1 个测试文件、3 个测试
  全部通过。
- `pnpm --filter @marketing-ai/vertical-packs typecheck`：通过。
- `git diff --check`：通过。

这些验证证明现有标量字段机制和文档引用未被本次修改破坏；由于本 Issue 明确
只产出文档，未创建 `ecommerce-v1` 运行态配置，因此不把上述结果表述为电商包
端到端测试通过。

## 最终判定

| 问题 | 判定 |
|---|---|
| 固定 Offering 核心实体是否需要为电商拆表？ | 否 |
| 垂类包能否驱动电商标量字段表单、校验和 Skill 注入？ | 能 |
| 当前字段模板能否完整承载商品族、实时库存、复杂配送与售后规则？ | 不能 |
| 是否接受 ADR-0001？ | 有条件继续接受，并补充粒度、事实边界和重审触发条件 |
| Issue #12 的文档验收是否满足？ | 满足：已给出模板、样例映射、能 / 不能表达、证据、风险和明确结论 |
