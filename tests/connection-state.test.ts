import { describe, expect, it } from "vitest";

import {
  initialConnectionState,
  transitionConnection,
} from "../src/shared/connection-state";

describe("connection state", () => {
  it("starts unpaired and becomes ready only after a confirmed pairing", () => {
    const ready = transitionConnection(initialConnectionState, {
      type: "pairingConfirmed",
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
    });

    expect(ready).toEqual({
      status: "disconnected",
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
    });
  });

  it("reports connected only after the runtime confirms readiness", () => {
    const ready = {
      status: "disconnected" as const,
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
    };

    const connecting = transitionConnection(ready, { type: "connectRequested" });
    const connected = transitionConnection(connecting, {
      type: "runtimeConnected",
      location: "Автоматически",
      connectedAt: "2026-07-30T12:00:00.000Z",
    });

    expect(connecting.status).toBe("connecting");
    expect(connected).toMatchObject({
      status: "connected",
      location: "Автоматически",
    });
  });

  it("moves to an actionable error after a runtime failure", () => {
    const ready = {
      status: "disconnected" as const,
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
    };

    const connecting = transitionConnection(ready, { type: "connectRequested" });
    const failed = transitionConnection(connecting, {
      type: "runtimeFailed",
      publicMessage: "Не удалось подключиться",
      incidentId: "inc_7X9Q",
    });

    expect(failed).toEqual({
      status: "error",
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
      publicMessage: "Не удалось подключиться",
      incidentId: "inc_7X9Q",
    });
  });

  it("rejects impossible transitions", () => {
    expect(() =>
      transitionConnection(initialConnectionState, {
        type: "connectRequested",
      }),
    ).toThrow("Недопустимый переход состояния");
  });
});

