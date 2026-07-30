import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError, SiliecoStore } from "./store.mjs";

const port = Number(process.env.PORT || 8787);
const databaseFile = process.env.SILIECO_DB
  || fileURLToPath(new URL("../../../.data/silieco.db", import.meta.url));
const store = new SiliecoStore({ filename: databaseFile });
const clients = new Set();
const webDist = resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));

store.subscribe((event) => {
  const payload = `event: workspace\ndata: ${JSON.stringify(event)}\n\n`;
  for (const response of clients) response.write(payload);
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, { status: "ok", service: "silieco-api" });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const session = store.registerUser(await readJson(request));
      setSessionCookie(response, session.token, session.expiresAt);
      sendJson(response, 201, { user: session.user, expiresAt: session.expiresAt });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const session = store.loginUser(await readJson(request));
      setSessionCookie(response, session.token, session.expiresAt);
      sendJson(response, 200, { user: session.user, expiresAt: session.expiresAt });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      store.logoutSession(sessionToken(request));
      clearSessionCookie(response);
      sendJson(response, 200, { ok: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const user = requireUser(request);
      sendJson(response, 200, { user });
      return;
    }

    if (url.pathname.startsWith("/api/runtime/")) {
      const runtimeUser = requireRuntime(request);
      if (request.method === "POST" && url.pathname === "/api/runtime/heartbeat") {
        sendJson(response, 200, store.heartbeatRuntime(runtimeUser.userId, await readJson(request)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/runtime/claim") {
        const body = await readJson(request);
        sendJson(response, 200, {
          run: store.claimRun(body.runtimeId, body.providers, runtimeUser.userId),
        });
        return;
      }
      const runtimeEventMatch = url.pathname.match(/^\/api\/runtime\/runs\/([^/]+)\/events$/);
      if (request.method === "POST" && runtimeEventMatch) {
        sendJson(
          response,
          201,
          store.appendRuntimeEvent(runtimeEventMatch[1], await readJson(request)),
        );
        return;
      }
      const runtimeRunHeartbeatMatch = url.pathname.match(
        /^\/api\/runtime\/runs\/([^/]+)\/heartbeat$/,
      );
      if (request.method === "POST" && runtimeRunHeartbeatMatch) {
        const body = await readJson(request);
        sendJson(
          response,
          200,
          store.heartbeatRun(runtimeRunHeartbeatMatch[1], body.runtimeId),
        );
        return;
      }
      const runtimeCompleteMatch = url.pathname.match(/^\/api\/runtime\/runs\/([^/]+)\/complete$/);
      if (request.method === "POST" && runtimeCompleteMatch) {
        sendJson(
          response,
          200,
          store.completeRuntimeRun(runtimeCompleteMatch[1], await readJson(request)),
        );
        return;
      }
      sendJson(response, 404, { error: "Runtime endpoint not found" });
      return;
    }

    const user = url.pathname.startsWith("/api/") ? requireUser(request) : null;
    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      sendJson(response, 200, store.getBootstrap(user.id));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      response.write(`event: connected\ndata: {"connected":true}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/runtime-tokens") {
      sendJson(response, 201, store.createRuntimeToken(user.id));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/items") {
      const body = await readJson(request);
      if (!body.title?.trim()) throw new DomainError("请输入事项标题", 400);
      sendJson(response, 201, store.createItem(body));
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/status$/);
    if (request.method === "PATCH" && statusMatch) {
      const body = await readJson(request);
      sendJson(response, 200, store.updateItemStatus(statusMatch[1], body.status));
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/items\/([^/]+)\/runs$/);
    if (request.method === "POST" && runMatch) {
      sendJson(response, 201, store.createRun(runMatch[1]));
      return;
    }

    const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/decision$/);
    if (request.method === "POST" && approvalMatch) {
      const body = await readJson(request);
      sendJson(response, 200, store.decideApproval(approvalMatch[1], body));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API endpoint not found" });
      return;
    }

    if (serveStatic(url.pathname, response)) return;
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof DomainError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "服务暂时不可用" });
  }
});

const heartbeat = setInterval(() => {
  for (const response of clients) response.write(": heartbeat\n\n");
}, 20_000);

server.listen(port, () => {
  console.log(`Silieco API listening on http://localhost:${port}`);
});

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sessionToken(request) {
  const cookies = Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
  return cookies.silieco_session || "";
}

function requireUser(request) {
  const user = store.authenticateSession(sessionToken(request));
  if (!user) throw new DomainError("请先登录", 401);
  return user;
}

function requireRuntime(request) {
  const authorization = String(request.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const user = store.authenticateRuntimeToken(token);
  if (!user) throw new DomainError("Runtime 凭据无效", 401);
  return user;
}

function setSessionCookie(response, token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `silieco_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    "silieco_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
  );
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new DomainError("请求体过大", 413);
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("请求体不是有效 JSON", 400);
  }
}

function serveStatic(pathname, response) {
  if (!existsSync(webDist)) return false;
  const decoded = decodeURIComponent(pathname);
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const requestedPath = resolve(webDist, normalize(relativePath));
  if (!requestedPath.startsWith(webDist)) return false;
  const filePath = existsSync(requestedPath) && statSync(requestedPath).isFile()
    ? requestedPath
    : join(webDist, "index.html");
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }[extname(filePath)] ?? "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
  return true;
}

function shutdown() {
  clearInterval(heartbeat);
  for (const response of clients) response.end();
  store.dispose();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
