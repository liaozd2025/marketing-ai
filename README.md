# Marketing AI

私域内容营销多租户 SaaS。技术基线遵循 ADR-0004/0005：TypeScript
monorepo、Next.js、PostgreSQL/pgvector。

## 本地开发

前置依赖：Node.js 24、pnpm 10、Docker。

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev
```

`pnpm dev` 是开发环境的单一入口：它会启动并等待 pgvector 数据库、
执行数据库迁移，然后并行启动 Next.js 和独立 Agent worker。HTTP 进程只提交
任务，模型调用始终在 worker 中执行。

首次运行前请把 `apps/web/.env.local` 中的 `SESSION_SECRET` 换成至少 32 字符的随机值。
本地开发未设置时会使用仅限开发环境的默认密钥；生产环境不会接受该默认值。

停止本地基础设施：

```bash
pnpm dev:down
```

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

需要验证真实的迁移、租户隔离、队列领取、provider 降级留痕、素材多模态
索引和续聊时，可使用独立测试数据库：

```bash
DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5434/marketing_ai pnpm db:migrate
TEST_DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5434/marketing_ai pnpm --filter @marketing-ai/database test
TEST_DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5434/marketing_ai pnpm --filter @marketing-ai/agent-worker test
```

## Agent 服务

`packages/agent-service` 定义 text、image、embedding 三类 provider 契约。
text/image 默认主路由是阿里云百炼兼容接口；embedding 的主路由使用百炼
原生多模态接口和 `qwen3-vl-embedding`，可同时接受文本或真实图像字节。
备选路由是可独立配置地址、密钥和模型的 OpenAI-compatible provider。
三类路由均可分别用
`AGENT_*_PROVIDER_ORDER` 调整顺序。开发环境在真实 provider 未配置时会降级到
确定性 provider，方便在没有外部密钥时验证完整链路；生产环境默认禁止测试
provider，除非显式设置 `AGENT_ALLOW_TEST_PROVIDERS=true`。

每次 provider 调用都写入 `provider_attempts`，包含 provider、路由位置、任务
执行轮次、成功/失败和错误。全部 provider 失败时，仅有可重试错误才按指数退避
重新排队；最多执行 `max_attempts` 次，配置错误和无效响应直接进入 `failed`。
worker 异常退出留下的 lease 会在后续 worker 启动时恢复。

素材与查询向量固定为 **1536 维**，对应 PostgreSQL
`knowledge_item_embeddings.embedding vector(1536)`。worker 和数据层会拒绝
维度不符或包含非有限数值的 provider 响应，避免索引混入不兼容向量。
OpenAI-compatible embedding adapter 只处理文本，不会把文件名或标签当作图像
embedding；图像索引使用真实二进制内容转成 DashScope data URI。
请求结构与维度选择参考
[百炼多模态 Embedding API](https://help.aliyun.com/zh/model-studio/multimodal-embedding-api-reference)。
自行替换 secondary embedding 模型时，该模型也必须支持 1536 维输出。
每个向量还记录 `embedding_space`（adapter + model + 维度）；检索只比较同一
space 的查询与素材，provider 降级不会把不同模型空间的同维向量错误混排。

### API

所有 API 都从 `marketing_ai_session` 签名 cookie 获取 member 和商家身份，不
接受请求体自报 `merchant_id`、`merchantId` 或 `tenant_id`。

提交任务（只持久化并返回，不调用模型）：

```http
POST /api/agent/tasks
Content-Type: application/json

{"capability":"text","prompt":"写一条朋友圈"}
```

返回 `202`：

```json
{
  "task_id": "uuid",
  "conversation_id": "uuid",
  "status": "queued"
}
```

三类提交体分别是：

- text：`{"capability":"text","prompt":"..."}`；续聊时增加
  `"conversation_id":"uuid"`。
- image：`{"capability":"image","prompt":"..."}`。
- embedding：`{"capability":"embedding","texts":["..."]}`。

轮询任务与读取会话：

```http
GET /api/agent/tasks/{task_id}
GET /api/agent/conversations/{conversation_id}
```

任务状态为 `queued | running | succeeded | failed`。任务查询同时返回 result、
错误和 provider 尝试链；会话查询按顺序返回 user/assistant 消息。
同一会话已有 `queued` 或 `running` 任务时，新的续聊提交返回
`409 conversation_busy`，避免并发轮次污染上下文。

worker 也可以单独运行：

```bash
pnpm worker
# 只领取一次，适合脚本和验收
pnpm worker:once
```

### 配置驱动的内容 Skill

登录后进入 `/workspace/content/new`，可在同一个内容工作台切换「朋友圈日更」
与「社群运营」。入口以知识库上下文 chips 和一个可选意图输入框为主；朋友圈
一次生成「人设 / 种草 / 活动」，社群一次生成「群公告 / 活动预热 /
专业知识分享」。HTTP 仅把 Skill run 写入 `agent_tasks` 并返回 `202`：

```http
POST /api/skills/daily-moments/runs
Content-Type: application/json

