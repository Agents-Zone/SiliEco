# 参考项目

该目录用于存放 Silieco 产品与工程设计的外部参考项目。

第三方源码仅用于本地研究，不进入 Silieco 主仓库历史。可沉淀产品判断、架构结论与 ADR，但不得在未确认许可证兼容性的情况下直接复制实现。

## Multica

- 上游仓库：<https://github.com/multica-ai/multica>
- 本地路径：`references/multica`
- 参考版本：`e395fb874`
- 定位：面向小团队的 AI-native 任务管理平台，将 Coding Agent 作为一等任务负责人
- 技术栈：Go、PostgreSQL、Next.js、Electron、React Native、pnpm workspace
- 许可证：Modified Apache 2.0，包含托管、嵌入式商业分发及前端品牌方面的额外限制

更新本地参考代码：

```bash
git -C references/multica fetch --prune
git -C references/multica pull --ff-only
```

## 对 Silieco 的参考价值

### 1. 控制面与本地执行面分离

Multica 的服务端负责 Workspace、Issue、Agent、Runtime、队列和实时状态；本地 daemon 自动发现 Coding Agent CLI、认领任务并回传结果。

这验证了 Silieco 的基础部署判断：

```text
Workspace / Control Plane
          ↓ dispatch
Local Node / daemon
          ↓ adapter
Existing Agent CLI
```

建议借鉴边界，而非直接照搬实现。Silieco Node 仍应拥有独立领域内核、本地存储、策略执行、Approval 和离线恢复能力。

### 2. Agent 作为一等组织成员

Multica 使用多态 actor / assignee 设计，让人和 Agent 都可以创建 Issue、发表评论、被分配工作并进入 Activity 时间线。

Silieco 应继续向前推进：

- 人和 Agent 都建模为 `Principal`；
- 组织身份与某个模型或 Runtime 解耦；
- Agent 必须有 owner、role、capability、permission 和 accountability；
- 每个动作保留发起者、授权者、执行者与验收者。

### 3. Task、Run 与 Attempt 必须尽早分离

Multica 的产品 `Issue` 是工作目标，`agent_task_queue` 是一次 Agent 执行。随着恢复、重试、会话续接和多入口接入，队列表逐渐承载了 attempt、lease、session、workdir、result、error 等大量职责。

Silieco 第一版应直接区分：

```text
Intent
  └── Task                # 稳定的工作目标、责任、依赖与验收条件
      └── Run             # 某个执行器的一次逻辑运行
          └── Attempt     # 调度、重试、租约与故障恢复单元
              └── Event   # 只追加的结构化过程记录
```

这样可以避免把“任务状态”“Agent 会话”和“队列投递状态”压进同一张表。

### 4. 任务认领与恢复机制

Multica 已覆盖许多真实分布式执行问题：

- 使用 `FOR UPDATE SKIP LOCKED` 原子认领；
- `queued → dispatched → running → terminal` 状态迁移；
- dispatch prepare lease；
- runtime heartbeat 与离线 sweeper；
- 丢失响应后的 stale dispatch reclaim；
- per-agent / per-issue 串行化；
- attempt、max attempts、failure reason；
- session 与 workdir 恢复；
- daemon 重启后的 orphan 处理；
- 本地目录锁与等待状态；
- WS-first 唤醒与 HTTP/poll fallback。

Silieco 应把这些场景写成状态机 contract tests，再选择具体数据库和传输实现。

特别要补强：

- lease 必须搭配 fencing token，防止旧执行者在失去租约后继续写入；
- command 必须有 idempotency key；
- Run Event 应采用只追加语义；
- Node 离线时需要 durable outbox；
- Approval 要绑定动作摘要、风险级别和失效时间。

### 5. Runtime Adapter

Multica daemon 对多种 Agent CLI 做自动发现、命令构建、环境隔离、MCP 配置、session 恢复、输出解析和 watchdog。

Silieco 可参考其工程问题清单，但应建立稳定的 Adapter Contract：

```text
probe
prepare
start
stream
requestApproval
cancel
resume
collectArtifacts
cleanup
```

Adapter 输出必须转换为统一 `RunEvent`，Workspace 不应理解 Codex、Claude Code 或其他 CLI 的私有事件。

### 6. Web 与 Desktop 共享层

Multica 的前端 monorepo 将职责拆为：

- `packages/core`：API client、React Query hooks、Zustand client state；
- `packages/ui`：无业务逻辑的原子组件；
- `packages/views`：Web 与 Desktop 共用业务页面；
- `apps/web` / `apps/desktop`：平台接线与平台特有能力。

这个依赖方向适合 Silieco Workspace：

```text
apps → views → core + ui
```

需要坚持 server state 与 client state 分离，并把平台 API 限制在 adapter / platform 层。

### 7. 可观测性和可运营性

Multica 已将队列等待时间、任务状态、runtime heartbeat、usage 和 daemon WebSocket 纳入指标，并为 CLI、daemon 日志、健康状态、自托管和升级提供完整入口。

Silieco 从第一个纵向切片开始就应提供：

- Task / Run / Attempt 状态与耗时；
- runtime 在线状态、心跳年龄与容量；
- token、成本和工具调用统计；
-失败分类、重试原因与恢复结果；
- Approval 等待时间；
- Artifact / Evidence 完整率；
- 本地 daemon health、logs 和 kill switch。

## 不直接照搬的部分

- **产品边界**：Multica 主要围绕 Coding Agent + Issue 管理，Silieco 面向更广泛的浏览器、应用、IM、知识和组织治理。
- **领域模型**：不要复制 `Issue + agent_task_queue` 的历史包袱，应先固定 Task / Run / Attempt / Event。
- **数据库策略**：Multica 当前约定“不新增外键”，但早期迁移大量使用外键。Silieco 应依据自身一致性、离线与同步模型独立决策。
- **权限体系**：Workspace role 不足以覆盖 Agent capability、数据分级、关系授权、临时批准和动作级策略。
- **通讯模型**：Silieco 应让 IM、Chat、CLI 和浏览器成为同一 Task 的入口与投影，而非各自形成状态源。
- **代码与视觉资产**：许可证带商业限制；除非另行取得许可，不直接复制 substantial source、前端或品牌资产。

## 建议转化为 Silieco 工程件

1. `ADR-001-product-boundary.md`
2. `task.schema.json`
3. `run.schema.json`
4. `attempt.schema.json`
5. `event.schema.json`
6. Task / Run / Attempt 状态机图
7. claim、lease、fencing、retry、cancel、resume contract tests
8. Runtime Adapter trait
9. daemon threat model
10. local-first sync 与 durable outbox 设计

