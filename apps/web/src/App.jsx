import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Dialog,
  DropdownMenu,
  Flex,
  IconButton,
  ScrollArea,
  Select,
  Separator,
  Text,
  TextArea,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  FileCheck2,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  MonitorCog,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

const API = "";
const columns = [
  { id: "todo", label: "待开始" },
  { id: "in_progress", label: "执行中" },
  { id: "in_review", label: "待验收" },
  { id: "done", label: "已完成" },
];

export function App() {
  const [user, setUser] = useState(undefined);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api("/api/bootstrap");
      setData(result);
      setError("");
    } catch (loadError) {
      if (loadError.status === 401) setUser(null);
      else setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    api("/api/auth/me")
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        return load();
      })
      .catch(() => setUser(null));
  }, [load]);

  useEffect(() => {
    if (!user) return undefined;
    const stream = new EventSource(`${API}/api/events`, { withCredentials: true });
    stream.addEventListener("workspace", load);
    return () => stream.close();
  }, [user, load]);

  useEffect(() => {
    const desktop = window.siliecoDesktop;
    if (!desktop) return undefined;
    desktop.runtime.status().then(setRuntimeStatus);
    return desktop.runtime.onStatusChanged(setRuntimeStatus);
  }, []);

  const mutate = async (key, operation) => {
    setBusy(key);
    setError("");
    try {
      await operation();
      await load();
    } catch (mutationError) {
      setError(mutationError.message);
    } finally {
      setBusy("");
    }
  };

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <AuthScreen onAuthenticated={(nextUser) => {
    setUser(nextUser);
    load();
  }} />;
  if (!data) return <LoadingScreen />;

  return (
    <div className="app-shell">
      <Sidebar user={user} data={data} onLogout={async () => {
        await api("/api/auth/logout", { method: "POST" });
        setUser(null);
        setData(null);
      }} />
      <main className="workspace">
        <Header data={data} onRefresh={load} />
        {error && (
          <div className="error-banner" role="alert">
            <CircleDot size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="关闭">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="workspace-body">
          <OverviewStrip data={data} runtimeStatus={runtimeStatus} />
          <section className="work-grid">
            <div className="board-panel">
              <BoardToolbar data={data} mutate={mutate} busy={busy} />
              <Board data={data} mutate={mutate} busy={busy} />
            </div>
            <aside className="right-rail">
              <RuntimePanel
                data={data}
                runtimeStatus={runtimeStatus}
                setRuntimeStatus={setRuntimeStatus}
                setError={setError}
              />
              <ApprovalPanel data={data} mutate={mutate} busy={busy} />
              <ActivityPanel events={data.events} />
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

function Sidebar({ user, data, onLogout }) {
  const nav = [
    [LayoutDashboard, "工作台", true],
    [ListTodo, "事项", false],
    [Bot, "Agent", false],
    [GitBranch, "项目", false],
    [FileCheck2, "产物", false],
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/silieco-mark.svg" alt="" />
        <div>
          <strong>silieco</strong>
          <span>Agent Work OS</span>
        </div>
      </div>
      <button className="workspace-switcher" type="button">
        <span className="workspace-avatar">SL</span>
        <span><strong>{data.workspace.name}</strong><small>{data.project.name}</small></span>
        <ChevronDown size={15} />
      </button>
      <nav aria-label="主导航">
        {nav.map(([Icon, label, active]) => (
          <button className={active ? "nav-item active" : "nav-item"} type="button" key={label}>
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {label === "事项" && <small>{data.items.length}</small>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item" type="button"><Inbox size={18} />通知中心<small>3</small></button>
        <button className="nav-item" type="button"><Settings size={18} />设置</button>
        <Separator size="4" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button className="profile-button" type="button">
              <Avatar fallback={user.name.slice(0, 1)} size="2" radius="full" />
              <span><strong>{user.name}</strong><small>{user.email}</small></span>
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item color="red" onSelect={onLogout}>
              <LogOut size={15} />退出登录
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
}

function Header({ data }) {
  return (
    <header className="topbar">
      <div>
        <Text size="1" color="gray">WORKSPACE / {data.project.name.toUpperCase()}</Text>
        <h1>协作工作台</h1>
      </div>
      <div className="topbar-actions">
        <TextField.Root className="search-field" placeholder="搜索事项、Agent 或产物">
          <TextField.Slot><Search size={16} /></TextField.Slot>
        </TextField.Root>
        <NewItemDialog actors={data.actors} />
      </div>
    </header>
  );
}

function OverviewStrip({ data, runtimeStatus }) {
  const stats = [
    [Activity, "执行中的事项", data.stats.activeItems, "实时"],
    [ShieldCheck, "等待审批", data.stats.pendingApprovals, "需处理"],
    [Bot, "工作的 Agent", data.stats.workingAgents, `${data.actors.length} 个身份`],
    [MonitorCog, "本地 Runtime", runtimeStatus?.running ? 1 : data.runtimes.filter((r) => r.status === "online").length, runtimeStatus?.running ? "已连接" : "待连接"],
  ];
  return (
    <section className="overview-strip" aria-label="Workspace 概览">
      {stats.map(([Icon, label, value, note], index) => (
        <div className="metric" key={label}>
          <div className="metric-icon"><Icon size={18} /></div>
          <div><span>{label}</span><strong>{value}</strong></div>
          <small className={index === 1 && value > 0 ? "attention" : ""}>{note}</small>
        </div>
      ))}
    </section>
  );
}

function BoardToolbar({ data }) {
  return (
    <div className="board-toolbar">
      <div>
        <h2>事项流</h2>
        <span>{data.items.length} 个事项 · Item 与 Agent Run 独立追踪</span>
      </div>
      <div className="toolbar-controls">
        <Button variant="soft" color="gray"><Users size={15} />全部负责人</Button>
        <Button variant="soft" color="gray"><Command size={15} />全部模板</Button>
      </div>
    </div>
  );
}

function Board({ data, mutate, busy }) {
  return (
    <div className="board">
      {columns.map((column) => {
        const items = data.items.filter((item) => item.status === column.id);
        return (
          <section className="board-column" key={column.id}>
            <header>
              <span className={`status-dot ${column.id}`} />
              <strong>{column.label}</strong>
              <small>{items.length}</small>
            </header>
            <div className="column-items">
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  run={data.runs.find((candidate) => candidate.itemId === item.id)}
                  mutate={mutate}
                  busy={busy}
                />
              ))}
              {items.length === 0 && <div className="empty-column">暂无事项</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ItemCard({ item, run, mutate, busy }) {
  const canRun = item.status === "todo" && item.assigneeType === "specialized";
  const canAccept = item.status === "in_review" && run?.status === "reported";
  return (
    <article className="item-card">
      <div className="card-meta">
        <Badge size="1" variant="soft" color={priorityColor(item.priority)}>
          {priorityLabel(item.priority)}
        </Badge>
        <span>{item.template}</span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton size="1" variant="ghost" color="gray" aria-label="事项操作">
              <MoreHorizontal size={15} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item>查看详情</DropdownMenu.Item>
            <DropdownMenu.Item>复制事项链接</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      <h3>{item.title}</h3>
      <p>{item.description}</p>
      <div className="criteria">
        <Check size={14} />
        <span>{item.acceptanceCriteria.length} 条验收条件</span>
        {item.artifactCount > 0 && <span>· {item.artifactCount} 个产物</span>}
      </div>
      {run && <RunState run={run} />}
      <footer>
        <Tooltip content={item.assigneeName || "未分配"}>
          <Avatar size="1" radius="full" fallback={(item.assigneeName || "?").slice(0, 1)} />
        </Tooltip>
        <span>{item.assigneeName || "未分配"}</span>
        {canRun && (
          <Button
            size="1"
            onClick={() => mutate(`run-${item.id}`, () => api(`/api/items/${item.id}/runs`, { method: "POST" }))}
            disabled={busy === `run-${item.id}`}
          >
            {busy === `run-${item.id}` ? <LoaderCircle className="spin" size={14} /> : <Play size={13} />}
            启动
          </Button>
        )}
        {canAccept && (
          <Button
            size="1"
            color="green"
            onClick={() => mutate(`accept-${item.id}`, () => api(`/api/items/${item.id}/status`, {
              method: "PATCH",
              body: { status: "done" },
            }))}
          >
            <Check size={13} />验收
          </Button>
        )}
      </footer>
    </article>
  );
}

function RunState({ run }) {
  const states = {
    waiting_approval: ["amber", "等待执行审批"],
    queued: ["blue", "等待本地 Runtime"],
    running: ["blue", "Agent 正在执行"],
    reported: ["amber", "Turn 已结束 · 待验收"],
    completed: ["green", "已验收完成"],
    failed: ["red", "执行失败"],
  };
  const [color, label] = states[run.status] || ["gray", run.status];
  return (
    <div className={`run-state ${color}`}>
      {run.status === "running" ? <LoaderCircle className="spin" size={14} /> : <CircleDot size={14} />}
      <span>{label}</span>
      {run.completionSignal && <code>{run.completionSignal}</code>}
    </div>
  );
}

function RuntimePanel({ data, runtimeStatus, setRuntimeStatus, setError }) {
  const desktop = window.siliecoDesktop;
  const connected = runtimeStatus?.running;
  const [connecting, setConnecting] = useState(false);
  const connect = async () => {
    if (!desktop) {
      setError("请在 Silieco Desktop 中连接本地 Codex 或 Claude Code Runtime");
      return;
    }
    setConnecting(true);
    try {
      const workdir = await desktop.runtime.selectWorkdir();
      if (!workdir) return;
      const { token } = await api("/api/runtime-tokens", { method: "POST" });
      const status = await desktop.runtime.connect({
        serverUrl: window.location.origin.replace(":5173", ":8787"),
        token,
        workdir,
      });
      setRuntimeStatus(status);
    } catch (error) {
      setError(error.message);
    } finally {
      setConnecting(false);
    }
  };
  return (
    <section className="rail-section runtime-panel">
      <div className="section-heading">
        <div><MonitorCog size={17} /><h2>本地 Runtime</h2></div>
        <span className={connected ? "live-indicator online" : "live-indicator"}>
          {connected ? "在线" : "离线"}
        </span>
      </div>
      {connected ? (
        <>
          <div className="runtime-device">
            <strong>Silieco Desktop Runtime</strong>
            <span>{runtimeStatus.workdir}</span>
          </div>
          <div className="provider-list">
            {runtimeStatus.providers.map((provider) => (
              <div key={provider.id}>
                <span className="provider-mark">{provider.id === "codex" ? "CX" : "CL"}</span>
                <span><strong>{provider.name}</strong><small>{provider.version}</small></span>
                <Check size={15} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="runtime-empty">
          <p>连接桌面端，让任务在你的设备上调用 Codex 或 Claude Code。</p>
          <Button size="2" variant="soft" onClick={connect} disabled={connecting}>
            {connecting ? <LoaderCircle className="spin" size={15} /> : <MonitorCog size={15} />}
            连接本机
          </Button>
          {!desktop && <small>Web 端可管理任务；执行连接需使用 Desktop App。</small>}
        </div>
      )}
      {!connected && data.runtimes.some((runtime) => runtime.status === "online") && (
        <Text size="1" color="gray">另有 Runtime 正在线上执行。</Text>
      )}
    </section>
  );
}

function ApprovalPanel({ data, mutate, busy }) {
  const approvals = data.approvals.filter((approval) => approval.status === "pending");
  return (
    <section className="rail-section">
      <div className="section-heading">
        <div><ShieldCheck size={17} /><h2>执行门控</h2></div>
        <span>{approvals.length}</span>
      </div>
      {approvals.length === 0 ? (
        <div className="quiet-empty"><Check size={16} />没有等待中的审批</div>
      ) : approvals.slice(0, 2).map((approval) => (
        <div className="approval-row" key={approval.id}>
          <div>
            <Badge size="1" color={approval.riskLevel === "high" ? "red" : "amber"}>
              {approval.riskLevel === "high" ? "高风险" : "需确认"}
            </Badge>
            <strong>{approval.itemTitle}</strong>
          </div>
          <p>{approval.actionSummary}</p>
          <div>
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => mutate(`reject-${approval.id}`, () => decide(approval.id, "rejected"))}
            >
              拒绝
            </Button>
            <Button
              size="1"
              onClick={() => mutate(`approve-${approval.id}`, () => decide(approval.id, "approved"))}
              disabled={busy.includes(approval.id)}
            >
              批准本次
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function ActivityPanel({ events }) {
  return (
    <section className="rail-section activity-panel">
      <div className="section-heading">
        <div><Clock3 size={17} /><h2>实时动态</h2></div>
        <span className="live-indicator online">LIVE</span>
      </div>
      <ScrollArea type="auto" scrollbars="vertical" className="activity-scroll">
        <div className="timeline">
          {events.slice(0, 10).map((event) => (
            <div className="timeline-event" key={event.id}>
              <span className={`event-dot ${event.eventType.includes("failed") ? "danger" : ""}`} />
              <div>
                <strong>{event.title}</strong>
                <p>{event.detail}</p>
                <small>{relativeTime(event.occurredAt)} · {event.actorName || "Silieco"}</small>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}

function NewItemDialog({ actors }) {
  const [open, setOpen] = useState(false);
  const specialized = actors.filter((actor) => actor.actorType === "specialized");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    assigneeId: specialized[0]?.id || "",
    template: "软件开发",
    acceptance: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/items", {
        method: "POST",
        body: {
          ...form,
          acceptanceCriteria: form.acceptance.split("\n").map((line) => line.trim()).filter(Boolean),
        },
      });
      setOpen(false);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button><Plus size={16} />新建事项</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="560px">
        <Dialog.Title>创建一个可执行事项</Dialog.Title>
        <Dialog.Description>
          明确目标、负责人和验收条件。启动 Agent 前还会请求一次范围授权。
        </Dialog.Description>
        <form className="item-form" onSubmit={submit}>
          <label>事项标题<TextField.Root required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>目标描述<TextArea resize="vertical" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="form-grid">
            <label>负责人<Select.Root value={form.assigneeId} onValueChange={(value) => setForm({ ...form, assigneeId: value })}>
              <Select.Trigger />
              <Select.Content>{specialized.map((actor) => <Select.Item value={actor.id} key={actor.id}>{actor.name}</Select.Item>)}</Select.Content>
            </Select.Root></label>
            <label>优先级<Select.Root value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="urgent">紧急</Select.Item><Select.Item value="high">高</Select.Item>
                <Select.Item value="medium">中</Select.Item><Select.Item value="low">低</Select.Item>
              </Select.Content>
            </Select.Root></label>
          </div>
          <label>验收条件（每行一条）<TextArea required resize="vertical" value={form.acceptance} onChange={(e) => setForm({ ...form, acceptance: e.target.value })} placeholder={"功能可以运行\n测试全部通过\n说明未解决风险"} /></label>
          <Flex justify="end" gap="3" mt="2">
            <Dialog.Close><Button type="button" variant="soft" color="gray">取消</Button></Dialog.Close>
            <Button type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={15} />}创建事项</Button>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "demo@silieco.local",
    password: "silieco",
    name: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/auth/${mode}`, { method: "POST", body: form });
      onAuthenticated(result.user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand auth-brand"><img src="/silieco-mark.svg" alt="" /><div><strong>silieco</strong><span>Agent Work OS</span></div></div>
        <div className="story-content">
          <span className="eyebrow"><Sparkles size={14} />Human + Agent Collaboration</span>
          <h1>让每一次 Agent 执行，<br />都成为可验收的工作。</h1>
          <p>统一事项、Agent、Runtime、审批与证据。进程退出不是完成，交付被验证才是。</p>
          <div className="contract-preview">
            <div><span>01</span><strong>本地执行</strong><small>连接 Codex / Claude Code</small></div>
            <div><span>02</span><strong>协议终态</strong><small>确认 Turn 真正结束</small></div>
            <div><span>03</span><strong>人工验收</strong><small>证据通过后完成事项</small></div>
          </div>
        </div>
        <small>Silieco MVP · 独立实现</small>
      </section>
      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div>
            <span className="eyebrow">WELCOME TO SILIECO</span>
            <h2>{mode === "login" ? "登录工作空间" : "创建你的账号"}</h2>
            <p>{mode === "login" ? "继续管理你的 Agent 协作流程。" : "注册后自动创建 Self Agent 身份。"}</p>
          </div>
          {mode === "register" && <label>姓名<TextField.Root size="3" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>}
          <label>邮箱<TextField.Root size="3" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>密码<TextField.Root size="3" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error && <div className="form-error">{error}</div>}
          <Button size="3" type="submit" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />}
            {mode === "login" ? "登录" : "注册并开始"}
          </Button>
          <button className="mode-switch" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "还没有账号？创建账号" : "已经有账号？返回登录"}
          </button>
          {mode === "login" && <div className="demo-hint"><strong>演示账号</strong><span>demo@silieco.local / silieco</span></div>}
        </form>
      </section>
    </div>
  );
}

function LoadingScreen() {
  return <div className="loading-screen"><img src="/silieco-mark.svg" alt="" /><LoaderCircle className="spin" size={22} /><span>正在准备 Workspace</span></div>;
}

async function decide(id, decision) {
  return api(`/api/approvals/${id}/decision`, { method: "POST", body: { decision } });
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function priorityColor(priority) {
  return { urgent: "red", high: "orange", medium: "blue", low: "gray" }[priority] || "gray";
}

function priorityLabel(priority) {
  return { urgent: "紧急", high: "高", medium: "中", low: "低" }[priority] || priority;
}

function relativeTime(value) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1_440)} 天前`;
}
