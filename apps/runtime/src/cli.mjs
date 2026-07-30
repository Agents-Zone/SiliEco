import { LocalRuntime } from "./runtime.mjs";

const token = process.env.SILIECO_RUNTIME_TOKEN;
if (!token) {
  console.error("Set SILIECO_RUNTIME_TOKEN before starting the runtime.");
  process.exit(1);
}

const runtime = new LocalRuntime({
  token,
  serverUrl: process.env.SILIECO_SERVER_URL || "http://localhost:8787",
  workdir: process.env.SILIECO_WORKDIR || process.cwd(),
  onStatus: (status) => {
    const providers = status.providers?.map((provider) => provider.name).join(", ") || "none";
    console.log(`[runtime] running=${status.running} providers=${providers} active=${status.activeRun?.runId || "none"}`);
    if (status.error) console.error(`[runtime] ${status.error}`);
  },
});

await runtime.start();

const shutdown = async () => {
  await runtime.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

