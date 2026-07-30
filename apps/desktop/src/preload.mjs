import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("siliecoDesktop", {
  isDesktop: true,
  runtime: {
    status: () => ipcRenderer.invoke("runtime:status"),
    selectWorkdir: () => ipcRenderer.invoke("runtime:select-workdir"),
    connect: (config) => ipcRenderer.invoke("runtime:connect", config),
    disconnect: () => ipcRenderer.invoke("runtime:disconnect"),
    onStatusChanged: (listener) => {
      const handler = (_event, status) => listener(status);
      ipcRenderer.on("runtime:status-changed", handler);
      return () => ipcRenderer.removeListener("runtime:status-changed", handler);
    },
  },
});

