import { app, BrowserWindow } from "electron";
import path from "node:path";

import { registerSecureStorageHandlers } from "./secure-store";

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "MST",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });

  const webUrl = process.env.MST_WEB_URL ?? "http://localhost:3000";
  mainWindow.loadURL(webUrl);
}

app.whenReady().then(() => {
  registerSecureStorageHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
