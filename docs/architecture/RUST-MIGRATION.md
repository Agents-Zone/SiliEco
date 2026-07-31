# Go → Rust 迁移决策

状态：Accepted（尚未开始生产切换）
更新日期：2026-07-31

## 结论

Silieco 的 Core Service 和 daemon 都可以迁移到 Rust，但不应一次性重写。

当前 Go 实现接近一千个 Go 文件，包含两百多个 HTTP handler、数百个 PostgreSQL
migration、sqlc 生成的数据访问层、WebSocket 控制面、十余种 Agent CLI 适配器，
以及 GitHub、Slack、Lark、S3、Redis、邮件和指标集成。语言不是主要风险，真正的
风险是同时改变 API、实时协议、Task 状态机、Workflow/Stage 语义和数据库行为。

采用渐进替换：

1. 先完成 Silieco 命名域迁移并保留 Go 行为基线；
2. 冻结 Core ↔ daemon 协议与 API compatibility tests；
3. 先迁 daemon，再迁 Core Service 的低耦合边缘模块；
4. 最后迁任务编排、聊天、autopilot 等写密集领域；
5. 每个 Rust 模块通过同库双实现对照、契约测试和流量切换验收。

## 为什么先迁 daemon

daemon 最能直接受益于 Rust：

- Tokio 适合 WebSocket、心跳、并发任务和流式 stdout/stderr；
- 所有权模型能减少进程句柄、临时目录和取消流程的生命周期错误；
- 单二进制、较低常驻内存和跨平台分发适合 Desktop 捆绑；
- 对工作目录、环境变量、凭据和子进程权限的边界更容易收紧；
- daemon 主要通过协议访问 Core，数据库耦合低于服务端 handler。

daemon 的 Rust 目标栈：

| 能力 | Rust 选择 |
| --- | --- |
| 异步运行时 | Tokio |
| CLI | Clap |
| HTTP / WebSocket | Reqwest + tokio-tungstenite |
| 序列化 | Serde |
| 日志与诊断 | tracing |
| Secret | secrecy + zeroize |
| 本地配置 | TOML + serde |
| 进程管理 | tokio::process |

## Core Service 的 Rust 可行性

Core Service 也适合 Rust，推荐 Axum + Tower + SQLx：

- Chi middleware 可对应 Tower layers；
- pgx/sqlc 查询可逐条迁为 SQLx checked queries；
- gorilla/websocket 可由 Axum WebSocket 或 tokio-tungstenite 替代；
- Redis、S3、JWT、Prometheus 和 cron 都有成熟 crate；
- migration 文件保持 PostgreSQL SQL，不重写数据库历史。

不建议直接用 ORM 重塑 schema。现有查询包含锁、并发认领、幂等和状态机语义，
SQLx 更接近 sqlc 的显式 SQL 模型，也更容易逐条核对。

## 必须先冻结的协议

Rust 实现开始前，以下内容必须有机器可读 schema 和 golden tests：

- REST request/response 与错误 envelope；
- `X-Silieco-*` header；
- Core ↔ daemon WebSocket message 和 RPC method；
- runtime 注册、心跳、认领、取消、恢复和终态事件；
- Task 生命周期迁移（兼容协议仍使用 `issue` 标识）；
- Workflow Definition、Version、Run、Stage 与 Gate 决策；
- Space 群聊参与者、`@Agent` 触发和共享上下文；
- session resume、rollout 缺失与重试分类；
- Desktop 调用 CLI 的 JSON 输出；
- 配置文件、profile、health port 和本地目录布局。

`core/pkg/protocol` 是当前协议实现的起点，但 Go struct 本身还不是语言无关契约。
下一步应从这些类型生成 JSON Schema，并由 Go/Rust 同时消费相同 fixtures。

## 迁移顺序

### Phase 0：行为基线（当前阶段）

- 完成全仓 Silieco 命名；
- 保持现有 migration 与 API 行为；
- 让 Core、daemon、App 全量检查重新通过；
- 禁止继续引入旧命名。

### Phase 1：Rust daemon

- 配置、profile、status/logs；
- Agent CLI discovery；
- WebSocket 连接、注册和心跳；
- 单任务执行、取消和输出流；
- session resume、垃圾回收、自动更新；
- Desktop 改为捆绑 Rust 二进制。

切换条件：同一套 daemon contract tests 在 Go 和 Rust 上通过，Desktop smoke test
覆盖启动、停止、重启、掉线恢复和升级。

### Phase 2：Rust Core 边缘模块

- health、metrics、静态配置；
- auth token 校验和只读 endpoint；
- daemon WebSocket gateway；
- object storage 与 webhook ingress。

Go 与 Rust 可在反向代理后按 endpoint 分流，共用 PostgreSQL 和 Redis。

### Phase 3：Rust 领域写路径

- Space / member / Project；
- Workflow / Stage / Gate；
- Task / comment / attachment（兼容表名仍为 `issue`）；
- runtime / task queue；
- direct chat / Space group chat / integrations；
- autopilot / scheduler。

每个领域迁移完成后删除对应 Go 路径，不做长期双写。

## 数据兼容策略

- PostgreSQL schema 与 migration 序号继续线性演进；
- Rust 不重新创建历史 migration；
- Go/Rust 共享数据库期间只允许一个实现拥有某个写路径；
- 不增加数据库 foreign key 或 cascade，继续由应用事务维护关系；
- 所有新索引继续使用单文件 `CREATE INDEX CONCURRENTLY`；
- 密码 hash、JWT claim、对象 key 和事件 payload 必须保持兼容。

## Go 暂时保留的原因

保留 Go 不是对 Rust 可行性的否定，而是迁移安全网。当前 Go 版本提供：

- 完整功能清单；
- 可回归的 API 和数据库行为；
- 已覆盖的大量单元/集成测试；
- daemon 与多种 Agent CLI 的真实兼容经验；
- 回滚实现。

当 Rust daemon 和分域 Core Service 达到契约等价后，可以逐步移除 Go；在此之前，
直接删除 Go 会失去判断迁移是否正确的唯一基准。
