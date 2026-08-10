import { describe, expect, it } from "vitest";

import {
  createTunnelLaunchRequest,
  parseTunnelHelperArguments,
  tunnelLaunchRequestSchema,
} from "../src/main/tunnel-helper-protocol";

const configuration = {
  log: { loglevel: "warning" as const },
  inbounds: [{ protocol: "socks" }],
  outbounds: [{ protocol: "vless" }],
};

describe("tunnel helper protocol", () => {
  it("creates a bounded versioned launch request", () => {
    const request = createTunnelLaunchRequest({
      parentPid: 1234,
      nonce: "a".repeat(32),
      bypassAddresses: ["203.0.113.8", "2001:db8::8"],
      xrayConfiguration: configuration,
      now: new Date("2026-07-30T10:00:00.000Z"),
    });

    expect(request).toEqual({
      schemaVersion: 1,
      parentPid: 1234,
      nonce: "a".repeat(32),
      createdAt: "2026-07-30T10:00:00.000Z",
      bypassAddresses: ["203.0.113.8", "2001:db8::8"],
      xrayConfiguration: configuration,
    });
    expect(tunnelLaunchRequestSchema.parse(request)).toEqual(request);
  });

  it("parses only exact helper arguments and a SHA-256 digest", () => {
    const requestPath = "C:\\Users\\User\\request.json";
    const encodedPath = Buffer.from(requestPath, "utf8").toString(
      "base64url",
    );
    const parsed = parseTunnelHelperArguments([
      "134 Connect.exe",
      "--tunnel-helper",
      encodedPath,
      "a".repeat(64),
    ]);

    expect(parsed).toEqual({
      requestPath,
      requestSha256: "a".repeat(64),
    });
    expect(
      parseTunnelHelperArguments([
        "134 Connect.exe",
        "--tunnel-helper",
        "request.json",
        "not-a-hash",
      ]),
    ).toBeNull();
  });

  it("rejects stale, duplicate, and non-IP bypass data", () => {
    expect(() =>
      tunnelLaunchRequestSchema.parse({
        schemaVersion: 1,
        parentPid: 1234,
        nonce: "a".repeat(32),
        createdAt: "2026-07-30T10:00:00.000Z",
        bypassAddresses: ["edge.example.com"],
        xrayConfiguration: configuration,
      }),
    ).toThrow();
    expect(() =>
      tunnelLaunchRequestSchema.parse({
        schemaVersion: 1,
        parentPid: 1234,
        nonce: "a".repeat(32),
        createdAt: "2026-07-30T10:00:00.000Z",
        bypassAddresses: ["203.0.113.8", "203.0.113.8"],
        xrayConfiguration: configuration,
      }),
    ).toThrow();
  });
});
