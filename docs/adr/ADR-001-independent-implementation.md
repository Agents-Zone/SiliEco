# ADR-001：Silieco 独立实现边界

- 状态：Accepted
- 日期：2026-07-30

## 背景

Silieco 需要快速验证人类与 Agent 围绕同一工作事实源协作的产品闭环。Multica 等同类产品可用于理解用户问题和行业常见能力，但第三方源码具有独立许可证和商业限制。

## 决策

Silieco 采用独立实现：

1. 产品需求以 `协作平台功能清单.md`、Silieco 官网产品定义和本仓 ADR 为事实源；
2. 不复制第三方源码、数据库迁移、UI、文案、图片或品牌资产；
3. `references/` 下的第三方项目仅用于本地研究，不进入 Silieco 构建和发布；
4. 核心领域直接建模为 `Item → Run → Event`，审批和产物为独立实体；
5. 所有参与者统一为 Actor，审计中另行记录业务身份和实际执行主体；
6. MVP 优先完成端到端纵向闭环，不追求功能数量。

## MVP 范围

首个闭环：

```text
创建事项
  → 分配 Specialized Agent
  → 创建 Run
  → 产生实时 Event
  → 风险动作请求 Approval
  → 人批准或拒绝
  → 继续执行
  → 提交 Artifact
  → 进入人工验收
```

明确不包含：

- 真实云主机编排；
- 企业 SSO 和复杂组织权限；
- 第三方 IM Connector；
- 真实 Coding Agent CLI；
- 跨设备离线同步；
- 商业计费。

这些能力将在核心状态机稳定后逐步接入。

## 技术选择

- Node.js 22 内置 HTTP、SSE 与 SQLite：减少 MVP 基础设施依赖；
- React + Vite：构建 Workspace；
- Radix Themes：提供产品界面的可访问组件基础；
- Phosphor Icons：统一图标体系；
- SQLite WAL：验证本地持久化和事务边界；
- SSE：验证服务端事件到多客户端的实时投影。

## 后续迁移

MVP 的 HTTP contract 和领域语义保持实现无关。后续可将 Node API 替换为 Rust/Axum，将本地 SQLite 领域层下沉到 Silieco Node，并增加 PostgreSQL Control Plane。

