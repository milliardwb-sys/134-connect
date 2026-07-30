import { describe, expect, it } from "vitest";

import {
  createPairingSessionResponseSchema,
  pairingPollResponseSchema,
  toRendererAccount,
} from "../src/shared/client-contracts";

describe("desktop client contracts", () => {
  it("accepts a safe pairing session without a device credential", () => {
    expect(
      createPairingSessionResponseSchema.parse({
        loginCode: "7KM2-NP4X",
        pollSecret: "p".repeat(43),
        expiresAt: "2026-08-30T12:00:00.000Z",
        requestId: "018fd846-8e33-7db6-9a6f-e49b94782f2d",
      }),
    ).toMatchObject({
      loginCode: "7KM2-NP4X",
    });
  });

  it("rejects undeclared fields such as raw subscription URLs", () => {
    expect(() =>
      pairingPollResponseSchema.parse({
        status: "issued",
        sessionToken: "tok_" + "a".repeat(64),
        accountLabel: "Аккаунт 134",
        expiresAt: "2026-08-30T12:00:00.000Z",
        requestId: "018fd846-8e33-7db6-9a6f-e49b94782f2d",
        subscriptionUrl: "https://secret.example/subscription",
      }),
    ).toThrow();
  });

  it("removes the session token before data crosses into the renderer", () => {
    const rendererAccount = toRendererAccount({
      status: "issued",
      sessionToken: "tok_" + "a".repeat(64),
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
      requestId: "018fd846-8e33-7db6-9a6f-e49b94782f2d",
    });

    expect(rendererAccount).toEqual({
      accountLabel: "Аккаунт 134",
      expiresAt: "2026-08-30T12:00:00.000Z",
    });
    expect(rendererAccount).not.toHaveProperty("sessionToken");
  });
});
