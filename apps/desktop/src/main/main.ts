import { app, BrowserWindow } from "electron";
import path from "node:path";

import { registerSecureStorageHandlers } from "./secure-store";

let mainWindow: BrowserWindow | null = null;
let loadingFailurePage = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

function rendererUrl() {
  return process.env.MST_WEB_URL ?? "http://localhost:3000";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadFailurePage(errorDescription: string) {
  if (!mainWindow) {
    return;
  }

  loadingFailurePage = true;

  const webUrl = rendererUrl();
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline';"
        />
        <title>MST Renderer Unavailable</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f8fafc;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }
          main {
            width: min(680px, calc(100vw - 48px));
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            background: white;
            padding: 28px;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
          }
          h1 { margin: 0 0 12px; font-size: 22px; }
          p { line-height: 1.55; color: #475569; }
          code {
            display: block;
            margin-top: 12px;
            padding: 12px;
            border-radius: 6px;
            background: #f1f5f9;
            color: #0f172a;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>MST renderer is not available</h1>
          <p>
            Electron tried to load the MST web renderer but could not reach it.
            Railway can host the API, but the desktop app still needs a web
            renderer URL.
          </p>
          <code>Renderer URL: ${escapeHtml(webUrl)}
Error: ${escapeHtml(errorDescription)}</code>
          <p>
            For local desktop development run <strong>npm run dev</strong> from
            the repository root. To use a hosted renderer, set
            <strong>MST_WEB_URL</strong> to that web URL before launching Electron.
          </p>
        </main>
      </body>
    </html>
  `;

  mainWindow
    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    .catch((error) => {
      console.error("Failed to load MST renderer failure page", error);
    });
}

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

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error("MST renderer failed to load", {
      errorCode,
      errorDescription,
      validatedUrl
    });

    if (!loadingFailurePage && !validatedUrl.startsWith("data:text/html")) {
      loadFailurePage(errorDescription);
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("MST renderer process exited", details);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log("MST renderer console", { level, message, line, sourceId });
  });

  const webUrl = rendererUrl();
  mainWindow.loadURL(webUrl).catch((error) => {
    if (!loadingFailurePage && error?.code !== "ERR_ABORTED") {
      console.error("Failed to load MST renderer", error);
      loadFailurePage(error instanceof Error ? error.message : String(error));
    }
  });
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerSecureStorageHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
