import { spawn, type ChildProcess } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";

import {
  tunnelLaunchRequestSchema,
  type TunnelLaunchRequest,
} from "./tunnel-helper-protocol";
import { createTunnelRuntimeState } from "./tunnel-runtime-state";

const REQUEST_MAX_BYTES = 512 * 1024;
const REQUEST_MAX_AGE_MS = 2 * 60 * 1000;
const REQUEST_MAX_FUTURE_MS = 30 * 1000;
const SOCKS_READY_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

export async function loadTunnelLaunchRequest(input: {
  runtimeRoot: string;
  requestPath: string;
  requestSha256: string;
  now?: Date;
  readFile?: (filePath: string) => Promise<string>;
}): Promise<TunnelLaunchRequest> {
  const runtimeRoot = path.resolve(input.runtimeRoot);
  const requestPath = path.resolve(input.requestPath);
  const relative = path.relative(runtimeRoot, requestPath);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !path.basename(requestPath).startsWith("launch-")
  ) {
    throw new Error("Путь команды VPN недопустим.");
  }

  const raw = await (input.readFile ?? ((filePath) =>
    fs.readFile(filePath, "utf8")))(requestPath);
  if (Buffer.byteLength(raw, "utf8") > REQUEST_MAX_BYTES) {
    throw new Error("Команда VPN слишком большая.");
  }
  const actualHash = Buffer.from(
    createHash("sha256").update(raw, "utf8").digest("hex"),
    "ascii",
  );
  const expectedHash = Buffer.from(input.requestSha256, "ascii");
  if (
    actualHash.length !== expectedHash.length ||
    !timingSafeEqual(actualHash, expectedHash)
  ) {
    throw new Error("Команда VPN была изменена.");
  }

  const request = tunnelLaunchRequestSchema.parse(JSON.parse(raw));
  const now = (input.now ?? new Date()).getTime();
  const createdAt = new Date(request.createdAt).getTime();
  if (
    now - createdAt > REQUEST_MAX_AGE_MS ||
    createdAt - now > REQUEST_MAX_FUTURE_MS
  ) {
    throw new Error("Команда VPN устарела.");
  }
  if (
    path.basename(requestPath) !== `launch-${request.nonce}.json`
  ) {
    throw new Error("Команда VPN не соответствует своему идентификатору.");
  }
  return request;
}

export function buildTun2proxyArguments(
  bypassAddresses: readonly string[],
): string[] {
  return [
    "--setup",
    "--proxy",
    "socks5://127.0.0.1:10808",
    "--dns",
    "virtual",
    "--ipv6-enabled",
    ...bypassAddresses.flatMap((address) => ["--bypass", address]),
    "--exit-on-fatal-error",
    "--verbosity",
    "warn",
  ];
}

export type ElevatedTunnelHelperOptions = {
  runtimeRoot: string;
  requestPath: string;
  requestSha256: string;
  resourcesPath: string;
  programDataPath: string;
};

export function shouldPersistTunnelErrorState(
  request: TunnelLaunchRequest | null,
  statePath: string | null,
): boolean {
  return request !== null && statePath !== null;
}