{
  "action": "generate",
  "intent": "今天下雨，语气松弛一点",
  "selected_knowledge_types": ["brandProfile", "offering", "asset"]
}
```

社群运营使用完全相同的提交、任务轮询、worker runtime、provider 和合规路径，
只把 URL 中的 Skill id 改为配置在垂类包中的 `community`：

```http
POST /api/skills/community/runs
Content-Type: application/json

{
  "action": "generate",
  "intent": "准备今天的社群内容",
  "selected_knowledge_types": ["brandProfile", "offering", "audience", "campaign"]
}
```

`selected_knowledge_types` 只表达本次创作的强调项。worker 仍按 ADR-0004 从
任务所属租户加载并全量注入品牌档案、Offering、客群、活动、会员分层，素材则
按场景和 Offering 标签匹配。页面用通用任务 API
`GET /api/agent/tasks/{task_id}` 轮询，完成后展示三条预览、发布就绪汇总和选图
建议。

每条卡片的「聊着改」和「一键合规改写」也通过同一 Skill run API 提交
`refine` / `compliance_rewrite` 动作并由 worker 异步执行，不在 HTTP 或
Server Action 内同步调用模型。生成结果必须通过
`packages/compliance` 的垂类无关校验器；worker 使用当前垂类包词表逐项记录
命中位置、类别、级别和替换建议。任一命中都会令 `blocked=true` 且
`publishReady=false`，Web 同时禁用复制。

provider 只返回 `marketing-ai.skill-output.v1` 原始 JSON。严格协议解析、
素材匹配、合规校验和最终 `marketing-ai.skill-result.v1` 组装均在 worker
完成，因此切换真实 OpenAI-compatible provider 不改变结果边界。开发环境的
确定性 provider 会根据知识库生成完整示例内容，不把 prompt 回显成可发布结果。

## Workspace

- `apps/web`：Next.js Web 与服务端 Action
- `packages/database`：迁移、身份数据访问和强制租户隔离的数据层
- `packages/asset-storage`：Web 与 worker 共用的租户文件存储边界
- `packages/agent-service`：provider 契约、真实/测试 adapter 和路由降级
- `packages/agent-worker`：独立任务领取、模型执行、重试和结果持久化
- `packages/content-skills`：配置驱动的 Skill prompt/输出协议、素材匹配和结果组装
- `packages/compliance`：独立、纯函数式、垂类无硬编码的合规校验器
- `packages/vertical-packs`：可版本化垂类包配置、加载与 Offering 字段校验
- `packages/template-composition`：模板 schema、registry 与 Web/出图共享的
  React 模板组件
- `packages/html-renderer`：真实 headless Chromium HTML→PNG 渲染器

## 知识库与垂类包

登录后从 `/workspace/knowledge-base` 进入「我的资料」。界面录入的仍是
ADR-0001 定义的六类结构化知识库实体，而不是文件夹式文档库：

- 品牌档案、Offering、客群、活动、会员分层、素材均支持创建/读取/更新/删除
- 所有服务端 Action 只从签名会话取得商家 ID，再进入租户绑定的数据层
- 会员分层只存分层定义与触达场景，不包含会员个人记录或个人信息字段
- 素材上传接受图片/视频（单文件 20 MB），默认存入仓库级
  `.data/assets`，确保 Web 与 worker 读取同一目录；生产环境应通过
  `ASSET_STORAGE_DIR` 指向二者共享的持久化卷
- 素材原文件只能通过带签名会话的
  `/api/knowledge-base/assets/:id/file` 读取，并再次执行租户隔离查询
- 图片上传后只在 HTTP 请求内创建素材与 `queued` 索引任务；独立 worker
  读取真实文件、调用多模态 embedding provider，并在同一事务内写入 pgvector、
  完成任务和更新素材 `indexing_status`。失败会保留错误并支持重试；本地视频
  当前会以可观察的失败状态结束（百炼视频 embedding 仅支持公网 URL）
- 「素材」页支持自然语言语义检索，并可同时按场景与 Offering 筛选。搜索同样
  先返回 `202` 任务，再由页面轮询结果，HTTP 请求不等待 embedding 慢调用

素材检索 API：

```http
POST /api/knowledge-base/assets/search
Content-Type: application/json

