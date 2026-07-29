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
执行数据库迁移，然后在 <http://localhost:3000> 启动 Next.js。

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

## Workspace

- `apps/web`：Next.js Web 与服务端 Action
- `packages/database`：迁移、身份数据访问和强制租户隔离的数据层
