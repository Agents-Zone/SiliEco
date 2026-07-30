# Silieco

> 让人类、Agent、知识、应用与工作流，在统一任务、统一上下文和统一治理下协作。

Silieco 是一套面向个人、团队与企业的 **Agent Work OS / Organization OS**。

它不以 Chat 为中心，也不试图重新实现所有 Agent Runtime。Silieco 以 **Task Graph** 作为工作事实源，把桌面、Web、终端、浏览器与 IM 中的工作连接起来，让人和 Agent 可以围绕同一项任务持续协作、执行、审批、验收和沉淀知识。

> 当前状态：项目初始化阶段。领域模型、技术边界和首个纵向闭环正在设计中，尚无可发布版本。

## 为什么做 Silieco

现有 Agent 产品大多擅长完成一次对话或一次执行，但真实工作还需要：

- 明确目标、责任人、依赖关系和完成标准；
- 在多个 Agent、人、工具和入口之间连续流转；
- 在高风险动作前获得正确授权；
- 在执行后留下进度、成本、证据、产物和审计记录；
- 把新产生的经验变成下一项工作的可用上下文。

Silieco 要建立的最小工作闭环是：

```text
Intent → Task → Context → Actor + Capability → Action
   ↑                                             ↓
Knowledge ← Decision ← Artifact + Evidence ←────┘
```

## 产品组成

| 产品 | 核心职责 |
| --- | --- |
| **Silico Node** | Local-first 运行节点，承载 daemon、CLI、Runtime Adapter、本地存储、密钥和设备能力 |
| **Silico Workspace** | 桌面与 Web 共用的工作台，统一呈现 Task、Conversation、Artifact、Approval 和 Activity |
| **Silico Control Plane** | 团队与企业控制面，管理组织身份、Agent 编制、任务调度、策略、审计和多节点协作 |

系统由四个稳定内核支撑：

- **Work Kernel**：Intent、Task、Run、依赖、Artifact 与 Evidence；
- **Context Kernel**：项目上下文、组织知识、记忆与上下文路由；
- **Coordination Kernel**：角色、分派、委派、交接、会话与调度；
- **Governance Kernel**：身份、权限、审批、预算、风险与审计。

## 核心原则

- **Task-first**：Chat、IM、CLI 和浏览器是入口，Task 才是共同语言。
- **Task 与 Run 分离**：工作目标不依赖某一次 Agent 执行。
- **Local-first**：代码、Cookie、密钥和敏感执行结果可以只留在本地。
- **Agent 是 Principal**：Agent 拥有身份、岗位、责任人和可审计的行为。
- **Capability 不等于 Permission**：会做某件事，不代表已经获准执行。
- **完成必须有证据**：验收依靠条件、Artifact 和 Evidence，而非执行者自我声明。
- **一个事实源，多种投影**：桌面、Web、CLI、IM 和 MCP 操作同一份任务状态。
- **开放执行生态**：复用成熟模型、Coding Agent、MCP、Skill、CLI、浏览器和通讯平台。

## 第一阶段目标

首个里程碑不是完整 UI，而是跑通一个可靠的本地工作闭环：

1. 通过 CLI 创建一个 Task；
2. Task 被持久化并分派给一个 Runtime Adapter；
3. Agent 执行期间持续产生结构化 Event；
4. 高风险动作进入 Approval，而不是直接执行；
5. 完成后提交 Artifact 与 Evidence；
6. daemon 重启后可以恢复任务，不重复执行；
7. CLI、MCP 或未来的 Workspace 读取到一致状态。

退出标准：

> 同一个 Task 可以被创建、持久化、执行、观察、审批和验收；进程重启后仍可恢复，并保留完整事件链。

## 首批纵向场景

### 研发 Feature

```text
需求进入
  → 拆分 Task 与依赖
  → Coding Agent 在隔离 worktree 中执行
  → 测试与浏览器证据
  → 人工审查
  → 合并、归档并写回知识
```

该场景用于同时验证 Task Graph、Runtime Adapter、Artifact、Evidence、Approval 和知识写回，而不是分别建设一组无法闭环的基础设施。

