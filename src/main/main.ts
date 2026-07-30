import path from "node:path";
import os from "node:os";

import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from "electron";

import {
  appSnapshotSchema,
  type AppSnapshot,
  type CommandResult,
  type PairingStartResult,
} from "../shared/ipc-contracts";
import { toRendererAccount } from "../shared/client-contracts";
import { getOrCreateDeviceIdentity } from "./device-identity";
import { PairingClient } from "./pairing-client";
import { SecureSessionStore } from "./secure-session-store";
import { DeviceConfigurationClient } from "./device-configuration-client";

const API_URL = "https://app.134134.ru";
const SITE_URL = "https://134134.ru";
let mainWindow: BrowserWindow | null = null;
let pendingPollSecret: string | null = null;
let snapshot: AppSnapshot = {
  version: app.getVersion(),
  platform: process.platform as AppSnapshot["platform"],
  paired: false,
  account: null,
  connectionStatus: "unpaired",
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#F7F7F2",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.join(__dirname, "../../../resources/icon.ico"),
    title: "134 Connect",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://134134.ru/")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, "../../renderer/index.html"),
    );
  }
}

async function restoreSession(): Promise<void> {
  const store = new SecureSessionStore(app.getPath("userData"));
  const session = await store.load();
  if (!session) return;

  snapshot = appSnapshotSchema.parse({
    ...snapshot,
    paired: true,
    account: {
      accountLabel: session.accountLabel,
      expiresAt: session.expiresAt,
    },
    connectionStatus: "disconnected",
  });
}

function registerIpc(): void {
  ipcMain.handle("app:get-snapshot", () => snapshot);

  ipcMain.handle(
    "app:start-pairing",
    async (): Promise<PairingStartResult> => {
      try {
        const identity = await getOrCreateDeviceIdentity(
          app.getPath("userData"),
        );
        const platform = process.platform === "darwin" ? "macos" : "windows";
        const response = await new PairingClient(API_URL).create(
          os.hostname().slice(0, 80) || "Компьютер",
          platform,
          identity.publicKey,
        );
        pendingPollSecret = response.pollSecret;
        return {
          ok: true,
          loginCode: response.loginCode,
          expiresAt: response.expiresAt,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Не удалось создать код входа",
        };
      }
    },
  );

  ipcMain.handle(
    "app:check-pairing",
    async (): Promise<CommandResult> => {
      try {
        if (!pendingPollSecret) {
          return {
            ok: false,
            message: "Сначала получите новый код входа.",
          };
        }
        const response = await new PairingClient(API_URL).poll(
          pendingPollSecret,
        );
        if (response.status !== "issued") {
          const messages = {
            pending: "Подтвердите код в Telegram и попробуйте ещё раз.",
            expired: "Срок кода закончился. Получите новый.",
            invalid: "Код больше не действует. Получите новый.",
            limit_reached:
              "Уже подключено 5 устройств. Удалите одно в Telegram.",
          };
          return { ok: false, message: messages[response.status] };
        }
        const store = new SecureSessionStore(app.getPath("userData"));
        await store.save(
          response.sessionToken,
          response.accountLabel,
          response.expiresAt,
        );
        snapshot = appSnapshotSchema.parse({
          ...snapshot,
          paired: true,
          account: toRendererAccount(response),
          connectionStatus: "disconnected",
        });
        pendingPollSecret = null;
        return { ok: true, snapshot };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Не удалось привязать устройство",
        };
      }
    },
  );

  ipcMain.handle("app:connect", async (): Promise<CommandResult> => {
    try {
      const store = new SecureSessionStore(app.getPath("userData"));
      const session = await store.load();
      if (!session) {
        return {
          ok: false,
          message: "Снова привяжите устройство в Telegram.",
        };
      }

      await new DeviceConfigurationClient(API_URL).get(
        session.sessionToken,
      );
      return {
        ok: false,
        message:
          "Конфигурация получена. Системный VPN-модуль ещё не активирован в этой preview-сборке.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить защищённую конфигурацию.",
      };
    }
  });

  ipcMain.handle("app:disconnect", (): CommandResult => ({
    ok: false,
    message: "Активного VPN-соединения нет.",
  }));

  ipcMain.handle("app:open-help", async (): Promise<void> => {
    await shell.openExternal(`${SITE_URL}/help`);
  });
}

app.whenReady().then(async () => {
  await restoreSession();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
