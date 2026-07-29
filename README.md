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

需要验证真实的迁移、租户隔离、队列领取、provider 降级留痕和续聊时，可使用
独立测试数据库：

```bash
DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5434/marketing_ai pnpm db:migrate
TEST_DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5434/marketing_ai pnpm --filter @marketing-ai/database test
```

## Agent 服务

`packages/agent-service` 定义 text、image、embedding 三类 provider 契约。
默认主路由是阿里云百炼兼容接口，备选路由是可独立配置地址、密钥和模型的
OpenAI-compatible provider。三类路由均可分别用
`AGENT_*_PROVIDER_ORDER` 调整顺序。开发环境在真实 provider 未配置时会降级到
确定性 provider，方便在没有外部密钥时验证完整链路；生产环境默认禁止测试
provider，除非显式设置 `AGENT_ALLOW_TEST_PROVIDERS=true`。

每次 provider 调用都写入 `provider_attempts`，包含 provider、路由位置、任务
执行轮次、成功/失败和错误。全部 provider 失败时，仅有可重试错误才按指数退避
重新排队；最多执行 `max_attempts` 次，配置错误和无效响应直接进入 `failed`。
worker 异常退出留下的 lease 会在后续 worker 启动时恢复。

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

## Workspace

- `apps/web`：Next.js Web 与服务端 Action
- `packages/database`：迁移、身份数据访问和强制租户隔离的数据层
- `packages/agent-service`：provider 契约、真实/测试 adapter 和路由降级
- `packages/agent-worker`：独立任务领取、模型执行、重试和结果持久化
- `packages/vertical-packs`：可版本化垂类包配置、加载与 Offering 字段校验

## 知识库与垂类包

登录后从 `/workspace/knowledge-base` 进入「我的资料」。界面录入的仍是
ADR-0001 定义的六类结构化知识库实体，而不是文件夹式文档库：

- 品牌档案、Offering、客群、活动、会员分层、素材均支持创建/读取/更新/删除
- 所有服务端 Action 只从签名会话取得商家 ID，再进入租户绑定的数据层
- 会员分层只存分层定义与触达场景，不包含会员个人记录或个人信息字段
- 素材上传接受图片/视频（单文件 20 MB），默认存入 Web 进程工作目录下的
  `.data/assets`；生产环境应通过 `ASSET_STORAGE_DIR` 指向持久化卷
- 素材原文件只能通过带签名会话的
  `/api/knowledge-base/assets/:id/file` 读取，并再次执行租户隔离查询

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

## PostgreSQL 集成验证

数据库集成测试默认跳过；先对测试数据库执行迁移，再提供
`TEST_DATABASE_URL` 即可运行真实六实体 CRUD 和双租户隔离验证：

```bash
DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5433/marketing_ai pnpm db:migrate
TEST_DATABASE_URL=postgresql://marketing_ai:marketing_ai@localhost:5433/marketing_ai \
  pnpm --filter @marketing-ai/database test
```
