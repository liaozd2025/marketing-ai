# ADR-0005: 技术栈为 TypeScript 全栈 monorepo

日期：2026-07-29 · 状态：已接受

## 背景

产品是面向国内商家的多租户 Web 平台，含 agent 编排（Skill、多模型路由、异步任务）与模板合成配图。开发主体为独立开发者，迭代速度优先。备选：Python 后端 + React 前端（双栈维护成本）、低代码/BaaS（多租户与编排自由度受限）。

## 决策

- **Next.js**（前端 + API）+ **PostgreSQL/pgvector**（多租户数据 + 向量，见 ADR-0004）。
- **TS agent 服务层**：Skill 编排、多模型路由与降级（国内模型主力，provider 抽象可切换）、异步任务队列。
- 模板合成用 HTML 模板 + headless 渲染，复用前端组件体系（见 ADR-0002）。
- 部署国内云（阿里云/腾讯云），保证商家侧访问与合规。

## 后果

- 单语言单仓库，卡片/封面模板与产品 UI 共享组件。
- 模型 provider、图像 provider、embedding provider 都必须走抽象层，不与具体厂商耦合。
