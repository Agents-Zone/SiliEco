import assert from "node:assert/strict";
import test from "node:test";
import { SiliecoStore } from "../src/store.mjs";

test("creates an item with an append-only event", () => {
  const store = new SiliecoStore({ filename: ":memory:", runtimeDelay: 5 });
  const before = store.getBootstrap("user-demo");
  const item = store.createItem({
    title: "验证独立领域模型",
    description: "从需求事实源实现",
    assigneeId: "actor-builder",
    priority: "high",
    template: "软件开发",
    acceptanceCriteria: ["事件可追踪"],
  });
  const after = store.getBootstrap("user-demo");

  assert.equal(item.status, "todo");
  assert.equal(after.items.length, before.items.length + 1);
  assert.equal(after.events[0].eventType, "item.created");
  store.dispose();
});

test("requires review before an item can be completed", () => {
  const store = new SiliecoStore({ filename: ":memory:", runtimeDelay: 5 });
  assert.throws(
    () => store.updateItemStatus("item-runtime", "done"),
    /必须先进入人工验收/,
  );
  store.dispose();
});

test("runs pause for scoped approval and produce an artifact after approval", async () => {
  const store = new SiliecoStore({ filename: ":memory:", runtimeDelay: 5 });
  const run = store.createRun("item-runtime");

  const approval = store.getBootstrap("user-demo").approvals.find(
    (candidate) => candidate.itemId === "item-runtime" && candidate.status === "pending",
  );
  assert.equal(
    store.getBootstrap("user-demo").runs.find((candidate) => candidate.id === approval.runId).status,
    "waiting_approval",
  );

  store.decideApproval(approval.id, {
    decision: "approved",
    note: "仅批准本次交付写入",
  });
  const claimed = store.claimRun("runtime-test", [{ id: "codex", name: "Codex" }]);
  assert.equal(claimed.runId, run.id);
  store.appendRuntimeEvent(run.id, {
    runtimeId: "runtime-test",
    title: "Codex 正在验证",
    detail: "测试通过",
  });
  store.completeRuntimeRun(run.id, {
    runtimeId: "runtime-test",
    success: true,
    summary: "执行成功",
    content: "# Evidence\n\n测试通过",
    provider: "codex",
    providerStatus: "completed",
    completionSignal: "turn.completed",
    sessionId: "thread-test",
    turnId: "turn-test",
    exitCode: 0,
    protocolEvidence: {
      sawTurnStarted: true,
      sawTurnCompleted: true,
      eventCount: 3,
    },
  });

  const result = store.getBootstrap("user-demo");
  assert.equal(result.items.find((item) => item.id === "item-runtime").status, "in_review");
  assert.equal(result.runs.find((candidate) => candidate.id === run.id).status, "reported");
  assert.equal(result.artifacts.some((artifact) => artifact.runId === approval.runId), true);
  store.updateItemStatus("item-runtime", "done");
  const accepted = store.getBootstrap("user-demo");
  assert.equal(accepted.items.find((item) => item.id === "item-runtime").status, "done");
  assert.equal(
    accepted.runs.find((candidate) => candidate.id === run.id).verificationStatus,
    "accepted",
  );
  store.dispose();
});

test("rejects a clean process exit without provider terminal evidence", () => {
  const store = new SiliecoStore({ filename: ":memory:", runtimeDelay: 5 });
  const run = store.createRun("item-runtime");
  const approval = store.getBootstrap("user-demo").approvals.find(
    (candidate) => candidate.runId === run.id,
  );
  store.decideApproval(approval.id, { decision: "approved" });
  store.claimRun("runtime-test", [{ id: "codex", name: "Codex" }]);

  assert.throws(
    () => store.completeRuntimeRun(run.id, {
      runtimeId: "runtime-test",
      success: true,
      provider: "codex",
      providerStatus: "completed",
      completionSignal: "turn.completed",
      exitCode: 0,
      protocolEvidence: { sawTurnCompleted: false },
    }),
    /缺少可信终态协议证据/,
  );
  store.dispose();
});

test("registers and authenticates a user session", () => {
  const store = new SiliecoStore({ filename: ":memory:" });
  const session = store.registerUser({
    email: "new@silieco.local",
    password: "secure-pass",
    name: "新成员",
  });
  assert.equal(store.authenticateSession(session.token).email, "new@silieco.local");
  assert.equal(store.loginUser({
    email: "new@silieco.local",
    password: "secure-pass",
  }).user.name, "新成员");
  store.dispose();
});
