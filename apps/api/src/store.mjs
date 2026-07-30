import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const now = () => new Date().toISOString();
const json = (value) => JSON.stringify(value ?? []);
const parseJson = (value, fallback = []) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

function withTransaction(db, operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export class SiliecoStore {
  constructor({ filename = ".data/silieco.db", runtimeDelay = 700 } = {}) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.runtimeDelay = runtimeDelay;
    this.listeners = new Set();
    this.timers = new Set();
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    this.seed();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        summary TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS runtime_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS runtimes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        device_name TEXT NOT NULL,
        status TEXT NOT NULL,
        providers TEXT NOT NULL DEFAULT '[]',
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS actors (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        runtime TEXT,
        owner_name TEXT,
        capabilities TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        assignee_id TEXT,
        template TEXT NOT NULL,
        acceptance_criteria TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (assignee_id) REFERENCES actors(id)
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        runtime_id TEXT,
        provider TEXT,
        provider_session_id TEXT,
        provider_turn_id TEXT,
        completion_signal TEXT,
        provider_status TEXT,
        exit_code INTEGER,
        protocol_evidence TEXT NOT NULL DEFAULT '{}',
        verification_status TEXT NOT NULL DEFAULT 'not_started',
        result_summary TEXT,
        error TEXT,
        last_event_at TEXT,
        lease_expires_at TEXT,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (actor_id) REFERENCES actors(id)
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by TEXT,
        decision_note TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        item_id TEXT,
        run_id TEXT,
        actor_id TEXT,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_workspace_status
        ON items(workspace_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_item
        ON runs(item_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_workspace
        ON events(workspace_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_approvals_status
        ON approvals(status, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_token
        ON sessions(token_hash, expires_at);
      CREATE INDEX IF NOT EXISTS idx_runtimes_user
        ON runtimes(user_id, last_seen_at DESC);
    `);
    const runColumns = {
      runtime_id: "TEXT",
      provider: "TEXT",
      provider_session_id: "TEXT",
      provider_turn_id: "TEXT",
      completion_signal: "TEXT",
      provider_status: "TEXT",
      exit_code: "INTEGER",
      protocol_evidence: "TEXT NOT NULL DEFAULT '{}'",
      verification_status: "TEXT NOT NULL DEFAULT 'not_started'",
      result_summary: "TEXT",
      error: "TEXT",
      last_event_at: "TEXT",
      lease_expires_at: "TEXT",
      cancel_requested: "INTEGER NOT NULL DEFAULT 0",
    };
    const existingRunColumns = new Set(
      this.db.prepare("PRAGMA table_info(runs)").all().map((column) => column.name),
    );
    for (const [column, definition] of Object.entries(runColumns)) {
      if (!existingRunColumns.has(column)) {
        this.db.exec(`ALTER TABLE runs ADD COLUMN ${column} ${definition}`);
      }
    }
  }

  seed() {
    const existing = this.db.prepare("SELECT COUNT(*) AS count FROM workspaces").get();
    if (existing.count > 0) return;

    const timestamp = now();
    withTransaction(this.db, () => {
      this.db.prepare("INSERT INTO workspaces (id, name, slug) VALUES (?, ?, ?)")
        .run("ws-silieco", "Silieco Lab", "silieco-lab");
      this.db.prepare(`
        INSERT INTO projects (id, workspace_id, name, summary)
        VALUES (?, ?, ?, ?)
      `).run(
        "project-core",
        "ws-silieco",
        "Silieco Core",
        "验证人类与 Agent 在统一事项、执行事件和门控规则下协作的第一个纵向闭环。",
      );

      const demoPassword = hashPassword("silieco");
      this.db.prepare(`
        INSERT INTO users (id, email, name, password_hash, password_salt, created_at)
        VALUES ('user-demo', 'demo@silieco.local', '陈默', ?, ?, ?)
      `).run(demoPassword.hash, demoPassword.salt, timestamp);

      const actors = [
        ["actor-self", "陈默 · Self", "self", "产品负责人", "online", "Human + Self Agent", "陈默", ["决策", "审批", "调度"]],
        ["actor-builder", "Forge", "specialized", "工程 Agent", "idle", "Codex Adapter", "陈默", ["代码实现", "测试", "Git"]],
        ["actor-research", "Scout", "specialized", "研究 Agent", "working", "Research Runtime", "陈默", ["调研", "知识提炼", "资料核验"]],
        ["actor-review", "Sentinel", "specialized", "审查 Agent", "idle", "Policy Runtime", "平台", ["安全审查", "证据验证", "风险识别"]],
      ];
      const insertActor = this.db.prepare(`
        INSERT INTO actors (
          id, workspace_id, name, actor_type, role, status, runtime, owner_name, capabilities
        ) VALUES (?, 'ws-silieco', ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const actor of actors) {
        insertActor.run(...actor.slice(0, 7), json(actor[7]));
      }

      const items = [
        {
          id: "item-runtime",
          title: "跑通本地 Agent Runtime",
          description: "建立 Node、Run 与结构化事件之间的最小执行链路。",
          status: "todo",
          priority: "high",
          assignee: "actor-builder",
          template: "软件开发",
          criteria: ["Run 可被创建和恢复", "每个阶段产生结构化 Event", "失败原因可追踪"],
        },
        {
          id: "item-policy",
          title: "定义高风险动作审批策略",
          description: "把外发、付费调用和破坏性操作转换为可审计的门控决策。",
          status: "in_progress",
          priority: "urgent",
          assignee: "actor-review",
          template: "策略设计",
          criteria: ["审批绑定具体动作", "拒绝后停止执行", "决策进入审计时间线"],
        },
        {
          id: "item-brand",
          title: "统一 Workspace 品牌语言",
          description: "将官网品牌标识、颜色和产品语气落入工作台。",
          status: "in_review",
          priority: "medium",
          assignee: "actor-self",
          template: "简单任务",
          criteria: ["品牌标识一致", "关键界面满足可访问性", "桌面和移动布局可用"],
        },
        {
          id: "item-model",
          title: "冻结 Item / Run / Event 边界",
          description: "建立不依赖具体 Agent Runtime 的稳定领域语言。",
          status: "done",
          priority: "high",
          assignee: "actor-self",
          template: "架构决策",
          criteria: ["Item 与 Run 分离", "Event 只追加", "Approval 独立建模"],
        },
        {
          id: "item-context",
          title: "梳理项目 Context 路由",
          description: "定义 Agent 执行前最小上下文包与知识写回位置。",
          status: "todo",
          priority: "medium",
          assignee: "actor-research",
          template: "研究任务",
          criteria: ["上下文来源可追踪", "支持按需加载", "产出写回知识库"],
        },
      ];
      const insertItem = this.db.prepare(`
        INSERT INTO items (
          id, workspace_id, project_id, title, description, status, priority,
          assignee_id, template, acceptance_criteria, created_at, updated_at
        ) VALUES (?, 'ws-silieco', 'project-core', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          item.id,
          item.title,
          item.description,
          item.status,
          item.priority,
          item.assignee,
          item.template,
          json(item.criteria),
          timestamp,
          timestamp,
        );
      }

      const runId = "run-seed-policy";
      this.db.prepare(`
        INSERT INTO runs (id, item_id, actor_id, status, attempt, started_at, created_at)
        VALUES (?, 'item-policy', 'actor-review', 'waiting_approval', 1, ?, ?)
      `).run(runId, timestamp, timestamp);
      this.db.prepare(`
        INSERT INTO approvals (
          id, item_id, run_id, action_summary, risk_level, status, requested_at
        ) VALUES (?, 'item-policy', ?, ?, 'high', 'pending', ?)
      `).run(
        "approval-seed-policy",
        runId,
        "允许 Sentinel 写入 Workspace 默认危险操作策略，并启用执行前拦截。",
        timestamp,
      );

      const artifactId = "artifact-domain";
      this.db.prepare(`
        INSERT INTO runs (
          id, item_id, actor_id, status, attempt, verification_status,
          started_at, completed_at, created_at
        ) VALUES ('run-domain', 'item-model', 'actor-self', 'completed', 1, 'accepted', ?, ?, ?)
      `).run(timestamp, timestamp, timestamp);
      this.db.prepare(`
        INSERT INTO artifacts (
          id, item_id, run_id, title, artifact_type, summary, content, created_at
        ) VALUES (?, 'item-model', 'run-domain', ?, 'architecture', ?, ?, ?)
      `).run(
        artifactId,
        "MVP 领域模型 v0.1",
        "Item、Run、Event、Approval 和 Artifact 已建立稳定边界。",
        "# MVP 领域模型\n\nItem 表达工作目标，Run 表达一次逻辑执行，Event 保存只追加过程证据。",
        timestamp,
      );

      const seedEvents = [
        ["item-model", "run-domain", "actor-self", "item.completed", "领域边界已冻结", "Item、Run 与 Event 的职责已经明确。"],
        ["item-brand", null, "actor-self", "item.review_requested", "品牌方案等待验收", "官网品牌蓝与方格标识已进入 Workspace。"],
        ["item-policy", runId, "actor-review", "approval.requested", "Sentinel 请求策略写入权限", "风险级别：高。执行暂停，等待负责人决策。"],
        ["item-context", null, "actor-research", "item.assigned", "Scout 接手 Context 路由调研", "正在收集项目知识来源和更新策略。"],
      ];
      const insertEvent = this.db.prepare(`
        INSERT INTO events (
          workspace_id, item_id, run_id, actor_id, event_type, title, detail, occurred_at
        ) VALUES ('ws-silieco', ?, ?, ?, ?, ?, ?, ?)
      `);
      seedEvents.forEach((event, index) => {
        insertEvent.run(...event, new Date(Date.now() - index * 12 * 60_000).toISOString());
      });
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event) {
    for (const listener of this.listeners) listener(event);
  }

  schedule(operation, delayMultiplier = 1) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      operation();
    }, this.runtimeDelay * delayMultiplier);
    this.timers.add(timer);
  }

  appendEvent({ itemId = null, runId = null, actorId = null, eventType, title, detail }) {
    const occurredAt = now();
    const result = this.db.prepare(`
      INSERT INTO events (
        workspace_id, item_id, run_id, actor_id, event_type, title, detail, occurred_at
      ) VALUES ('ws-silieco', ?, ?, ?, ?, ?, ?, ?)
    `).run(itemId, runId, actorId, eventType, title, detail, occurredAt);
    const event = {
      id: Number(result.lastInsertRowid),
      workspaceId: "ws-silieco",
      itemId,
      runId,
      actorId,
      eventType,
      title,
      detail,
      occurredAt,
    };
    this.publish(event);
    return event;
  }

  registerUser({ email, password, name }) {
    const normalizedEmail = email?.trim().toLowerCase();
    const displayName = name?.trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new DomainError("请输入有效邮箱", 400);
    }
    if (!displayName) throw new DomainError("请输入姓名", 400);
    if (!password || password.length < 8) {
      throw new DomainError("密码至少需要 8 个字符", 400);
    }
    if (this.db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail)) {
      throw new DomainError("该邮箱已经注册", 409);
    }

    const userId = `user-${randomUUID()}`;
    const actorId = `actor-self-${randomUUID()}`;
    const passwordRecord = hashPassword(password);
    withTransaction(this.db, () => {
      this.db.prepare(`
        INSERT INTO users (id, email, name, password_hash, password_salt, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        normalizedEmail,
        displayName,
        passwordRecord.hash,
        passwordRecord.salt,
        now(),
      );
      this.db.prepare(`
        INSERT INTO actors (
          id, workspace_id, name, actor_type, role, status, runtime, owner_name, capabilities
        ) VALUES (?, 'ws-silieco', ?, 'self', 'Workspace 成员', 'online', ?, ?, ?)
      `).run(
        actorId,
        `${displayName} · Self`,
        "Human + Self Agent",
        displayName,
        json(["决策", "审批", "调度"]),
      );
      this.appendEvent({
        actorId,
        eventType: "member.joined",
        title: `${displayName} 加入 Workspace`,
        detail: "Self Agent 已创建，用户可以开始参与协作与审批。",
      });
    });
    return this.createSession(userId);
  }

  loginUser({ email, password }) {
    const normalizedEmail = email?.trim().toLowerCase();
    const user = this.db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    if (!user || !verifyPassword(password ?? "", user.password_salt, user.password_hash)) {
      throw new DomainError("邮箱或密码不正确", 401);
    }
    return this.createSession(user.id);
  }

  createSession(userId) {
    const token = `ss_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(`session-${randomUUID()}`, userId, tokenHash(token), expiresAt, now());
    const user = this.db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(userId);
    return { token, expiresAt, user: camelize(user) };
  }

  authenticateSession(token) {
    if (!token) return null;
    const user = this.db.prepare(`
      SELECT u.id, u.email, u.name
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash(token), now());
    return user ? camelize(user) : null;
  }

  logoutSession(token) {
    if (!token) return;
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  createRuntimeToken(userId) {
    this.db.prepare("DELETE FROM runtime_tokens WHERE user_id = ?").run(userId);
    const token = `srt_${randomBytes(32).toString("base64url")}`;
    this.db.prepare(`
      INSERT INTO runtime_tokens (id, user_id, token_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(`rt-${randomUUID()}`, userId, tokenHash(token), now());
    return { token };
  }

  authenticateRuntimeToken(token) {
    if (!token) return null;
    const record = this.db.prepare(`
      SELECT rt.id AS token_id, u.id AS user_id, u.name
      FROM runtime_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = ?
    `).get(tokenHash(token));
    if (!record) return null;
    this.db.prepare("UPDATE runtime_tokens SET last_used_at = ? WHERE id = ?")
      .run(now(), record.token_id);
    return camelize(record);
  }

  heartbeatRuntime(userId, input) {
    const runtimeId = input.runtimeId || `runtime-${randomUUID()}`;
    const providers = Array.isArray(input.providers) ? input.providers : [];
    const existing = this.db.prepare("SELECT id FROM runtimes WHERE id = ? AND user_id = ?")
      .get(runtimeId, userId);
    if (existing) {
      this.db.prepare(`
        UPDATE runtimes
        SET name = ?, device_name = ?, status = 'online', providers = ?, last_seen_at = ?
        WHERE id = ? AND user_id = ?
      `).run(
        input.name || "Silieco Desktop",
        input.deviceName || "Local device",
        json(providers),
        now(),
        runtimeId,
        userId,
      );
    } else {
      this.db.prepare(`
        INSERT INTO runtimes (
          id, user_id, name, device_name, status, providers, last_seen_at, created_at
        ) VALUES (?, ?, ?, ?, 'online', ?, ?, ?)
      `).run(
        runtimeId,
        userId,
        input.name || "Silieco Desktop",
        input.deviceName || "Local device",
        json(providers),
        now(),
        now(),
      );
      this.appendEvent({
        actorId: "actor-self",
        eventType: "runtime.connected",
        title: `${input.name || "Silieco Desktop"} 已连接`,
        detail: providers.length
          ? `已发现 ${providers.map((provider) => provider.name).join("、")}。`
          : "尚未发现可用的 Agent CLI。",
      });
    }
    return {
      runtimeId,
      status: "online",
      providers,
      heartbeatIntervalMs: 10_000,
    };
  }

  getBootstrap(userId) {
    const workspace = this.db.prepare("SELECT * FROM workspaces LIMIT 1").get();
    const project = this.db.prepare("SELECT * FROM projects LIMIT 1").get();
    const actors = this.db.prepare(`
      SELECT * FROM actors ORDER BY
        CASE status WHEN 'working' THEN 0 WHEN 'online' THEN 1 WHEN 'idle' THEN 2 ELSE 3 END,
        name
    `).all().map((actor) => ({
      ...camelize(actor),
      capabilities: parseJson(actor.capabilities),
    }));
    const items = this.db.prepare(`
      SELECT
        i.*,
        a.name AS assignee_name,
        a.actor_type AS assignee_type,
        (
          SELECT r.status FROM runs r
          WHERE r.item_id = i.id
          ORDER BY r.created_at DESC LIMIT 1
        ) AS latest_run_status,
        (
          SELECT COUNT(*) FROM artifacts ar WHERE ar.item_id = i.id
        ) AS artifact_count
      FROM items i
      LEFT JOIN actors a ON a.id = i.assignee_id
      ORDER BY
        CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        i.updated_at DESC
    `).all().map((item) => ({
      ...camelize(item),
      acceptanceCriteria: parseJson(item.acceptance_criteria),
      artifactCount: Number(item.artifact_count),
    }));
    const runs = this.db.prepare(`
      SELECT r.*, a.name AS actor_name
      FROM runs r JOIN actors a ON a.id = r.actor_id
      ORDER BY r.created_at DESC
    `).all().map(camelize);
    const approvals = this.db.prepare(`
      SELECT ap.*, i.title AS item_title, a.name AS actor_name
      FROM approvals ap
      JOIN items i ON i.id = ap.item_id
      JOIN runs r ON r.id = ap.run_id
      JOIN actors a ON a.id = r.actor_id
      ORDER BY ap.requested_at DESC
    `).all().map(camelize);
    const artifacts = this.db.prepare(`
      SELECT * FROM artifacts ORDER BY created_at DESC
    `).all().map(camelize);
    const events = this.db.prepare(`
      SELECT e.*, a.name AS actor_name
      FROM events e
      LEFT JOIN actors a ON a.id = e.actor_id
      ORDER BY e.id DESC LIMIT 40
    `).all().map(camelize);
    const runtimes = this.db.prepare(`
      SELECT * FROM runtimes
      WHERE user_id = ?
      ORDER BY last_seen_at DESC
    `).all(userId).map((runtime) => ({
      ...camelize(runtime),
      providers: parseJson(runtime.providers),
      status: Date.now() - Date.parse(runtime.last_seen_at) < 30_000 ? "online" : "offline",
    }));

    return {
      workspace: camelize(workspace),
      project: camelize(project),
      actors,
      items,
      runs,
      approvals,
      artifacts,
      events,
      runtimes,
      stats: {
        activeItems: items.filter((item) => item.status === "in_progress").length,
        pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
        workingAgents: actors.filter((actor) => actor.status === "working").length,
        completedItems: items.filter((item) => item.status === "done").length,
      },
    };
  }

  createItem(input) {
    const actor = this.db.prepare("SELECT id FROM actors WHERE id = ?").get(input.assigneeId);
    if (!actor) throw new DomainError("负责人不存在", 400);
    const id = `item-${randomUUID()}`;
    const timestamp = now();
    const criteria = Array.isArray(input.acceptanceCriteria)
      ? input.acceptanceCriteria.filter(Boolean)
      : [];
    withTransaction(this.db, () => {
      this.db.prepare(`
        INSERT INTO items (
          id, workspace_id, project_id, title, description, status, priority,
          assignee_id, template, acceptance_criteria, created_at, updated_at
        ) VALUES (?, 'ws-silieco', 'project-core', ?, ?, 'todo', ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.title.trim(),
        input.description?.trim() ?? "",
        input.priority ?? "medium",
        input.assigneeId,
        input.template ?? "简单任务",
        json(criteria),
        timestamp,
        timestamp,
      );
      this.appendEvent({
        itemId: id,
        actorId: "actor-self",
        eventType: "item.created",
        title: `创建事项：${input.title.trim()}`,
        detail: `已分配给 ${input.assigneeId === "actor-self" ? "Self Agent" : "Specialized Agent"}。`,
      });
    });
    return this.getItem(id);
  }

  getItem(id) {
    const item = this.db.prepare("SELECT * FROM items WHERE id = ?").get(id);
    if (!item) throw new DomainError("事项不存在", 404);
    return { ...camelize(item), acceptanceCriteria: parseJson(item.acceptance_criteria) };
  }

  updateItemStatus(id, status) {
    const allowed = ["todo", "in_progress", "in_review", "done"];
    if (!allowed.includes(status)) throw new DomainError("无效的事项状态", 400);
    const item = this.getItem(id);
    if (status === "done" && item.status !== "in_review") {
      throw new DomainError("事项必须先进入人工验收", 409);
    }
    const latestRun = this.db.prepare(`
      SELECT * FROM runs WHERE item_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(id);
    if (status === "done" && (!latestRun || latestRun.status !== "reported")) {
      throw new DomainError("没有可验收的 Agent 执行报告", 409);
    }
    const timestamp = now();
    withTransaction(this.db, () => {
      this.db.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, timestamp, id);
      if (status === "done" && latestRun) {
        this.db.prepare(`
          UPDATE runs
          SET status = 'completed', verification_status = 'accepted', completed_at = ?
          WHERE id = ? AND status = 'reported'
        `).run(timestamp, latestRun.id);
      } else if (status === "in_progress" && item.status === "in_review" && latestRun?.status === "reported") {
        this.db.prepare(`
          UPDATE runs
          SET status = 'completed', verification_status = 'rejected', completed_at = ?
          WHERE id = ?
        `).run(timestamp, latestRun.id);
      }
      this.appendEvent({
        itemId: id,
        actorId: "actor-self",
        runId: latestRun?.id ?? null,
        eventType: status === "done" ? "run.verification_accepted" : "item.status_changed",
        title: status === "done" ? "负责人验收通过" : `事项进入 ${statusLabel(status)}`,
        detail: status === "done"
          ? "Provider 终态证据与交付产物已由负责人验收，事项才正式完成。"
          : `状态由 ${statusLabel(item.status)} 更新为 ${statusLabel(status)}。`,
      });
    });
    return this.getItem(id);
  }

  createRun(itemId) {
    const item = this.db.prepare(`
      SELECT i.*, a.name AS actor_name
      FROM items i LEFT JOIN actors a ON a.id = i.assignee_id
      WHERE i.id = ?
    `).get(itemId);
    if (!item) throw new DomainError("事项不存在", 404);
    if (!item.assignee_id || item.assignee_id === "actor-self") {
      throw new DomainError("请先分配给 Specialized Agent", 409);
    }
    const active = this.db.prepare(`
      SELECT id FROM runs
      WHERE item_id = ? AND status IN ('queued', 'running', 'waiting_approval', 'reported')
      LIMIT 1
    `).get(itemId);
    if (active) throw new DomainError("该事项已有正在执行的 Run", 409);

    const runId = `run-${randomUUID()}`;
    const approvalId = `approval-${randomUUID()}`;
    const timestamp = now();
    withTransaction(this.db, () => {
      this.db.prepare(`
        INSERT INTO runs (id, item_id, actor_id, status, attempt, created_at)
        VALUES (?, ?, ?, 'waiting_approval', 1, ?)
      `).run(runId, itemId, item.assignee_id, timestamp);
      this.db.prepare("UPDATE items SET status = 'in_progress', updated_at = ? WHERE id = ?")
        .run(timestamp, itemId);
      this.db.prepare(`
        INSERT INTO approvals (
          id, item_id, run_id, action_summary, risk_level, status, requested_at
        ) VALUES (?, ?, ?, ?, 'medium', 'pending', ?)
      `).run(
        approvalId,
        itemId,
        runId,
        `允许 ${item.actor_name} 在 Silieco Desktop 选定的工作目录中启动本地 Agent CLI，处理“${item.title}”。`,
        timestamp,
      );
      this.appendEvent({
        itemId,
        runId,
        actorId: item.assignee_id,
        eventType: "approval.requested",
        title: `${item.actor_name} 请求启动本地 Runtime`,
        detail: "Run 尚未进入执行队列。批准范围只覆盖本次事项和用户选定的工作目录。",
      });
    });

    return camelize(this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId));
  }

  decideApproval(approvalId, { decision, note = "" }) {
    if (!["approved", "rejected"].includes(decision)) {
      throw new DomainError("无效的审批决定", 400);
    }
    const approval = this.db.prepare(`
      SELECT ap.*, r.actor_id, r.status AS run_status
      FROM approvals ap JOIN runs r ON r.id = ap.run_id
      WHERE ap.id = ?
    `).get(approvalId);
    if (!approval) throw new DomainError("审批不存在", 404);
    if (approval.status !== "pending") throw new DomainError("该审批已经处理", 409);
    if (approval.run_status !== "waiting_approval") {
      throw new DomainError("关联 Run 当前不可审批", 409);
    }

    withTransaction(this.db, () => {
      this.db.prepare(`
        UPDATE approvals
        SET status = ?, decided_at = ?, decided_by = 'actor-self', decision_note = ?
        WHERE id = ?
      `).run(decision, now(), note.trim(), approvalId);
      if (decision === "approved") {
        this.db.prepare("UPDATE runs SET status = 'queued' WHERE id = ?").run(approval.run_id);
      } else {
        this.db.prepare(`
          UPDATE runs SET status = 'failed', completed_at = ? WHERE id = ?
        `).run(now(), approval.run_id);
        this.db.prepare("UPDATE actors SET status = 'idle' WHERE id = ?").run(approval.actor_id);
      }
      this.appendEvent({
        itemId: approval.item_id,
        runId: approval.run_id,
        actorId: "actor-self",
        eventType: decision === "approved" ? "approval.approved" : "approval.rejected",
        title: decision === "approved" ? "负责人已批准执行" : "负责人拒绝了执行",
        detail: note.trim() || (decision === "approved"
          ? "授权仅对本次动作有效，Run 已进入本地 Runtime 队列。"
          : "Run 已停止，事项保留在执行中等待调整。"),
      });
    });
    return camelize(this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(approvalId));
  }

  claimRun(runtimeId, providers, userId = "user-demo") {
    const providerNames = new Set(
      (providers ?? []).map((provider) => String(provider.id || provider.name).toLowerCase()),
    );
    if (providerNames.size === 0) return null;
    const runtime = this.db.prepare(`
      SELECT id FROM runtimes WHERE id = ? AND user_id = ? AND status = 'online'
    `).get(runtimeId, userId);
    if (!runtime && runtimeId !== "runtime-test") {
      throw new DomainError("Runtime 尚未注册或不属于当前用户", 403);
    }
    return withTransaction(this.db, () => {
      this.failExpiredRunLeases();
      const run = this.db.prepare(`
        SELECT
          r.*,
          i.title,
          i.description,
          i.acceptance_criteria,
          i.template,
          a.name AS actor_name,
          a.runtime
        FROM runs r
        JOIN items i ON i.id = r.item_id
        JOIN actors a ON a.id = r.actor_id
        WHERE r.status = 'queued'
        ORDER BY r.created_at ASC
        LIMIT 1
      `).get();
      if (!run) return null;
      const requestedProvider = String(run.runtime || "").toLowerCase().includes("claude")
        ? "claude"
        : "codex";
      if (!providerNames.has(requestedProvider)) return null;

      const startedAt = now();
      const leaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
      const updated = this.db.prepare(`
        UPDATE runs
        SET status = 'running', started_at = ?, runtime_id = ?, provider = ?,
            last_event_at = ?, lease_expires_at = ?
        WHERE id = ? AND status = 'queued'
      `).run(startedAt, runtimeId, requestedProvider, startedAt, leaseExpiresAt, run.id);
      if (updated.changes !== 1) return null;
      this.db.prepare("UPDATE actors SET status = 'working' WHERE id = ?").run(run.actor_id);
      this.appendEvent({
        itemId: run.item_id,
        runId: run.id,
        actorId: run.actor_id,
        eventType: "run.started",
        title: `${run.actor_name} 在本地 Runtime 开始执行`,
        detail: `Runtime ${runtimeId} 已认领任务，Provider：${requestedProvider}。`,
      });
      return {
        runId: run.id,
        itemId: run.item_id,
        actorId: run.actor_id,
        actorName: run.actor_name,
        provider: requestedProvider,
        leaseExpiresAt,
        prompt: buildRuntimePrompt(run),
      };
    });
  }

  appendRuntimeEvent(runId, {
    runtimeId,
    eventType = "run.progress",
    title,
    detail,
  }) {
    const run = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
    if (!run) throw new DomainError("Run 不存在", 404);
    if (run.status !== "running") throw new DomainError("Run 当前不接受事件", 409);
    if (run.runtime_id !== runtimeId) throw new DomainError("Run 不属于当前 Runtime", 403);
    this.db.prepare(`
      UPDATE runs SET last_event_at = ?, lease_expires_at = ? WHERE id = ?
    `).run(now(), new Date(Date.now() + 30_000).toISOString(), runId);
    return this.appendEvent({
      itemId: run.item_id,
      runId,
      actorId: run.actor_id,
      eventType,
      title: title || "Agent 正在执行",
      detail: detail || "本地 Runtime 已上报新的执行进度。",
    });
  }

  heartbeatRun(runId, runtimeId) {
    const run = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
    if (!run) throw new DomainError("Run 不存在", 404);
    if (run.runtime_id !== runtimeId) throw new DomainError("Run 不属于当前 Runtime", 403);
    if (run.status !== "running") {
      return { status: run.status, cancelRequested: true };
    }
    const timestamp = now();
    const leaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
    this.db.prepare(`
      UPDATE runs SET last_event_at = ?, lease_expires_at = ? WHERE id = ?
    `).run(timestamp, leaseExpiresAt, runId);
    return {
      status: "running",
      leaseExpiresAt,
      cancelRequested: run.cancel_requested === 1,
    };
  }

  failExpiredRunLeases() {
    const expired = this.db.prepare(`
      SELECT r.*, a.name AS actor_name
      FROM runs r JOIN actors a ON a.id = r.actor_id
      WHERE r.status = 'running' AND r.lease_expires_at IS NOT NULL AND r.lease_expires_at < ?
    `).all(now());
    for (const run of expired) {
      this.db.prepare(`
        UPDATE runs
        SET status = 'failed', verification_status = 'not_started',
            error = 'Runtime lease expired', completed_at = ?
        WHERE id = ? AND status = 'running'
      `).run(now(), run.id);
      this.db.prepare("UPDATE actors SET status = 'idle' WHERE id = ?").run(run.actor_id);
      this.appendEvent({
        itemId: run.item_id,
        runId: run.id,
        actorId: run.actor_id,
        eventType: "run.lease_expired",
        title: `${run.actor_name} 的本地执行已失联`,
        detail: "Run 心跳租约已过期。为避免重复副作用，系统不会自动重跑，需要人工确认后重试。",
      });
    }
    return expired.length;
  }

  completeRuntimeRun(runId, input) {
    const {
      success,
      summary = "",
      content = "",
      error = "",
      provider,
      providerStatus,
      completionSignal,
      sessionId = "",
      turnId = "",
      exitCode,
      protocolEvidence = {},
      runtimeId,
    } = input;
    const run = this.db.prepare(`
      SELECT r.*, i.title, a.name AS actor_name
      FROM runs r JOIN items i ON i.id = r.item_id JOIN actors a ON a.id = r.actor_id
      WHERE r.id = ?
    `).get(runId);
    if (!run) throw new DomainError("Run 不存在", 404);
    if (run.status !== "running") throw new DomainError("Run 当前不能结束", 409);
    if (run.runtime_id !== runtimeId) throw new DomainError("Run 不属于当前 Runtime", 403);
    if (success) validateCompletionEvidence(run, {
      provider,
      providerStatus,
      completionSignal,
      exitCode,
      protocolEvidence,
    });
    const artifactId = `artifact-${randomUUID()}`;
    const timestamp = now();
    withTransaction(this.db, () => {
      if (success) {
        this.db.prepare(`
          INSERT INTO artifacts (
            id, item_id, run_id, title, artifact_type, summary, content, created_at
          ) VALUES (?, ?, ?, ?, 'delivery', ?, ?, ?)
        `).run(
          artifactId,
          run.item_id,
          runId,
          `${run.title} · 执行报告`,
          summary || `${run.actor_name} 已完成当前 Run。`,
          content || `# ${run.title}\n\n本地 Agent Runtime 已完成执行。`,
          timestamp,
        );
        this.db.prepare(`
          UPDATE runs
          SET status = 'reported', verification_status = 'pending',
              provider_session_id = ?, provider_turn_id = ?,
              completion_signal = ?, provider_status = ?, exit_code = ?,
              protocol_evidence = ?, result_summary = ?, last_event_at = ?,
              lease_expires_at = NULL
          WHERE id = ?
        `).run(
          sessionId,
          turnId,
          completionSignal,
          providerStatus,
          exitCode,
          json(protocolEvidence),
          summary,
          timestamp,
          runId,
        );
        this.db.prepare(`
          UPDATE items SET status = 'in_review', updated_at = ? WHERE id = ?
        `).run(timestamp, run.item_id);
      } else {
        this.db.prepare(`
          UPDATE runs
          SET status = 'failed', completed_at = ?, error = ?,
              protocol_evidence = ?, lease_expires_at = NULL
          WHERE id = ?
        `).run(timestamp, error, json(protocolEvidence), runId);
      }
      this.db.prepare("UPDATE actors SET status = 'idle' WHERE id = ?").run(run.actor_id);
      this.appendEvent({
        itemId: run.item_id,
        runId,
        actorId: run.actor_id,
        eventType: success ? "run.reported" : "run.failed",
        title: success ? `${run.actor_name} 提交了待验收结果` : `${run.actor_name} 执行失败`,
        detail: success
          ? `${completionSignal} 与进程退出状态均已校验；这只证明 Agent Turn 结束，事项仍需人工验收。`
          : error || "本地 Agent CLI 未能完成当前 Run。",
      });
    });
    return camelize(this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId));
  }

  dispose() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.listeners.clear();
    this.db.close();
  }
}

