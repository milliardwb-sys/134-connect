import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { lookup } from "node:dns/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { XrayConfiguration } from "./subscription-parser";
import { createTunnelLaunchRequest } from "./tunnel-helper-protocol";
import {
  tunnelRuntimeStateSchema,
  type TunnelRuntimeState,
} from "./tunnel-runtime-state";

const execFileAsync = promisify(execFile);
const START_TIMEOUT_MS = 45_000;
const STOP_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 300;

export type CoordinatorStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type ElevatedLaunch = {
  executablePath: string;
  encodedRequestPath: string;
  requestSha256: string;
};

type CoordinatorDependencies = {
  userDataDirectory: string;
  executablePath: string;
  parentPid: number;
  isPackaged: boolean;
  resolveAddresses(hostname: string): Promise<string[]>;
  makeNonce(): string;
  ensureDirectory(directoryPath: string): Promise<void>;
  writeFile(filePath: string, content: string): Promise<void>;
  readFile(filePath: string): Promise<string>;
  removeFile(filePath: string): Promise<void>;
  launchElevated(launch: ElevatedLaunch): Promise<void>;
  sleep(milliseconds: number): Promise<void>;
};

const defaultDependencies = (
  userDataDirectory: string,
  executablePath: string,
  parentPid: number,
  isPackaged: boolean,
): CoordinatorDependencies => ({
  userDataDirectory,
  executablePath,
  parentPid,
  isPackaged,
  resolveAddresses: async (hostname) => {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return [...new Set(records.map((record) => record.address))];
  },
  makeNonce: () => randomBytes(16).toString("hex"),
  ensureDirectory: async (directoryPath) => {
    await fs.mkdir(directoryPath, { recursive: true, mode: 0o700 });
  },
  writeFile: async (filePath, content) => {
    await fs.writeFile(filePath, content, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  },
  readFile: (filePath) => fs.readFile(filePath, "utf8"),
  removeFile: async (filePath) => {
    await fs.rm(filePath, { force: true });
  },
  launchElevated: async (launch) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$arguments = @('--tunnel-helper', $env:CONNECT134_REQUEST, $env:CONNECT134_SHA)",
      "Start-Process -FilePath $env:CONNECT134_EXE -ArgumentList $arguments -Verb RunAs | Out-Null",
    ].join("; ");
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        env: {
          ...process.env,
          CONNECT134_EXE: launch.executablePath,
          CONNECT134_REQUEST: launch.encodedRequestPath,
          CONNECT134_SHA: launch.requestSha256,
        },
      },
    );
  },
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
});

export class ElevatedTunnelCoordinator {
  public status: CoordinatorStatus = "disconnected";
  public lastError: string | null = null;

  readonly #dependencies: CoordinatorDependencies;
  #active:
    | {
        nonce: string;
        requestPath: string;
        statePath: string;
        stopPath: string;
      }
    | null = null;

  public constructor(
    dependenciesOrUserData: CoordinatorDependencies | string,
    executablePath?: string,
    parentPid = process.pid,
    isPackaged = false,
  ) {
    this.#dependencies =
      typeof dependenciesOrUserData === "string"
        ? defaultDependencies(
            dependenciesOrUserData,
            executablePath ?? process.execPath,
            parentPid,
            isPackaged,
          )
        : dependenciesOrUserData;
  }

  public async start(
    serverHostname: string,
    xrayConfiguration: XrayConfiguration,
  ): Promise<void> {
    if (!this.#dependencies.isPackaged) {
      throw new Error(
        "Системный VPN доступен только в установленной версии 134 Connect.",
      );
    }
    if (this.status !== "disconnected" && this.status !== "error") {
      throw new Error("VPN уже запускается или работает.");
    }
    if (this.#active) {
      throw new Error(
        "Предыдущий VPN-сеанс ещё завершается. Попробуйте отключить его.",
      );
    }

    this.status = "connecting";
    this.lastError = null;
    let elevatedLaunchCompleted = false;
    try {
      const bypassAddresses =
        await this.#dependencies.resolveAddresses(serverHostname);
      if (bypassAddresses.length === 0) {
        throw new Error("Не удалось определить адрес VPN-сервера.");
      }

      const nonce = this.#dependencies.makeNonce();
      const runtimeDirectory = path.join(
        this.#dependencies.userDataDirectory,
        "runtime",
      );
      const requestPath = path.join(
        runtimeDirectory,
        `launch-${nonce}.json`,
      );
      const statePath = path.join(runtimeDirectory, `state-${nonce}.json`);
      const stopPath = path.join(runtimeDirectory, `stop-${nonce}`);
      await this.#dependencies.ensureDirectory(runtimeDirectory);
      await Promise.all([
        this.#dependencies.removeFile(statePath),
        this.#dependencies.removeFile(stopPath),
      ]);

      const request = createTunnelLaunchRequest({
        parentPid: this.#dependencies.parentPid,
        nonce,
        bypassAddresses,
        xrayConfiguration,
      });
      const serialized = JSON.stringify(request);
      const requestSha256 = createHash("sha256")
        .update(serialized, "utf8")
        .digest("hex");
      await this.#dependencies.writeFile(requestPath, serialized);
      this.#active = { nonce, requestPath, statePath, stopPath };
      await this.#dependencies.launchElevated({
        executablePath: this.#dependencies.executablePath,
        encodedRequestPath: Buffer.from(requestPath, "utf8").toString(
          "base64url",
        ),
        requestSha256,
      });
      elevatedLaunchCompleted = true;

