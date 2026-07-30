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
import { SubscriptionClient } from "./subscription-client";
import {
  buildXrayConfiguration,
  parseSubscription,
} from "./subscription-parser";
import { XrayConfigurationValidator } from "./xray-configuration-validator";
import { ElevatedTunnelCoordinator } from "./elevated-tunnel-coordinator";
import { parseTunnelHelperArguments } from "./tunnel-helper-protocol";
import { runElevatedTunnelHelper } from "./elevated-tunnel-helper";

const API_URL = "https://app.134134.ru";
const SITE_URL = "https://134134.ru";
let mainWindow: BrowserWindow | null = null;
let pendingPollSecret: string | null = null;
let tunnelCoordinator: ElevatedTunnelCoordinator | null = null;
let quitAfterTunnelStop = false;
let snapshot: AppSnapshot = {
  version: app.getVersion(),
  platform: process.platform as AppSnapshot["platform"],
  paired: false,
  account: null,
  connectionStatus: "unpaired",
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#070A10",
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
  ipcMain.handle("app:get-snapshot", async () => {
    if (tunnelCoordinator) {
      await tunnelCoordinator.refresh();
      if (snapshot.paired) {
        snapshot = appSnapshotSchema.parse({
          ...snapshot,
          connectionStatus: tunnelCoordinator.status,
        });
      }
    }
    return snapshot;
  });

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

      const configuration = await new DeviceConfigurationClient(API_URL).get(
        session.sessionToken,
      );
      const subscription = await new SubscriptionClient().get(
        configuration.subscriptionUrl,
      );
      const profile = parseSubscription(subscription);
      const xrayConfiguration = buildXrayConfiguration(profile);
      const xrayExecutable = app.isPackaged
        ? path.join(process.resourcesPath, "xray", "xray.exe")
        : path.join(
            __dirname,
            "../../../resources/xray/xray.exe",
          );
      await new XrayConfigurationValidator().validate(
        xrayExecutable,
        path.join(app.getPath("userData"), "runtime"),
        xrayConfiguration,
      );
      snapshot = appSnapshotSchema.parse({
        ...snapshot,
        connectionStatus: "connecting",
      });
      tunnelCoordinator ??= new ElevatedTunnelCoordinator(
        app.getPath("userData"),
        process.execPath,
        process.pid,
        app.isPackaged,
      );
      await tunnelCoordinator.start(
        profile.address,
        xrayConfiguration,
      );
      snapshot = appSnapshotSchema.parse({
        ...snapshot,
        connectionStatus: "connected",
      });
      return {
        ok: true,
        snapshot,
      };
    } catch (error) {
      snapshot = appSnapshotSchema.parse({
        ...snapshot,
        connectionStatus: snapshot.paired ? "error" : "unpaired",
      });
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить защищённую конфигурацию.",
      };
    }
  });

  ipcMain.handle(
    "app:disconnect",
    async (): Promise<CommandResult> => {
      try {
        if (
          !tunnelCoordinator ||
          tunnelCoordinator.status === "disconnected"
        ) {
          return {
            ok: false,
            message: "Активного VPN-соединения нет.",
          };
        }
        snapshot = appSnapshotSchema.parse({
          ...snapshot,
          connectionStatus: "disconnecting",
        });
        await tunnelCoordinator.stop();
        snapshot = appSnapshotSchema.parse({
          ...snapshot,
          connectionStatus: "disconnected",
        });
        return { ok: true, snapshot };
      } catch (error) {
        snapshot = appSnapshotSchema.parse({
          ...snapshot,
          connectionStatus: "error",
        });
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Не удалось отключить VPN.",
        };
      }
    },
  );

  ipcMain.handle("app:open-help", async (): Promise<void> => {
    await shell.openExternal(`${SITE_URL}/help`);
  });
}

const helperArguments = parseTunnelHelperArguments(process.argv);

if (helperArguments) {
  app.whenReady().then(async () => {
    let exitCode = 0;
    try {
      if (!app.isPackaged || process.platform !== "win32") {
        throw new Error("Elevated helper is available only in Windows builds.");
      }
      await runElevatedTunnelHelper({
        runtimeRoot: path.join(app.getPath("userData"), "runtime"),
        requestPath: helperArguments.requestPath,
        requestSha256: helperArguments.requestSha256,
        resourcesPath: process.resourcesPath,
        programDataPath:
          process.env.ProgramData ?? "C:\\ProgramData",
      });
    } catch {
      exitCode = 1;
    } finally {
      app.exit(exitCode);
    }
  });
} else {
  app.whenReady().then(async () => {
    await restoreSession();
    registerIpc();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", (event) => {
    if (
      quitAfterTunnelStop ||
      !tunnelCoordinator ||
      tunnelCoordinator.status === "disconnected"
    ) {
      return;
    }
    event.preventDefault();
    void tunnelCoordinator
      .stop()
      .catch(() => undefined)
      .finally(() => {
        quitAfterTunnelStop = true;
        app.quit();
      });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
