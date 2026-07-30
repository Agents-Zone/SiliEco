import { spawn, spawnSync } from "node:child_process";

export class ProviderProtocolError extends Error {
  constructor(message, evidence = {}) {
    super(message);
    this.name = "ProviderProtocolError";
    this.evidence = evidence;
  }
}

export function detectProviders() {
  return [
    detect("codex", "Codex"),
    detect("claude", "Claude Code"),
  ].filter(Boolean);
}

function detect(command, name) {
  const resolver = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(resolver, [command], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const path = result.stdout.trim().split(/\r?\n/)[0];
  const version = spawnSync(command, ["--version"], { encoding: "utf8" });
  return {
    id: command,
    name,
    path,
    version: version.stdout.trim() || version.stderr.trim() || "unknown",
  };
}

export async function executeProvider({
  provider,
  prompt,
  workdir,
  onEvent,
  signal,
}) {
  if (provider === "codex") {
    return executeCodex({ prompt, workdir, onEvent, signal });
  }
  if (provider === "claude") {
    return executeClaude({ prompt, workdir, onEvent, signal });
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function executeCodex({ prompt, workdir, onEvent, signal }) {
  const protocol = createCodexProtocol();
  const processResult = await executeCodexAppServer({
    prompt,
    workdir,
    onEvent,
    signal,
    protocol,
  });
  return {
    ...processResult,
    summary: protocol.finalMessage(),
    ...protocol.evidence(),
  };
}

async function executeClaude({ prompt, workdir, onEvent, signal }) {
  const protocol = createClaudeProtocol();
  const processResult = await spawnAndCollect({
    command: "claude",
    args: [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
    ],
    prompt,
    workdir,
    onEvent,
    signal,
    protocol,
  });
  return {
    ...processResult,
    summary: protocol.finalMessage(),
    ...protocol.evidence(),
  };
}

function spawnAndCollect({
  command,
  args,
  prompt,
  workdir,
  onEvent,
  signal,
  protocol,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workdir,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let buffer = "";
    let settled = false;

    const finish = (operation) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      operation();
    };
    const abort = () => terminateProcessTree(child);
    signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = protocol.consume(line);
        if (event) onEvent(event);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16_384);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code, processSignal) => {
      if (buffer.trim()) {
        const event = protocol.consume(buffer);
        if (event) onEvent(event);
      }
      try {
        protocol.assertComplete({
          exitCode: code,
          signal: processSignal,
          aborted: signal?.aborted === true,
          stderr: stderr.trim(),
        });
        finish(() => resolve({
          success: true,
          exitCode: code,
          stderr: stderr.trim(),
        }));
      } catch (error) {
        finish(() => reject(error));
      }
    });

    child.stdin.end(prompt);
  });
}

