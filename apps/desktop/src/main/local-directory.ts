import { ipcMain, dialog, BrowserWindow } from "electron";
import { access, realpath, stat } from "fs/promises";
import { constants as fsConstants } from "fs";
import { basename, isAbsolute } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface PickDirectoryResult {
  ok: boolean;
  path?: string;
  basename?: string;
  /** Set when ok=false. "cancelled" = user dismissed; otherwise an error blurb. */
  reason?: "cancelled" | "no_window" | "error";
  error?: string;
}

export interface ValidateLocalDirectoryResult {
  ok: boolean;
  /** When ok=false, identifies which check failed so the renderer can render a
   *  specific message without parsing free-form text. */
  reason?:
    | "not_absolute"
    | "not_found"
    | "not_a_directory"
    | "not_readable"
    | "not_writable"
    | "not_git_repository"
    | "not_git_root"
    | "missing_origin"
    | "origin_mismatch"
    | "git_unavailable"
    | "error";
  error?: string;
  repositoryRoot?: string;
  originUrl?: string;
  branch?: string;
  dirty?: boolean;
}

async function validateLocalDirectory(
  path: string,
  expectedRepositoryUrl?: string,
): Promise<ValidateLocalDirectoryResult> {
  if (!path || !isAbsolute(path)) {
    return { ok: false, reason: "not_absolute" };
  }
  try {
    const st = await stat(path);
    if (!st.isDirectory()) return { ok: false, reason: "not_a_directory" };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error", error: errorMessage(err) };
  }
  try {
    await access(path, fsConstants.R_OK);
  } catch {
    return { ok: false, reason: "not_readable" };
  }
  try {
    await access(path, fsConstants.W_OK);
  } catch {
    return { ok: false, reason: "not_writable" };
  }
  if (!expectedRepositoryUrl) return { ok: true };
  try {
    const rootResult = await execFileAsync("git", [
      "-C",
      path,
      "rev-parse",
      "--show-toplevel",
    ]);
    const repositoryRoot = rootResult.stdout.trim();
    if (!repositoryRoot) return { ok: false, reason: "not_git_repository" };
    const [selectedRealPath, repositoryRealPath] = await Promise.all([
      realpath(path),
      realpath(repositoryRoot),
    ]);
    if (!sameFilesystemPath(selectedRealPath, repositoryRealPath)) {
      return {
        ok: false,
        reason: "not_git_root",
        repositoryRoot,
      };
    }
    let originUrl = "";
    try {
      const originResult = await execFileAsync("git", [
        "-C",
        path,
        "remote",
        "get-url",
        "origin",
      ]);
      originUrl = originResult.stdout.trim();
    } catch {
      return { ok: false, reason: "missing_origin", repositoryRoot };
    }
    if (canonicalGitRemote(originUrl) !== canonicalGitRemote(expectedRepositoryUrl)) {
      return {
        ok: false,
        reason: "origin_mismatch",
        repositoryRoot,
        originUrl,
      };
    }
    const [branchResult, statusResult] = await Promise.all([
      execFileAsync("git", ["-C", path, "branch", "--show-current"]),
      execFileAsync("git", ["-C", path, "status", "--porcelain"]),
    ]);
    return {
      ok: true,
      repositoryRoot,
      originUrl,
      branch: branchResult.stdout.trim(),
      dirty: statusResult.stdout.trim().length > 0,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, reason: "git_unavailable" };
    }
    return { ok: false, reason: "not_git_repository", error: errorMessage(err) };
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function canonicalGitRemote(raw: string): string {
  const value = raw.trim();
  const scp = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (!value.includes("://") && scp?.[1] && scp[2]) {
    return normalizeGitRemoteParts(scp[1], scp[2]);
  }
  try {
    const parsed = new URL(value);
    return normalizeGitRemoteParts(parsed.hostname, parsed.pathname);
  } catch {
    return value.replace(/\/$/, "").replace(/\.git$/, "");
  }
}

function normalizeGitRemoteParts(host: string, path: string): string {
  return `${host.trim().toLowerCase()}/${path
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/, "")
    .toLowerCase()}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function setupLocalDirectory(
  windowGetter: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "local-directory:pick",
    async (event, defaultPath?: string): Promise<PickDirectoryResult> => {
      const win =
        BrowserWindow.fromWebContents(event.sender) ?? windowGetter();
      if (!win) return { ok: false, reason: "no_window" };
      try {
        const result = await dialog.showOpenDialog(win, {
          // Multiple-selection is intentionally disabled — a project_resource
          // points at a single directory, and the create flow expects one
          // path per click. Multi-add would have to be a separate UX.
          properties: ["openDirectory", "createDirectory"],
          ...(defaultPath ? { defaultPath } : {}),
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false, reason: "cancelled" };
        }
        const picked = result.filePaths[0];
        if (!picked) return { ok: false, reason: "cancelled" };
        return { ok: true, path: picked, basename: basename(picked) };
      } catch (err) {
        return { ok: false, reason: "error", error: errorMessage(err) };
      }
    },
  );

  ipcMain.handle(
    "local-directory:validate",
    (_event, path: string, expectedRepositoryUrl?: string): Promise<ValidateLocalDirectoryResult> =>
      validateLocalDirectory(path, expectedRepositoryUrl),
  );
}
