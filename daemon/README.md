# Silieco Daemon

Daemon 是 Silieco 的独立产品边界，运行在用户掌控的机器上，负责把本地 Agent CLI
接入 Core。它不保存团队的权威业务状态；Space、Project、Workflow、Stage、Task 与
Chat 的真实状态统一由 Core 管理。

## 当前职责

- 自动发现 Claude Code、Codex 等本地 Agent CLI；
- 注册 Runtime 并维护 WebSocket 心跳；
- 认领 Core 中已排队的 Agent Task；
- 准备仓库、工作目录、Skills、MCP 和环境变量；
- 启动和监督 Agent 子进程；
- 流式上报消息、工具调用、用量、错误和最终状态；
- 处理取消、恢复、重试、超时与本地垃圾回收；
- 为 Desktop 提供内置 CLI/Daemon 运行能力。

## 当前可运行实现

当前没有第二套独立的 Rust Daemon。生产行为基线仍位于 Go module：

- `../core/cmd/silieco`：CLI / daemon 入口；
- `../core/internal/daemon`：supervisor 与任务循环；
- `../core/internal/daemon/execenv`：Agent CLI 和执行环境适配；
- `../core/pkg/protocol`：Core ↔ Daemon 消息协议；
- `../apps/desktop/scripts/bundle-cli.mjs`：Desktop 开发与打包时嵌入 CLI。

从源码运行：

```bash
make daemon
```

也可以直接使用：

```bash
make silieco ARGS="daemon start --foreground"
```

## Rust 迁移边界

这个目录预留为未来独立 Rust Daemon 的顶层项目边界。开始实现前必须先把 Go 协议
固化为 JSON Schema、共享 fixtures 和跨语言契约测试；只有达到任务认领、心跳、
流式事件、取消、恢复与状态流转等价后，Desktop 才能从 Go 二进制切换到 Rust
二进制。详细门槛见 [`../docs/architecture/RUST-MIGRATION.md`](../docs/architecture/RUST-MIGRATION.md)。
