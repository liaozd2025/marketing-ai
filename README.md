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
