# Silieco

Silieco 是一个面向团队的 Agent Work OS：把事项、Agent、本地执行、
审批、产物和人工验收放进同一个可追踪工作流。

当前仓库已经包含一个可运行的 MVP，而不再只是概念骨架：

- Web / Desktop 共用的 Workspace 工作台；
- 最基本的注册、登录和 Cookie Session；
- Item、Run、Event、Approval、Artifact 领域模型；
- SQLite 持久化与 SSE 实时动态；
- Electron Desktop 与本地 Runtime；
- Codex app-server、Claude Code stream-json 适配器；
- Run 认领、租约心跳、协议终态校验与人工验收。

> 当前为开发预览版，不建议用于生产数据。仓库尚未声明开放源代码许可证，
> 默认保留所有权利。

## 核心完成契约

Silieco 不把“CLI 进程退出”当作事项完成：

```text
Runtime 在线并持有 Run 租约
        ↓
Provider 发出可信终态
        ↓
Run reported / Item in_review
        ↓
负责人核对产物与验收条件
        ↓
Run completed / Item done
```

- Codex：使用 `codex app-server --stdio`，执行
  `initialize → thread/start → turn/start`，只认当前 Thread / Turn 的
  `turn/completed`。
- Claude Code：使用 `--output-format stream-json`，要求终态
  `type=result`、`subtype=success`、`is_error=false`。
- Provider 成功只会提交执行报告；负责人验收后，业务事项才正式完成。
- Run 租约过期不会自动重跑，避免重复提交、重复发信等副作用。

详细设计见
[Agent Runtime 生命周期](docs/architecture/AGENT-LIFECYCLE.md)。

## 技术栈

| 模块 | 实现 |
| --- | --- |
| Workspace | React 19、Radix Themes、Vite |
| Desktop | Electron |
| Local Runtime | Node.js、Codex app-server、Claude Code CLI |
| Service | Node.js HTTP、SSE |
| Storage | Node.js 内置 SQLite |
| Auth | scrypt 密码哈希、HttpOnly Cookie Session |

MVP 使用 Node.js 纵向打通产品闭环。未来若需要更强的进程隔离和系统级能力，
可把 Runtime Supervisor 迁移到 Rust，但领域契约保持不变。

## 本地启动

要求：

- Node.js `>= 22.13.0`
- npm `>= 10`
- 可选：已登录的 `codex` 和/或 `claude` CLI

安装并启动 Web + API：

```bash
npm install
npm run dev
```

访问 <http://localhost:5173>。

演示账号：

```text
demo@silieco.local
silieco
```

要连接本地 Agent Runtime，再打开一个终端启动 Desktop：

```bash
npm run dev:desktop
```

在工作台右侧选择 Agent 工作目录并连接。本地 Runtime 会自动发现 Codex 和
Claude Code。

## 常用命令

```bash
npm run dev          # API + Web 开发服务
npm run dev:desktop  # Electron Desktop
npm test             # 领域与 Provider 生命周期测试
npm run check        # 全部模块语法检查和前端构建
npm run build        # 构建 Web
npm start            # 从 API 服务生产构建后的 Web
```

开发数据默认写入 `.data/silieco.db`，已被 Git 忽略。需要重新体验种子数据时，
停止服务后删除这个数据库即可。

## 仓库结构

```text
silieco/
├── apps/
│   ├── api/          # 认证、领域服务、SQLite、SSE、Runtime API
│   ├── desktop/      # Electron 壳与 Runtime IPC
│   ├── runtime/      # Codex / Claude Code 本地执行适配器
│   └── web/          # Web/Desktop 共用 Workspace UI
├── docs/
│   ├── adr/          # 独立实现与架构决策
│   └── architecture/ # 领域模型、生命周期契约
├── references/       # 本地参考项目；源码目录不会进入 Git
└── scripts/          # 开发编排脚本
```

## MVP 工作流

1. 注册或登录 Workspace；
2. 创建 Item，选择 Specialized Agent 与验收条件；
3. 创建 Run，负责人批准本次本地执行范围；
4. Desktop Runtime 原子认领 Run，并持续刷新租约；
5. Codex 或 Claude Code 在用户选择的目录执行；
6. Runtime 上报结构化进度、Session、终态协议证据和 Artifact；
7. Item 进入 `in_review`；
8. 负责人验收后进入 `done`。

## 独立实现边界

Silieco 根据自身产品文档和公开可观察行为独立设计。`references/` 仅用于研究
产品边界、协议行为和兼容性，不复制、翻译或改名第三方受限源码。相关决策见
[ADR-001](docs/adr/ADR-001-independent-implementation.md)。

## 已知 MVP 限制

- 当前只有一个种子 Workspace / Project；
- 注册用户暂时加入同一个演示 Workspace；
- Codex 已使用 app-server，但跨 Run thread resume 尚未接入；
- Claude Code 已保存 Session ID，但跨 Run resume 尚未接入；
- 还没有邮件验证、密码找回、RBAC 和多租户隔离；
- Artifact 当前存入 SQLite，尚未接对象存储或 Git 引用；
- 自动验收 Gate 尚未实现，最终完成由负责人确认。

## 产品资料

- [协作平台功能清单](协作平台功能清单.md)
- [MVP 领域模型](docs/architecture/MVP-DOMAIN.md)
- [Agent Runtime 生命周期](docs/architecture/AGENT-LIFECYCLE.md)
- [Silieco 产品官网](https://github.com/auenger/SilicoEco)

## License

许可证尚未确定。在正式添加许可证前，本仓库默认保留所有权利。
