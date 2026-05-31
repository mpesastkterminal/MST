import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mstDesktop", {
  getDeviceId: () => ipcRenderer.invoke("mst:device-id:get"),
  getSession: () => ipcRenderer.invoke("mst:session:get"),
  setSession: (session: unknown) => ipcRenderer.invoke("mst:session:set", session),
  clearSession: () => ipcRenderer.invoke("mst:session:clear"),
  getTerminalName: () => ipcRenderer.invoke("mst:terminal-name:get"),
  setTerminalName: (terminalName: string) =>
    ipcRenderer.invoke("mst:terminal-name:set", terminalName)
});
