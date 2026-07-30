import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ElevatedTunnelCoordinator,
  type ElevatedLaunch,
} from "../src/main/elevated-tunnel-coordinator";
import { createTunnelRuntimeState } from "../src/main/tunnel-runtime-state";

const configuration = {
  log: { loglevel: "warning" as const },
  inbounds: [{ protocol: "socks" }],
  outbounds: [{ protocol: "vless" }],
};

describe("ElevatedTunnelCoordinator", () => {
  it("launches a checksum-bound helper request and connects only after its state", async () => {
    const files = new Map<string, string>();
    const launches: ElevatedLaunch[] = [];
    const launchElevated = vi.fn(
      async (launch: ElevatedLaunch) => {
        launches.push(launch);
      },
    );
    const coordinator = new ElevatedTunnelCoordinator({
      userDataDirectory: "C:\\Users\\Test\\AppData\\Roaming\\134 Connect",
      executablePath: "C:\\Program Files\\134 Connect\\134 Connect.exe",
      parentPid: 123,
      resolveAddresses: async () => ["203.0.113.10"],
      makeNonce: () => "a".repeat(32),
      writeFile: async (filePath, content) => {
        files.set(filePath, content);
      },
      readFile: async (filePath) => {
        if (filePath.endsWith("state-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json")) {
          return JSON.stringify(
            createTunnelRuntimeState({
              nonce: "a".repeat(32),
              status: "connected",
            }),
          );
        }
        const content = files.get(filePath);
        if (!content) throw new Error("ENOENT");
        return content;
      },
      ensureDirectory: async () => undefined,
      removeFile: async () => undefined,
      launchElevated,
      sleep: async () => undefined,
      isPackaged: true,
    });

    await coordinator.start("vpn.example.com", configuration);

    expect(coordinator.status).toBe("connected");
    expect(launchElevated).toHaveBeenCalledTimes(1);
    const launch = launches[0];
    expect(launch?.executablePath).toBe(
      "C:\\Program Files\\134 Connect\\134 Connect.exe",
    );
    expect(launch?.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    const requestPath = Buffer.from(
      launch?.encodedRequestPath ?? "",
      "base64url",
    ).toString("utf8");
    expect(requestPath).toBe(
      path.win32.join(
        "C:\\Users\\Test\\AppData\\Roaming\\134 Connect",
        "runtime",
        "launch-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json",
      ),
    );
    const request = JSON.parse(files.get(requestPath) ?? "{}");
    expect(request.bypassAddresses).toEqual(["203.0.113.10"]);
    expect(JSON.stringify(request)).not.toContain("vpn.example.com");
  });

  it("writes a stop marker and waits for the helper to disconnect", async () => {
    const writes: string[] = [];
    let stateReads = 0;
    const coordinator = new ElevatedTunnelCoordinator({
      userDataDirectory: "C:\\runtime",
      executablePath: "C:\\134 Connect.exe",
      parentPid: 123,
      resolveAddresses: async () => ["203.0.113.10"],
      makeNonce: () => "b".repeat(32),
      writeFile: async (filePath) => {
        writes.push(filePath);
      },
      readFile: async (filePath) => {
        if (!filePath.includes("state-")) throw new Error("ENOENT");
        stateReads += 1;
        return JSON.stringify(
          createTunnelRuntimeState({
            nonce: "b".repeat(32),
            status: stateReads === 1 ? "connected" : "disconnected",
          }),
        );
      },
      ensureDirectory: async () => undefined,
      removeFile: async () => undefined,
      launchElevated: async () => undefined,
      sleep: async () => undefined,
      isPackaged: true,
    });
    await coordinator.start("vpn.example.com", configuration);

    await coordinator.stop();

    expect(coordinator.status).toBe("disconnected");
    expect(writes.some((filePath) => filePath.includes("stop-"))).toBe(true);
  });

  it("reports an unexpected helper error after connection", async () => {
    let state = "connected" as "connected" | "error";
    const coordinator = new ElevatedTunnelCoordinator({
      userDataDirectory: "C:\\runtime",
      executablePath: "C:\\134 Connect.exe",
      parentPid: 123,
      resolveAddresses: async () => ["203.0.113.10"],
      makeNonce: () => "e".repeat(32),
      writeFile: async () => undefined,
      readFile: async () =>
        JSON.stringify(
          createTunnelRuntimeState({
            nonce: "e".repeat(32),
            status: state,
            message:
              state === "error"
                ? "Системный туннель неожиданно остановился."
                : undefined,
          }),
        ),
      ensureDirectory: async () => undefined,
      removeFile: async () => undefined,
      launchElevated: async () => undefined,
      sleep: async () => undefined,
      isPackaged: true,
    });
    await coordinator.start("vpn.example.com", configuration);
    state = "error";

    await coordinator.refresh();

    expect(coordinator.status).toBe("error");
    expect(coordinator.lastError).toContain("остановился");
  });

  it("refuses to change system networking from an unpackaged build", async () => {
    const coordinator = new ElevatedTunnelCoordinator({
      userDataDirectory: "C:\\runtime",
      executablePath: "C:\\electron.exe",
      parentPid: 123,
      resolveAddresses: async () => ["203.0.113.10"],
      makeNonce: () => "c".repeat(32),
      writeFile: async () => undefined,
      readFile: async () => {
        throw new Error("ENOENT");
      },
      ensureDirectory: async () => undefined,
      removeFile: async () => undefined,
      launchElevated: async () => undefined,
      sleep: async () => undefined,
      isPackaged: false,
    });

    await expect(
      coordinator.start("vpn.example.com", configuration),
    ).rejects.toThrow("установленной версии");
  });

  it("cleans the request when the user cancels the elevated launch", async () => {
    const writes: string[] = [];
    const removals: string[] = [];
    const coordinator = new ElevatedTunnelCoordinator({
      userDataDirectory: "C:\\runtime",
      executablePath: "C:\\134 Connect.exe",
      parentPid: 123,
      resolveAddresses: async () => ["203.0.113.10"],
      makeNonce: () => "d".repeat(32),
      writeFile: async (filePath) => {
        writes.push(filePath);
      },
      readFile: async (filePath) => {
        if (!filePath.includes("state-")) throw new Error("ENOENT");
        return JSON.stringify(
          createTunnelRuntimeState({
            nonce: "d".repeat(32),
            status: "disconnected",
          }),
        );
      },
      ensureDirectory: async () => undefined,
      removeFile: async (filePath) => {
        removals.push(filePath);
      },
      launchElevated: async () => {
        throw new Error("UAC cancelled");
      },
      sleep: async () => undefined,
      isPackaged: true,
    });

    await expect(
      coordinator.start("vpn.example.com", configuration),
    ).rejects.toThrow("UAC cancelled");
    expect(writes.some((filePath) => filePath.includes("launch-"))).toBe(
      true,
    );
    expect(removals.some((filePath) => filePath.includes("launch-"))).toBe(
      true,
    );
  });
});
