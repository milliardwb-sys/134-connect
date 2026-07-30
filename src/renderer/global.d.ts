import type { DesktopBridge } from "../shared/ipc-contracts";

declare global {
  interface Window {
    connect134: DesktopBridge;
  }
}

export {};