export async function runElevatedTunnelHelper(
  options: ElevatedTunnelHelperOptions,
): Promise<void> {
  let request: TunnelLaunchRequest | null = null;
  let xray: ChildProcess | null = null;
  let tun2proxy: ChildProcess | null = null;
  let statePath: string | null = null;
  let protectedRuntimeDirectory: string | null = null;

  try {
    request = await loadTunnelLaunchRequest(options);
    statePath = path.join(
      options.runtimeRoot,
      `state-${request.nonce}.json`,
    );
    const stopPath = path.join(
      options.runtimeRoot,
      `stop-${request.nonce}`,
    );
    await writeState(statePath, request.nonce, "starting");

    const xrayExecutable = path.join(
      options.resourcesPath,
      "xray",
      "xray.exe",
    );
    const tun2proxyExecutable = path.join(
      options.resourcesPath,
      "tun2proxy",
      "tun2proxy-bin.exe",
    );
    await Promise.all([
      assertRegularFile(xrayExecutable),
      assertRegularFile(tun2proxyExecutable),
    ]);

    protectedRuntimeDirectory = path.join(
      options.programDataPath,
      "134 Connect",
      "runtime",
      request.nonce,
    );
    await fs.mkdir(protectedRuntimeDirectory, {
      recursive: true,
      mode: 0o700,
    });
    await lockWindowsDirectory(protectedRuntimeDirectory);
    const configurationPath = path.join(
      protectedRuntimeDirectory,
      "xray.json",
    );
    await fs.writeFile(
      configurationPath,
      JSON.stringify(request.xrayConfiguration),
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    await fs.rm(options.requestPath, { force: true });

    xray = spawn(
      xrayExecutable,
      ["run", "-config", configurationPath],
      {
        cwd: path.dirname(xrayExecutable),
        windowsHide: true,
        stdio: "ignore",
      },
    );
    await ensureProcessSpawned(xray);
    await waitForLocalPort(10808, xray, SOCKS_READY_TIMEOUT_MS);

    tun2proxy = spawn(
      tun2proxyExecutable,
      buildTun2proxyArguments(request.bypassAddresses),
      {
        cwd: path.dirname(tun2proxyExecutable),
        windowsHide: true,
        stdio: "ignore",
      },
    );
    await ensureProcessSpawned(tun2proxy);
    await ensureProcessSurvives(tun2proxy, 1_000);
    await writeState(statePath, request.nonce, "connected");

    while (
      isProcessAlive(request.parentPid) &&
      xray.exitCode === null &&
      tun2proxy.exitCode === null &&
      !(await fileExists(stopPath))
    ) {
      await sleep(POLL_INTERVAL_MS);
    }
    if (
      isProcessAlive(request.parentPid) &&
      !(await fileExists(stopPath)) &&
      (xray.exitCode !== null || tun2proxy.exitCode !== null)
    ) {
      throw new Error("Системный туннель неожиданно остановился.");
    }
    await writeState(statePath, request.nonce, "stopping");
  } catch (error) {
    if (shouldPersistTunnelErrorState(request, statePath)) {
      await writeState(
        statePath!,
        request!.nonce,
        "error",
        safeErrorMessage(error),
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    // tun2proxy owns the system routes, so stop it before Xray.
    await terminateProcess(tun2proxy);
    await terminateProcess(xray);
    if (protectedRuntimeDirectory) {
      await fs.rm(protectedRuntimeDirectory, {
        recursive: true,
        force: true,
      });
    }
    if (request && statePath) {
      await writeState(
        statePath,
        request.nonce,
        "disconnected",
      ).catch(() => undefined);
    }
  }
}

async function writeState(
  statePath: string,
  nonce: string,
  status:
    | "starting"
    | "connected"
    | "stopping"
    | "disconnected"
    | "error",
  message?: string,
): Promise<void> {
  const state = createTunnelRuntimeState({
    nonce,
    status,
    message,
  });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(state), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporaryPath, statePath);
}

async function lockWindowsDirectory(
  directoryPath: string,
): Promise<void> {
  const process = spawn(
    "icacls.exe",
    [
      directoryPath,
      "/inheritance:r",
      "/grant:r",
      "*S-1-5-18:(OI)(CI)F",
      "*S-1-5-32-544:(OI)(CI)F",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await waitForExit(process, 10_000);
  if (process.exitCode !== 0) {
    throw new Error("Не удалось защитить конфигурацию VPN.");
  }
}

async function assertRegularFile(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error("Компонент VPN не найден.");
}

async function waitForLocalPort(
  port: number,
  runtime: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (runtime.exitCode !== null) {
      throw new Error("VPN-ядро завершилось до подключения.");
    }
    if (await canConnect(port)) return;
    await sleep(150);
  }
  throw new Error("VPN-ядро не ответило за отведённое время.");
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({
      host: "127.0.0.1",
      port,
    });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(250);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function ensureProcessSurvives(
  runtime: ChildProcess,
  milliseconds: number,
): Promise<void> {
  await sleep(milliseconds);
  if (runtime.exitCode !== null) {
    throw new Error("Системный туннель не запустился.");
  }
}

function ensureProcessSpawned(runtime: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    runtime.once("spawn", resolve);
    runtime.once("error", () => {
      reject(new Error("Компонент VPN не удалось запустить."));
    });
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcess(runtime: ChildProcess | null): Promise<void> {
  if (!runtime || runtime.exitCode !== null) return;
  runtime.kill("SIGTERM");
  try {
    await waitForExit(runtime, 3_000);
  } catch {
    runtime.kill("SIGKILL");
  }
}

function waitForExit(
  runtime: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  if (runtime.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Process exit timeout")),
      timeoutMs,
    );
    runtime.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    runtime.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Не удалось запустить VPN.";
  const allowed = [
    "Компонент VPN не найден.",
    "Не удалось защитить конфигурацию VPN.",
    "VPN-ядро завершилось до подключения.",
    "VPN-ядро не ответило за отведённое время.",
    "Системный туннель не запустился.",
    "Системный туннель неожиданно остановился.",
    "Компонент VPN не удалось запустить.",
  ];
  return allowed.includes(error.message)
    ? error.message
    : "Не удалось запустить VPN.";
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
