import { contextBridge, ipcRenderer } from "electron";

import {
  appSnapshotSchema,
  commandResultSchema,
  pairingStartResultSchema,
  type DesktopBridge,
} from "../shared/ipc-contracts";

const bridge: DesktopBridge = {
  async getSnapshot() {
    return appSnapshotSchema.parse(
      await ipcRenderer.invoke("app:get-snapshot"),
    );
  },
  async startPairing() {
    return pairingStartResultSchema.parse(
      await ipcRenderer.invoke("app:start-pairing"),
    );
  },
  async checkPairing() {
    return commandResultSchema.parse(
      await ipcRenderer.invoke("app:check-pairing"),
    );
  },
  async connect() {
    return commandResultSchema.parse(
      await ipcRenderer.invoke("app:connect"),
    );
  },
  async disconnect() {
    return commandResultSchema.parse(
      await ipcRenderer.invoke("app:disconnect"),
    );
  },
  async openHelp() {
    await ipcRenderer.invoke("app:open-help");
  },
};

contextBridge.exposeInMainWorld("connect134", bridge);
