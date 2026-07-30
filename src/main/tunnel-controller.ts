import type { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

export type TunnelStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type RuntimeProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill(signal?: NodeJS.Signals): boolean;
};

type SpawnRuntime = (
  executable: string,
  args: readonly string[],
) => RuntimeProcess;

const defaultSpawn: SpawnRuntime = (executable, args) =>
  spawn(executable, [...args], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

export class TunnelController {
  public status: TunnelStatus = "disconnected";
  public lastError: string | null = null;

  readonly #spawnRuntime: SpawnRuntime;
  readonly #startupTimeoutMs: number;
  #runtime: RuntimeProcess | null = null;
  #expectedExit = false;

  public constructor(
    spawnRuntime: SpawnRuntime = defaultSpawn,
    startupTimeoutMs = 10_000,
  ) {
    this.#spawnRuntime = spawnRuntime;
    this.#startupTimeoutMs = startupTimeoutMs;
  }

  public async start(
    executable: string,
    args: readonly string[],
  ): Promise<void> {
    if (this.status !== "disconnected" && this.status !== "error") {
      throw new Error("VPN уже запускается или работает");
    }

    this.status = "connecting";
    this.lastError = null;
    this.#expectedExit = false;
    const runtime = this.#spawnRuntime(executable, args);
    this.#runtime = runtime;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.status = "error";
        this.lastError = "VPN-ядро не подтвердило готовность";
        runtime.kill("SIGTERM");
        reject(new Error(this.lastError));
      }, this.#startupTimeoutMs);

      runtime.stdout.on("data", (chunk: Buffer | string) => {
        if (settled || !chunk.toString().includes("READY")) return;
        settled = true;
        clearTimeout(timer);
        this.status = "connected";
        resolve();
      });

      runtime.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.status = "error";
        this.lastError = "Не удалось запустить VPN-ядро";
        reject(new Error(`${this.lastError}: ${error.message}`));
      });

      runtime.on(
        "exit",
        (code: number | null, signal: NodeJS.Signals | null) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.status = "error";
            this.lastError = describeExit(code, signal);
            reject(new Error(this.lastError));
            return;
          }

          if (!this.#expectedExit && this.status === "connected") {
            this.status = "error";
            this.lastError = describeExit(code, signal);
          }
        },
      );
    });
  }

  public async stop(): Promise<void> {
    const runtime = this.#runtime;
    if (!runtime || this.status === "disconnected") return;

    this.status = "disconnecting";
    this.#expectedExit = true;

    await new Promise<void>((resolve) => {
      const fallback = setTimeout(() => {
        this.status = "disconnected";
        this.#runtime = null;
        resolve();
      }, 3_000);

      runtime.once("exit", () => {
        clearTimeout(fallback);
        this.status = "disconnected";
        this.#runtime = null;
        resolve();
      });
      runtime.kill("SIGTERM");
    });
  }
}

function describeExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal) return `VPN-ядро остановлено сигналом ${signal}`;
  return `VPN-ядро завершилось с кодом ${code ?? "unknown"}`;
}