后续场景：

- 浏览器运营任务：IM 发起、隔离浏览器执行、提交前审批、结果回到原 Task；
- 企业 Agent 入职：岗位定义、能力审批、节点部署、试运行评估与持续审计。

## 技术方向

当前建议技术基线：

- **Rust**：Node、daemon、CLI、领域内核、协议网关与本地安全边界；
- **SQLite**：个人与本地优先阶段的持久化；
- **React + TypeScript + Tauri**：Desktop / Web 共用 Workspace；
- **Axum + PostgreSQL**：团队阶段的 Control Plane；
- **OpenAPI / JSON Schema**：跨语言契约与 SDK 生成；
- **MCP / A2A / Webhook**：外部能力与 Agent 接入协议，不作为内部领域模型。

技术选择可以演进，但不能反向改变 Task、Run、Event、Approval 等核心对象的产品语义。

## 计划中的仓库结构

下面是目标结构，不代表这些模块已经实现：

```text
silieco/
├── Cargo.toml
├── crates/
│   ├── silieco-domain/       # 核心领域模型与状态机
│   ├── silieco-store/        # SQLite / PostgreSQL 持久化
│   ├── silieco-runtime/      # Runtime Adapter 与进程监管
│   ├── silieco-policy/       # 权限、审批与策略执行
│   ├── silieco-protocol/     # API、Event 与协议类型
│   └── silieco-sdk/
├── apps/
│   ├── silieco-cli/
│   ├── siliecod/
│   ├── desktop/
│   ├── web/
│   └── control-plane/
├── adapters/
│   ├── codex/
│   ├── claude-code/
│   └── anyclaw/
├── packs/
│   └── fdd/
├── schemas/
│   ├── task.schema.json
│   ├── event.schema.json
│   └── agent-manifest.schema.json
├── docs/
│   ├── architecture/
│   ├── adr/
│   └── threat-models/
└── tests/
    ├── contracts/
    └── e2e/
```

## 开坑清单

### Phase 0：领域与协议骨架

- [ ] 编写 `ADR-001`，冻结产品边界和三层产品结构；
- [ ] 定义 Task、Run、Attempt、Event、Artifact、Evidence、Approval schema；
- [ ] 定义 Task / Run 状态机及 transition contract tests；
- [ ] 定义 Runtime Adapter、Connector 与 Workflow Pack 契约；
- [ ] 建立 Rust workspace、CLI 和 daemon 最小骨架；
- [ ] 用 SQLite 跑通创建、持久化、执行、重启恢复与事件输出。

### Phase 1：Personal Local-first MVP

- [ ] 接入第一个 Coding Agent Runtime Adapter；
- [ ] 提供 `task create/list/get/watch` CLI；
- [ ] 提供最小 MCP Server；
- [ ] 实现 Approval、Artifact、Evidence、Activity 与 kill switch；
- [ ] 实现 FDD Workflow Pack；
- [ ] 跑通“研发 Feature”端到端场景。

### Phase 2：Workspace 与团队协作

- [ ] 建立 Desktop / Web 共用工作台；
- [ ] 支持 Workspace、Project、Member 与 Agent 协作；
- [ ] 建立多节点 dispatch、lease、heartbeat 和 offline outbox；
- [ ] 接入首个 IM Connector；
- [ ] 建立基础 RBAC、Agent owner、Project scope、预算与审计。

## 开发约定

项目刚刚初始化，工程规范会通过 ADR 和实际纵向场景逐步固定。在此之前：

1. 任何核心模型变更先写清用户价值、边界和迁移影响；
2. 不为不同入口复制 Task 状态机；
3. 新能力必须区分“可以调用”与“允许调用”；
4. Pull Request 应包含验收条件、测试结果和必要证据；
5. 优先完成可运行的纵向切片，避免长期建设孤立基础设施。

## 相关项目

- [Silieco 产品官网与概念设计](https://github.com/auenger/SilicoEco)

## License

许可证尚未确定。在正式添加开源许可证前，本仓库默认保留所有权利。

---

**Silieco = Work + Context + Coordination + Governance**