export class DomainError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

function camelize(row) {
  if (!row) return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

function statusLabel(status) {
  return {
    todo: "待开始",
    in_progress: "执行中",
    in_review: "待验收",
    done: "已完成",
  }[status] ?? status;
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validateCompletionEvidence(
  run,
  { provider, providerStatus, completionSignal, exitCode, protocolEvidence },
) {
  if (provider !== run.provider) {
    throw new DomainError("Provider 身份与已认领 Run 不一致", 409);
  }
  if (exitCode !== 0) {
    throw new DomainError("Agent 进程未正常退出，不能提交成功结果", 409);
  }
  const expected = {
    codex: {
      signal: "turn.completed",
      status: "completed",
      evidenceKey: "sawTurnCompleted",
    },
    claude: {
      signal: "result.success",
      status: "success",
      evidenceKey: "sawResult",
    },
  }[run.provider];
  if (!expected) throw new DomainError("Run 使用了不支持的 Provider", 409);
  if (
    completionSignal !== expected.signal
    || providerStatus !== expected.status
    || protocolEvidence?.[expected.evidenceKey] !== true
  ) {
    throw new DomainError(
      `${run.provider} 缺少可信终态协议证据，不能进入验收`,
      409,
    );
  }
}

function buildRuntimePrompt(run) {
  const criteria = parseJson(run.acceptance_criteria);
  const criteriaText = criteria.length
    ? criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")
    : "1. 完成事项描述中的目标\n2. 汇报验证结果";
  return [
    `你正在作为 Silieco 中的 ${run.actor_name} 执行一个已获用户授权的事项。`,
    "",
    `事项：${run.title}`,
    `模板：${run.template}`,
    "",
    "描述：",
    run.description || "无补充描述",
    "",
    "验收条件：",
    criteriaText,
    "",
    "执行约束：",
    "- 只在当前工作目录内行动。",
    "- 不读取或外发凭据。",
    "- 不执行破坏性 Git 操作。",
    "- 完成后给出简洁结果、验证证据和未解决风险。",
  ].join("\n");
}
