import { app, ipcMain, safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const sessionFileName = "mst-session.bin";
const deviceFileName = "mst-device-id.txt";

function storageDirectory() {
  const directory = path.join(app.getPath("userData"), "secure");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function sessionFilePath() {
  return path.join(storageDirectory(), sessionFileName);
}

function deviceFilePath() {
  return path.join(storageDirectory(), deviceFileName);
}

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron safeStorage encryption is not available.");
  }
}

function getDeviceId() {
  const filePath = deviceFilePath();

  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8").trim();
  }

  const deviceId = randomUUID();
  writeFileSync(filePath, deviceId, { encoding: "utf8" });
  return deviceId;
}

function getSession() {
  const filePath = sessionFilePath();

  if (!existsSync(filePath)) {
    return null;
  }

  assertEncryptionAvailable();
  const encryptedSession = readFileSync(filePath);
  const sessionJson = safeStorage.decryptString(encryptedSession);
  return JSON.parse(sessionJson);
}

function setSession(session: unknown) {
  assertEncryptionAvailable();
  const encryptedSession = safeStorage.encryptString(JSON.stringify(session));
  writeFileSync(sessionFilePath(), encryptedSession);
}

function clearSession() {
  const filePath = sessionFilePath();

  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

export function registerSecureStorageHandlers() {
  ipcMain.handle("mst:device-id:get", () => getDeviceId());
  ipcMain.handle("mst:session:get", () => getSession());
  ipcMain.handle("mst:session:set", (_event, session) => setSession(session));
  ipcMain.handle("mst:session:clear", () => clearSession());
}
