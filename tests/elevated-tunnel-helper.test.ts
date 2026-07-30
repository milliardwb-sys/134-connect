import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildTun2proxyArguments,
  loadTunnelLaunchRequest,
} from "../src/main/elevated-tunnel-helper";

const launchRequest = {
  schemaVersion: 1 as const,
  parentPid: 123,
  nonce: "a".repeat(32),
  createdAt: "2026-07-30T12:00:00.000Z",
  bypassAddresses: ["203.0.113.10", "2001:db8::10"],
  xrayConfiguration: {
    log: { loglevel: "warning" as const },
    inbounds: [{ protocol: "socks" }],
    outbounds: [{ protocol: "vless" }],
  },
};

describe("elevated tunnel helper boundaries", () => {
  it("loads a fresh checksum-bound request only from the app runtime directory", async () => {
    const serialized = JSON.stringify(launchRequest);
    const runtimeRoot = "C:\\Users\\Test\\134 Connect\\runtime";
    const requestPath = path.win32.join(
      runtimeRoot,
      `launch-${launchRequest.nonce}.json`,
    );

    const request = await loadTunnelLaunchRequest({
      runtimeRoot,
      requestPath,
      requestSha256: createHash("sha256")
        .update(serialized)
        .digest("hex"),
      now: new Date("2026-07-30T12:01:00.000Z"),
      readFile: async () => serialized,
    });

    expect(request).toEqual(launchRequest);
  });

  it("rejects a request outside the app runtime directory", async () => {
    const serialized = JSON.stringify(launchRequest);
    await expect(
      loadTunnelLaunchRequest({
        runtimeRoot: "C:\\Users\\Test\\134 Connect\\runtime",
        requestPath: "C:\\Temp\\launch.json",
        requestSha256: createHash("sha256")
          .update(serialized)
          .digest("hex"),
        now: new Date("2026-07-30T12:01:00.000Z"),
        readFile: async () => serialized,
      }),
    ).rejects.toThrow("недопустим");
  });

  it("rejects modified and expired launch requests", async () => {
    const serialized = JSON.stringify(launchRequest);
    const common = {
      runtimeRoot: "C:\\Users\\Test\\134 Connect\\runtime",
      requestPath:
        `C:\\Users\\Test\\134 Connect\\runtime\\launch-${launchRequest.nonce}.json`,
      readFile: async () => serialized,
    };

    await expect(
      loadTunnelLaunchRequest({
        ...common,
        requestSha256: "0".repeat(64),
        now: new Date("2026-07-30T12:01:00.000Z"),
      }),
    ).rejects.toThrow("изменена");

    await expect(
      loadTunnelLaunchRequest({
        ...common,
        requestSha256: createHash("sha256")
          .update(serialized)
          .digest("hex"),
        now: new Date("2026-07-30T12:03:01.000Z"),
      }),
    ).rejects.toThrow("устарел");
  });

  it("builds automatic route setup with every server address bypassed", () => {
    expect(
      buildTun2proxyArguments(["203.0.113.10", "2001:db8::10"]),
    ).toEqual([
      "--setup",
      "--proxy",
      "socks5://127.0.0.1:10808",
      "--dns",
      "virtual",
      "--ipv6-enabled",
      "--bypass",
      "203.0.113.10",
      "--bypass",
      "2001:db8::10",
      "--exit-on-fatal-error",
      "--verbosity",
      "warn",
    ]);
  });
});
