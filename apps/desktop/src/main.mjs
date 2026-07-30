import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalRuntime } from "@silieco/runtime";

const directory = fileURLToPath(new URL(".", import.meta.url));
let window;
let runtime;
let runtimeStatus = { running: false, providers: [], activeRun: null };

function createWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1040,
    minHeight: 700,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#f1f3f7",
    webPreferences: {
      preload: join(directory, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const appUrl = process.env.SILIECO_APP_URL || "http://localhost:5173";
  window.loadURL(appUrl);
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("runtime:status", () => runtimeStatus);
ipcMain.handle("runtime:select-workdir", async () => {
  const result = await dialog.showOpenDialog(window, {
    title: "选择 Agent 工作目录",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("runtime:connect", async (_event, config) => {
  await runtime?.stop();
  runtime = new LocalRuntime({
    serverUrl: config.serverUrl,
    token: config.token,
    workdir: config.workdir,
    onStatus: (status) => {
      runtimeStatus = status;
      window?.webContents.send("runtime:status-changed", status);
    },
  });
  runtimeStatus = await runtime.start();
  return runtimeStatus;
});
ipcMain.handle("runtime:disconnect", async () => {
  await runtime?.stop();
  runtime = null;
  runtimeStatus = { running: false, providers: [], activeRun: null };
  return runtimeStatus;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await runtime?.stop();
  if (process.platform !== "darwin") app.quit();
});

