import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { detectProviders, executeProvider } from "./providers.mjs";

export class LocalRuntime {
  constructor({
    serverUrl = "http://localhost:8787",
    token,
    workdir = process.cwd(),
    pollIntervalMs = 2_500,
    onStatus = () => {},
  } = {}) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = token;
    this.workdir = workdir;
    this.pollIntervalMs = pollIntervalMs;
    this.onStatus = onStatus;
    this.runtimeId = `runtime-${randomUUID()}`;
    this.providers = [];
    this.running = false;
    this.activeRun = null;
    this.timer = null;
    this.controller = null;
  }

  async start() {
    if (this.running) return this.status();
    if (!this.token) throw new Error("Runtime token is required");
    this.providers = detectProviders();
    this.running = true;
    await this.heartbeat();
    this.onStatus(this.status());
    this.loop();
    return this.status();
  }

  async stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = null;
    this.activeRun = null;
    this.onStatus(this.status());
  }

  status() {
    return {
      running: this.running,
      runtimeId: this.runtimeId,
      serverUrl: this.serverUrl,
      workdir: this.workdir,
      providers: this.providers,
      activeRun: this.activeRun,
    };
  }

  async loop() {
    if (!this.running) return;
    try {
      await this.heartbeat();
      if (!this.activeRun) {
        const result = await this.request("/api/runtime/claim", {
          method: "POST",
          body: {
            runtimeId: this.runtimeId,
            providers: this.providers,
          },
        });
        if (result.run) await this.execute(result.run);
      }
    } catch (error) {
      this.onStatus({ ...this.status(), error: error.message });
    } finally {
      if (this.running) {
        this.timer = setTimeout(() => this.loop(), this.pollIntervalMs);
      }
    }
  }

  async heartbeat() {
    const result = await this.request("/api/runtime/heartbeat", {
      method: "POST",
      body: {
        runtimeId: this.runtimeId,
        name: "Silieco Desktop Runtime",
        deviceName: hostname(),
        providers: this.providers,
      },
    });
    this.runtimeId = result.runtimeId;
    return result;
  }

  async execute(run) {
    this.activeRun = run;
    this.controller = new AbortController();
    this.onStatus(this.status());
    let lastEventAt = 0;
    const leaseTimer = setInterval(() => {
      this.request(`/api/runtime/runs/${run.runId}/heartbeat`, {
        method: "POST",
        body: { runtimeId: this.runtimeId },
      }).then((heartbeat) => {
        if (heartbeat.cancelRequested) this.controller?.abort();
      }).catch((error) => {
        this.onStatus({ ...this.status(), error: `Run 心跳失败：${error.message}` });
      });
    }, 8_000);
    try {
      const result = await executeProvider({
        provider: run.provider,
        prompt: run.prompt,
        workdir: this.workdir,
        signal: this.controller.signal,
        onEvent: (event) => {
          const timestamp = Date.now();
          if (timestamp - lastEventAt < 700) return;
          lastEventAt = timestamp;
          this.request(`/api/runtime/runs/${run.runId}/events`, {
            method: "POST",
            body: {
              runtimeId: this.runtimeId,
              eventType: "run.progress",
              ...event,
            },
          }).catch(() => {});
        },
      });
      await this.request(`/api/runtime/runs/${run.runId}/complete`, {
        method: "POST",
        body: {
          runtimeId: this.runtimeId,
          success: true,
          summary: result.summary || `${run.actorName} 已完成执行`,
          provider: run.provider,
          providerStatus: result.providerStatus,
          completionSignal: result.completionSignal,
          sessionId: result.sessionId,
          turnId: result.turnId,
          exitCode: result.exitCode,
          protocolEvidence: result.protocolEvidence,
          content: [
            `# ${run.actorName} 执行报告`,
            "",
            result.summary || "执行完成。",
            "",
            "## Runtime",
            "",
            `- Provider: ${run.provider}`,
            `- Workdir: ${this.workdir}`,
            `- Completion signal: ${result.completionSignal}`,
            `- Provider status: ${result.providerStatus}`,
            `- Session: ${result.sessionId || "未提供"}`,
            `- Exit code: ${result.exitCode}`,
          ].join("\n"),
        },
      });
    } catch (error) {
      await this.request(`/api/runtime/runs/${run.runId}/complete`, {
        method: "POST",
        body: {
          runtimeId: this.runtimeId,
          success: false,
          error: error.message,
          protocolEvidence: error.evidence ?? {},
        },
      }).catch(() => {});
      this.onStatus({ ...this.status(), error: error.message });
    } finally {
      clearInterval(leaseTimer);
      this.activeRun = null;
      this.controller = null;
      this.onStatus(this.status());
    }
  }

  async request(path, { method = "GET", body } = {}) {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }
}
