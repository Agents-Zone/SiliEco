import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "dev:api"], { stdio: "inherit", shell: true }),
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: true }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 150).unref();
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0 && signal !== "SIGTERM") {
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

