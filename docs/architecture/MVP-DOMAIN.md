# Silieco MVP 领域模型

## 核心实体

### Workspace

数据、成员、Agent、项目和策略的隔离边界。

### Actor

业务协作身份。MVP 包含：

- `self`：用户的 Self Agent；
- `specialized`：独立执行工作的 Specialized Agent；
- `human`：仅用于审计实际执行主体。

### Item

稳定的工作目标，持有标题、描述、状态、优先级、负责人和验收条件。

MVP 状态：

```text
todo → in_progress → in_review → done
            ↑             │
            └─────────────┘
```

### Run

某个 Agent 对 Item 的一次逻辑执行。Item 与 Run 分离，同一 Item 可以产生多个 Run。

```text
waiting_approval → queued → running → reported → completed
                              │          │
                              └→ failed  ├→ verification accepted
                                         └→ verification rejected
```

`reported` 只表示本地 Agent 的协议终态、进程终态和执行报告均已收到，
不表示 Item 已经完成。负责人验收后 Run 才进入 `completed`，Item 才能进入
`done`。

### Event

只追加的结构化执行记录。用于时间线、审计、实时同步和未来知识沉淀。

### Approval

对一个具体风险动作的结构化决策。批准的是动作摘要，而不是给 Agent 永久授权。

### Artifact

Run 产生的可交付结果。MVP 保存标题、类型、摘要和内容；后续映射为 Git 文件、对象存储或外部系统链接。

## API

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/bootstrap` | 获取 Workspace 当前投影 |
| POST | `/api/items` | 创建事项 |
| PATCH | `/api/items/:id/status` | 人工改变事项状态 |
| POST | `/api/items/:id/runs` | 创建 Agent Run |
| POST | `/api/approvals/:id/decision` | 批准或拒绝风险动作 |
| POST | `/api/runtime/runs/:id/heartbeat` | 延长本地 Run 租约并检查取消信号 |
| GET | `/api/events` | SSE 实时事件流 |
| GET | `/healthz` | 服务健康检查 |

## 一致性规则

1. 所有写操作都在 SQLite 事务中完成；
2. Event 与领域状态在同一事务写入；
3. 客户端收到 SSE 后重新读取权威投影；
4. Runtime 成功上报必须同时满足 Provider 协议终态与进程正常退出；
5. Approval 只能决策一次；
6. 只有 `waiting_approval` 的 Run 可以在批准后继续；
7. Agent 不能直接把 Item 标为 `done`，只能提交报告进入 `in_review`；
8. Item 完成前必须由负责人验收一个 `reported` Run；
9. Run 租约过期后不自动重跑，避免重复提交、重复发信等副作用。