function executeCodexAppServer({ prompt, workdir, onEvent, signal, protocol }) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "app-server",
      "--stdio",
      "-c",
      'approval_policy="never"',
      "-c",
      'sandbox_mode="workspace-write"',
    ], {
      cwd: workdir,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let nextId = 1;
    let settled = false;
    let terminalObserved = false;
    let inactivityTimer;
    const pending = new Map();

    const resetInactivity = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        finishError(new ProviderProtocolError(
          "Codex app-server 长时间没有语义事件，当前 Turn 已停止",
          protocol.evidence(),
        ));
      }, 5 * 60_000);
    };
    const cleanup = () => {
      clearTimeout(inactivityTimer);
      clearTimeout(shutdownTimer);
      signal?.removeEventListener("abort", abort);
      for (const request of pending.values()) clearTimeout(request.timer);
      pending.clear();
    };
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      terminateProcessTree(child);
      reject(error);
    };
    const abort = () => finishError(new ProviderProtocolError("Codex 执行已被取消"));
    signal?.addEventListener("abort", abort, { once: true });

    let shutdownTimer;
    let exitCode = null;
    let exitSignal = null;
    const waitForExit = () => new Promise((done) => {
      if (exitCode !== null || exitSignal !== null) {
        done();
        return;
      }
      child.once("close", () => done());
      shutdownTimer = setTimeout(() => {
        terminateProcessTree(child);
      }, 5_000);
    });
    const request = (method, params, timeoutMs = 20_000) => new Promise((requestResolve, requestReject) => {
      const id = nextId;
      nextId += 1;
      const timer = setTimeout(() => {
        pending.delete(id);
        requestReject(new ProviderProtocolError(`Codex ${method} 握手超时`));
      }, timeoutMs);
      pending.set(id, { resolve: requestResolve, reject: requestReject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
    const notify = (method, params = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    };

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16_384);
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let payload;
        try {
          payload = JSON.parse(line);
        } catch {
          protocol.consume(line);
          continue;
        }
        if (payload.id !== undefined) {
          const waiting = pending.get(payload.id);
          if (!waiting) continue;
          pending.delete(payload.id);
          clearTimeout(waiting.timer);
          if (payload.error) waiting.reject(new ProviderProtocolError(
            payload.error.message || "Codex RPC 请求失败",
          ));
          else waiting.resolve(payload.result);
          continue;
        }
        if (!payload.method) continue;
        resetInactivity();
        const event = protocol.consumeAppServer(payload.method, payload.params ?? {});
        if (event) onEvent(event);
        if (payload.method === "error" && payload.params?.willRetry !== true) {
          finishError(new ProviderProtocolError(
            payload.params?.error?.message
              || payload.params?.message
              || "Codex 返回终态协议错误",
            protocol.evidence(),
          ));
          continue;
        }
        if (
          payload.method === "turn/completed"
          && protocol.evidence().protocolEvidence.sawTurnCompleted
        ) {
          terminalObserved = true;
        }
      }
    });
    child.on("error", finishError);
    child.on("close", (code, processSignal) => {
      exitCode = code;
      exitSignal = processSignal;
      if (!terminalObserved && !settled) {
        finishError(new ProviderProtocolError(
          stderr.trim() || `Codex app-server 在 Turn 完成前退出（code=${code}）`,
          protocol.evidence(),
        ));
      }
    });

    (async () => {
      try {
        resetInactivity();
        await request("initialize", {
          clientInfo: { name: "silieco-desktop", title: "Silieco Desktop", version: "0.1.0" },
          capabilities: { experimentalApi: true },
        });
        notify("initialized");
        const threadResult = await request("thread/start", {
          cwd: workdir,
          approvalPolicy: "never",
          sandbox: "workspace-write",
          experimentalRawEvents: false,
          persistExtendedHistory: true,
        });
        const threadId = threadResult?.thread?.id || threadResult?.threadId || "";
        if (!threadId) throw new ProviderProtocolError("Codex thread/start 未返回 Thread ID");
        protocol.setSession(threadId);
        onEvent({ title: "Codex Thread 已建立", detail: `Session ${threadId.slice(0, 12)}…` });

        await request("turn/start", {
          threadId,
          input: [{ type: "text", text: prompt }],
        });

        while (!terminalObserved && !settled) {
          if (signal?.aborted) throw new ProviderProtocolError("Codex 执行已被取消");
          await delay(50);
        }
        if (settled) return;
        protocol.assertComplete({ exitCode: 0 });
        child.stdin.end();
        await waitForExit();
        if (exitCode !== 0 && exitSignal == null) {
          throw new ProviderProtocolError(
            stderr.trim() || `Codex app-server 清理失败（code=${exitCode}）`,
            protocol.evidence(),
          );
        }
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ success: true, exitCode: 0, stderr: stderr.trim() });
        }
      } catch (error) {
        finishError(error);
      }
    })();
  });
}

export function createCodexProtocol() {
  const state = {
    eventCount: 0,
    invalidEventCount: 0,
    sawTurnStarted: false,
    sawTurnCompleted: false,
    terminalStatus: "",
    sessionId: "",
    turnId: "",
    lastAgentMessage: "",
  };
  return {
    consume(line) {
      const payload = parseLine(line);
      if (!payload) {
        state.invalidEventCount += 1;
        return null;
      }
      state.eventCount += 1;
      if (payload.type === "thread.started") {
        state.sessionId = payload.thread_id || payload.thread?.id || "";
      }
      if (payload.type === "turn.started") {
        state.sawTurnStarted = true;
        state.turnId = payload.turn_id || payload.turn?.id || "";
        return { title: "Codex 会话已启动", detail: "已收到 turn.started，开始执行事项。" };
      }
      if (payload.type === "item.started" && payload.item?.type === "command_execution") {
        return {
          title: "Codex 正在执行命令",
          detail: compact(payload.item.command || "执行工作区操作"),
        };
      }
      if (payload.type === "item.completed" && payload.item?.type === "agent_message") {
        state.lastAgentMessage = payload.item.text || state.lastAgentMessage;
        return {
          title: "Codex 更新了执行进度",
          detail: compact(payload.item.text || "已完成一个执行步骤"),
        };
      }
      if (payload.type === "turn.completed") {
        state.sawTurnCompleted = true;
        state.terminalStatus = payload.turn?.status || payload.status || "completed";
        state.turnId = payload.turn_id || payload.turn?.id || state.turnId;
        return {
          eventType: "run.provider_completed",
          title: "Codex 已结束当前 Turn",
          detail: `终态：${state.terminalStatus}；等待 Runtime 校验进程退出。`,
        };
      }
      if (payload.type === "turn.failed" || payload.type === "error") {
        state.terminalStatus = "failed";
      }
      return null;
    },
    consumeAppServer(method, params) {
      if (params.threadId && state.sessionId && params.threadId !== state.sessionId) {
        return null;
      }
      const notificationTurnId = params.turnId || params.turn?.id || "";
      if (
        method !== "turn/started"
        && notificationTurnId
        && state.turnId
        && notificationTurnId !== state.turnId
      ) {
        return null;
      }
      if (method === "turn/started") {
        return this.consume(JSON.stringify({
          type: "turn.started",
          turn: params.turn,
          turn_id: params.turn?.id,
        }));
      }
      if (method === "turn/completed") {
        return this.consume(JSON.stringify({
          type: "turn.completed",
          turn: params.turn,
          turn_id: params.turn?.id,
        }));
      }
      if (method === "item/started" || method === "item/completed") {
        const rawItem = params.item ?? {};
        const itemType = rawItem.type === "commandExecution"
          ? "command_execution"
          : rawItem.type === "agentMessage"
            ? "agent_message"
            : rawItem.type;
        return this.consume(JSON.stringify({
          type: method.replace("/", "."),
          item: {
            ...rawItem,
            type: itemType,
            text: rawItem.text || rawItem.content?.[0]?.text,
          },
        }));
      }
      if (method === "error") {
        return this.consume(JSON.stringify({ type: "error", ...params }));
      }
      return null;
    },
    setSession(sessionId) {
      state.sessionId = sessionId;
    },
    assertComplete(process) {
      assertProcess(process, "Codex");
      if (!state.sawTurnCompleted) {
        throw new ProviderProtocolError(
          "Codex 进程已退出，但没有收到 turn.completed；不能判定任务完成",
          this.evidence(),
        );
      }
      if (!["", "completed"].includes(state.terminalStatus)) {
        throw new ProviderProtocolError(
          `Codex Turn 终态为 ${state.terminalStatus}`,
          this.evidence(),
        );
      }
    },
    finalMessage() {
      return state.lastAgentMessage;
    },
    evidence() {
      return {
        completionSignal: "turn.completed",
        providerStatus: state.terminalStatus || "unknown",
        sessionId: state.sessionId,
        turnId: state.turnId,
        protocolEvidence: {
          eventCount: state.eventCount,
          invalidEventCount: state.invalidEventCount,
          sawTurnStarted: state.sawTurnStarted,
          sawTurnCompleted: state.sawTurnCompleted,
        },
      };
    },
  };
}

