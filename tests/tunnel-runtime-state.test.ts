import { describe, expect, it } from "vitest";

import {
  createTunnelRuntimeState,
  tunnelRuntimeStateSchema,
} from "../src/main/tunnel-runtime-state";

describe("tunnel runtime state", () => {
  it("creates a bounded state message for the matching tunnel nonce", () => {
    const state = createTunnelRuntimeState({
      nonce: "a".repeat(32),
      status: "connected",
      message: "VPN подключён",
      now: new Date("2026-07-30T12:00:00.000Z"),
    });

    expect(state).toEqual({
      schemaVersion: 1,
      nonce: "a".repeat(32),
      status: "connected",
      message: "VPN подключён",
      updatedAt: "2026-07-30T12:00:00.000Z",
    });
  });

  it("rejects states with secrets-sized diagnostic messages", () => {
    expect(() =>
      tunnelRuntimeStateSchema.parse({
        schemaVersion: 1,
        nonce: "a".repeat(32),
        status: "error",
        message: "x".repeat(241),
        updatedAt: "2026-07-30T12:00:00.000Z",
      }),
    ).toThrow();
  });
});
