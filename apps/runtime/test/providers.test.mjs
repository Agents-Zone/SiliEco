import assert from "node:assert/strict";
import test from "node:test";
import {
  ProviderProtocolError,
  createClaudeProtocol,
  createCodexProtocol,
  detectProviders,
} from "../src/providers.mjs";

test("detects supported providers without inventing binaries", () => {
  const providers = detectProviders();
  assert.equal(Array.isArray(providers), true);
  for (const provider of providers) {
    assert.match(provider.id, /^(codex|claude)$/);
    assert.ok(provider.path);
    assert.ok(provider.version);
  }
});

test("Codex completion requires turn.completed in addition to exit code zero", () => {
  const incomplete = createCodexProtocol();
  incomplete.consume('{"type":"thread.started","thread_id":"thread-1"}');
  incomplete.consume('{"type":"turn.started","turn_id":"turn-1"}');
  assert.throws(
    () => incomplete.assertComplete({ exitCode: 0 }),
    ProviderProtocolError,
  );

  const complete = createCodexProtocol();
  complete.consume('{"type":"thread.started","thread_id":"thread-1"}');
  complete.consume('{"type":"turn.started","turn_id":"turn-1"}');
  complete.consume('{"type":"turn.completed","usage":{"input_tokens":10}}');
  assert.doesNotThrow(() => complete.assertComplete({ exitCode: 0 }));
  assert.equal(complete.evidence().completionSignal, "turn.completed");
});

test("Codex app-server notifications are scoped into the same terminal contract", () => {
  const protocol = createCodexProtocol();
  protocol.setSession("thread-app-server");
  protocol.consumeAppServer("turn/started", {
    threadId: "thread-app-server",
    turn: { id: "turn-app-server", status: "inProgress" },
  });
  protocol.consumeAppServer("item/completed", {
    threadId: "thread-app-server",
    turnId: "turn-app-server",
    item: { type: "agentMessage", text: "verified delivery" },
  });
  protocol.consumeAppServer("turn/completed", {
    threadId: "thread-app-server",
    turn: { id: "turn-app-server", status: "completed" },
  });

  assert.doesNotThrow(() => protocol.assertComplete({ exitCode: 0 }));
  assert.equal(protocol.finalMessage(), "verified delivery");
  assert.equal(protocol.evidence().sessionId, "thread-app-server");
  assert.equal(protocol.evidence().turnId, "turn-app-server");
});

test("Claude completion requires a successful terminal result event", () => {
  const incomplete = createClaudeProtocol();
  incomplete.consume('{"type":"system","session_id":"session-1"}');
  incomplete.consume('{"type":"assistant","message":{"content":[{"type":"text","text":"working"}]}}');
  assert.throws(
    () => incomplete.assertComplete({ exitCode: 0 }),
    /没有收到终态 result/,
  );

  const complete = createClaudeProtocol();
  complete.consume('{"type":"system","session_id":"session-1"}');
  complete.consume('{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"session-1"}');
  assert.doesNotThrow(() => complete.assertComplete({ exitCode: 0 }));
  assert.equal(complete.evidence().completionSignal, "result.success");
});