      const state = await this.#waitForState(
        new Set(["connected", "error"]),
        START_TIMEOUT_MS,
      );
      if (state.status === "error") {
        throw new Error(state.message ?? "Не удалось запустить VPN.");
      }
      this.status = "connected";
    } catch (error) {
      this.status = "error";
      this.lastError =
        error instanceof Error ? error.message : "Не удалось запустить VPN.";
      if (elevatedLaunchCompleted) {
        await this.#abortFailedStart();
      } else {
        await this.#removeActiveFiles();
      }
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.#active || this.status === "disconnected") return;
    this.status = "disconnecting";
    try {
      await this.#writeStopMarker();
      const state = await this.#waitForState(
        new Set(["disconnected", "error"]),
        STOP_TIMEOUT_MS,
      );
      if (state.status === "error") {
        throw new Error(state.message ?? "VPN завершился с ошибкой.");
      }
      this.status = "disconnected";
      await this.#removeActiveFiles();
    } catch (error) {
      this.status = "error";
      this.lastError =
        error instanceof Error ? error.message : "Не удалось отключить VPN.";
      throw error;
    }
  }

  public async refresh(): Promise<void> {
    const active = this.#active;
    if (!active || this.status === "connecting") return;
    try {
      const state = tunnelRuntimeStateSchema.parse(
        JSON.parse(await this.#dependencies.readFile(active.statePath)),
      );
      if (state.nonce !== active.nonce) {
        throw new Error("Получено состояние другого VPN-сеанса.");
      }
      if (state.status === "error") {
        this.status = "error";
        this.lastError =
          state.message ?? "Системный туннель неожиданно остановился.";
        await this.#removeActiveFiles();
      } else if (state.status === "disconnected") {
        this.status = "disconnected";
        this.lastError = null;
        await this.#removeActiveFiles();
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("ENOENT") ||
          error instanceof SyntaxError)
      ) {
        return;
      }
      throw error;
    }
  }

  async #waitForState(
    accepted: Set<TunnelRuntimeState["status"]>,
    timeoutMs: number,
  ): Promise<TunnelRuntimeState> {
    const active = this.#active;
    if (!active) throw new Error("Нет активного VPN-сеанса.");
    const deadline = Date.now() + timeoutMs;
    do {
      try {
        const state = tunnelRuntimeStateSchema.parse(
          JSON.parse(
            await this.#dependencies.readFile(active.statePath),
          ),
        );
        if (state.nonce !== active.nonce) {
          throw new Error("Получено состояние другого VPN-сеанса.");
        }
        if (accepted.has(state.status)) return state;
      } catch (error) {
        if (
          error instanceof Error &&
          !error.message.includes("ENOENT") &&
          !(error instanceof SyntaxError)
        ) {
          throw error;
        }
      }
      await this.#dependencies.sleep(POLL_INTERVAL_MS);
    } while (Date.now() < deadline);
    throw new Error("VPN не ответил за отведённое время.");
  }

  async #removeActiveFiles(): Promise<void> {
    const active = this.#active;
    this.#active = null;
    if (!active) return;
    await Promise.all([
      this.#dependencies.removeFile(active.requestPath),
      this.#dependencies.removeFile(active.statePath),
      this.#dependencies.removeFile(active.stopPath),
    ]);
  }

  async #abortFailedStart(): Promise<void> {
    if (!this.#active) return;
    try {
      await this.#writeStopMarker();
      await this.#waitForState(
        new Set(["disconnected", "error"]),
        5_000,
      );
      await this.#removeActiveFiles();
    } catch {
      // Keep the stop marker and active paths so a later explicit stop can
      // finish cleanup instead of orphaning an elevated network helper.
    }
  }

  async #writeStopMarker(): Promise<void> {
    const active = this.#active;
    if (!active) return;
    try {
      await this.#dependencies.writeFile(
        active.stopPath,
        new Date().toISOString(),
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return;
      }
      throw error;
    }
  }
}