{"query":"适合秋季护肤氛围的图","scene":"护理记录","offering_id":null,"limit":12}
```

返回 `202` 后轮询：

```http
GET /api/knowledge-base/assets/search/{task_id}
GET /api/knowledge-base/assets/{asset_id}/indexing
```

检索 SQL 在 embedding 与 asset 两侧都绑定签名会话中的 `merchant_id`，再应用
`scene` / `offering_id` filter 和 pgvector cosine 相似度排序。

美业 v1 配置位于
`packages/vertical-packs/config/beauty-v1.json`，包含 Offering 字段模板、
场景词表、可维护违禁词表和四个 Skill 预设。Offering 的服务端校验和 UI
表单读取同一份 `offeringFields` 配置；调整配置即可调整表单，不需要加入
垂类判断分支。

当前商家的垂类包可从已鉴权 API 读取：

```text
GET /api/vertical-pack
GET /api/knowledge-base/summary
```

第二个接口返回六类实体的记录数与完善度，供后续生成页的知识库上下文面板
使用。

## HTML 模板合成

登录后从 `/workspace/compositions` 进入「模板出图」。首批内置模板：

- `xiaohongshu-cover-3x4`：1080×1440 小红书 3:4 封面
- `moments-copy-card`：1080×1080 朋友圈话术卡片

浏览器预览和服务端出图都调用
`@marketing-ai/template-composition` 的同一个 `CompositionCanvas`，不是两套
排版。新增模板只需添加 React 模板定义并注册尺寸/名称；Chromium 渲染器不包含
模板分支。

服务端输入只接受模板 ID、标题、正文、用途和素材 ID。商家身份、品牌视觉与素材
文件全部来自签名会话绑定的数据层；API 不接受客户端自报租户。素材从租户目录
读出后按 PNG/JPEG/WebP 文件魔数复核，再以内嵌 data URL 交给模板。效果类用途
只接受同时标记为「实拍」和「效果类」的素材。

```http
POST /api/compositions
Content-Type: application/json

{
  "templateId": "xiaohongshu-cover-3x4",
  "assetId": "uuid",
  "headline": "今天，也要好好照顾自己",
  "body": "到店后的松弛感，藏在每一次认真护理里。",
  "usage": "general"
}
```

成功返回 `201` 与生成记录，PNG 从签名会话保护的
`GET /api/compositions/:id/image` 读取。`GET /api/compositions` 返回当前商家
最近生成记录。生成物默认写入 `.data/compositions`；生产环境应设置
`COMPOSITION_STORAGE_DIR` 指向持久化卷。

渲染器禁用页面 JavaScript 和所有外部网络请求。截图前会逐字核对中文 DOM、
实拍图加载状态和文字/画布溢出，截图后再读取 PNG IHDR 验证真实像素尺寸。

本机可显式使用已安装 Chrome：

```bash
CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm renderer:smoke
```

Chromium 沙箱默认开启。只有运行环境已经做了独立容器/进程隔离且无法启动
Chrome 沙箱时，才显式设置 `CHROMIUM_DISABLE_SANDBOX=1`。

没有系统 Chrome 的 CI/服务器先安装 Puppeteer 管理的浏览器，并缓存
`$PUPPETEER_CACHE_DIR`：

```bash
PUPPETEER_CACHE_DIR="$PWD/.cache/puppeteer" pnpm renderer:install-browser
PUPPETEER_CACHE_DIR="$PWD/.cache/puppeteer" pnpm renderer:smoke
```

需要验证完整的签名会话、API 出图和跨租户反证时，先对独立测试库迁移并启动
构建后的 Web，再在相同的 `DATABASE_URL`、`SESSION_SECRET`、素材目录与生成物
目录环境下运行：

```bash
COMPOSITION_VERIFY_BASE_URL=http://127.0.0.1:3019 \
  COMPOSITION_VERIFY_OUTPUT=/tmp/marketing-ai-composition.png \
  pnpm verify:composition-api
```

脚本会验证未登录/篡改会话、请求体租户注入、跨租户素材和跨租户成图读取，并独立
读取 PNG IHDR 核对尺寸；临时生成记录和文件会在结束时清理。

部署边界：模板预览可以运行在任意 Next.js Web 节点；`POST /api/compositions`
必须运行在 Node.js runtime，镜像内需有兼容 Chromium、中文系统字体、可写且持久
的素材/生成物目录。当前 MVP 由 API 节点同步启动 Chromium；扩容时可把
`@marketing-ai/html-renderer` 原样移入独立任务 worker，模板契约无需变化。

## PostgreSQL 集成验证

数据库集成测试默认跳过；先对测试数据库执行迁移，再提供
`TEST_DATABASE_URL` 即可运行真实六实体 CRUD、双租户隔离、朋友圈和社群共享的
`知识库 → queued → worker → 合规 → 结构化预览` tracer bullet、会员触达
零 PII 矩阵，以及「真实图片落盘 → worker → pgvector → 中文语义检索」验证：

```bash
DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5436/marketing_ai pnpm db:migrate
TEST_DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5436/marketing_ai \
  pnpm --filter @marketing-ai/database --filter @marketing-ai/agent-worker test
```

若 Web 已在 `3105` 端口连接同一测试库运行，可再验证真实签名 cookie、
朋友圈/社群共享 provider 与结果协议、HTTP 202、轮询、跨租户 404、违规阻断
和异步合规改写：

```bash
DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5436/marketing_ai \
SESSION_SECRET=replace-with-the-same-web-secret \
ACCEPTANCE_BASE_URL=http://localhost:3105 \
pnpm --filter @marketing-ai/agent-worker acceptance:http
```
