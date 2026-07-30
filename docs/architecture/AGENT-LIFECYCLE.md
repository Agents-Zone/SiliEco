# Agent Runtime 生命周期与完成判定

## 结论

“进程退出”“Agent 结束一轮”“事项真正完成”是三个不同事实，Silieco
分别记录，任何一层都不能代替后一层。

```text
Runtime 租约仍有效
       │
       ▼
Provider 协议终态 + exit code 0
       │
       ▼
Run reported（待验收）
       │
       ▼
负责人核对产物与验收条件
       │
       ▼
Run completed + Item done
```

## 参考项目审计结论

Multica 的公开实现采用以下思路：

- Claude Code 使用 `stream-json`。只有收到 `type=result` 的终态事件，
  且 `is_error=false`、进程正常退出，才把 Agent Session 判为完成。即使
  CLI 以 0 退出，只要缺少 `result` 也会失败关闭。
- Codex 使用长驻的 app-server JSON-RPC，而不是用子进程退出表示一轮结束。
  Runtime 建立 thread、启动 turn，并只接受当前 thread/turn 的
  `turn/completed`；失败、取消、协议进程提前退出分别处理。
- Daemon 持续上报 Runtime 心跳、任务进度和 Session ID，并使用执行超时、
  语义不活跃超时、工具调用超时和进程树清理保证任务不会无限悬挂。
- 服务端通过原子认领和状态条件更新约束
  `queued → dispatched → running → terminal`，避免两个 Runtime 同时执行。
- Agent Task 的 completed 不会自动把业务 Issue 改为 done。Agent 交付后将
  Issue 推进到 `in_review`；最终 done 由人或外部集成确认。

这些结论只用于定义 Silieco 自己的接口与测试，Silieco 不复用参考项目源码。

## Silieco MVP 契约

### 1. Runtime 存活

桌面 Runtime 定期上报设备和 Provider 能力。Run 被认领后还要单独发送租约
心跳。租约过期表示执行端失联，Run 失败关闭且不自动重放，避免重复副作用。

### 2. Provider Turn 完成

Codex 通过 `codex app-server --stdio` 接入。Runtime 执行
`initialize → thread/start → turn/start`，成功需要：

- 收到 `turn.completed`；
- Provider status 为 `completed`；
- 通知属于当前 Thread / Turn；
- app-server transport 正常清理。

Claude Code 当前通过 `--output-format stream-json` 接入，成功需要：

- 收到 `type=result`；
- `subtype=success` 且 `is_error=false`；
- CLI exit code 为 0。

仅有最终文本、仅有 exit code 0，或者消息流突然 EOF，都不能提交成功。

### 3. 业务验收

Provider 契约通过后，Runtime 提交：

- completion signal；
- Provider status；
- Session / Turn ID；
- exit code；
- 协议事件统计；
- 执行摘要和 Artifact。

服务端再次校验证据，只把 Run 置为 `reported`、Item 置为 `in_review`。
负责人验收通过后，Run 才成为 `completed`，Item 才成为 `done`；验收拒绝则
回到 `in_progress`，保留原报告作为审计证据。

## 后续增强

- Codex 增加 thread resume、Session rollout 校验和跨 Run 会话恢复；
- Claude Code 改用双向 stream-json，支持控制请求与明确取消；
- 对验收条件运行自动测试、静态检查或策略 Gate；
- Session 指针和工作目录快照持久化，用于崩溃恢复；
- 每个外部副作用增加幂等键和独立审批记录。