export function createClaudeProtocol() {
  const state = {
    eventCount: 0,
    invalidEventCount: 0,
    sawResult: false,
    resultSubtype: "",
    resultIsError: false,
    resultText: "",
    sessionId: "",
    lastAssistantMessage: "",
  };
  return {
    consume(line) {
      const payload = parseLine(line);
      if (!payload) {
        state.invalidEventCount += 1;
        return null;
      }
      state.eventCount += 1;
      if (payload.type === "system") {
        state.sessionId = payload.session_id || state.sessionId;
        return { title: "Claude Code 会话已启动", detail: "已取得本地 Session，开始执行事项。" };
      }
      if (payload.type === "assistant") {
        const blocks = payload.message?.content ?? [];
        const texts = blocks
          .filter((block) => block.type === "text" && block.text)
          .map((block) => block.text);
        const tool = blocks.find((block) => block.type === "tool_use");
        if (texts.length) state.lastAssistantMessage = texts.join("\n");
        if (tool) {
          return {
            title: `Claude Code 调用 ${tool.name}`,
            detail: compact(JSON.stringify(tool.input ?? {})),
          };
        }
        if (texts.length) {
          return { title: "Claude Code 更新了执行进度", detail: compact(texts.join(" ")) };
        }
      }
      if (payload.type === "result") {
        state.sawResult = true;
        state.resultSubtype = payload.subtype || "";
        state.resultIsError = payload.is_error === true;
        state.resultText = typeof payload.result === "string" ? payload.result : "";
        state.sessionId = payload.session_id || state.sessionId;
        return {
          eventType: "run.provider_completed",
          title: "Claude Code 已返回终态 Result",
          detail: `终态：${state.resultSubtype || "unknown"}；等待 Runtime 校验进程退出。`,
        };
      }
      return null;
    },
    assertComplete(process) {
      assertProcess(process, "Claude Code");
      if (!state.sawResult) {
        throw new ProviderProtocolError(
          "Claude Code 进程已退出，但没有收到终态 result；不能判定任务完成",
          this.evidence(),
        );
      }
      if (state.resultIsError || state.resultSubtype !== "success") {
        throw new ProviderProtocolError(
          state.resultText || `Claude Code Result 终态为 ${state.resultSubtype || "unknown"}`,
          this.evidence(),
        );
      }
    },
    finalMessage() {
      return state.resultText || state.lastAssistantMessage;
    },
    evidence() {
      return {
        completionSignal: "result.success",
        providerStatus: state.resultIsError ? "failed" : state.resultSubtype || "unknown",
        sessionId: state.sessionId,
        protocolEvidence: {
          eventCount: state.eventCount,
          invalidEventCount: state.invalidEventCount,
          sawResult: state.sawResult,
          resultIsError: state.resultIsError,
          resultSubtype: state.resultSubtype,
        },
      };
    },
  };
}

function assertProcess({ exitCode, signal, aborted, stderr }, provider) {
  if (aborted) {
    throw new ProviderProtocolError(`${provider} 执行已被取消`);
  }
  if (exitCode !== 0) {
    throw new ProviderProtocolError(
      stderr || `${provider} 进程异常退出（code=${exitCode}, signal=${signal || "none"}）`,
    );
  }
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // The process may already have reached a terminal protocol event and exited.
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function compact(value) {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 240);
}
