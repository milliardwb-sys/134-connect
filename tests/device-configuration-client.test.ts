import { describe, expect, it } from "vitest";

import { DeviceConfigurationClient } from "../src/main/device-configuration-client";

const token = "A".repeat(43);

describe("DeviceConfigurationClient", () => {
  it("loads an active subscription with bearer authentication", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new DeviceConfigurationClient(
      "https://app.134134.ru",
      async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return Response.json({
          status: "active",
          subscriptionUrl: "https://sub.example/personal-secret",
          expiresAt: "2026-08-30T08:00:00.000Z",
          requestId: "request-1",
        });
      },
    );

    await expect(client.get(token)).resolves.toEqual({
      status: "active",
      subscriptionUrl: "https://sub.example/personal-secret",
      expiresAt: "2026-08-30T08:00:00.000Z",
    });
    expect(requests[0]).toEqual({
      url: "https://app.134134.ru/api/device-auth/configuration",
      init: expect.objectContaining({
        method: "GET",
        redirect: "error",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      }),
    });
  });

  it("maps subscription and credential failures to safe user messages", async () => {
    const required = new DeviceConfigurationClient(
      "https://app.134134.ru",
      async () =>
        Response.json(
          { status: "subscription_required", requestId: "request-2" },
          { status: 403 },
        ),
    );
    const unauthorized = new DeviceConfigurationClient(
      "https://app.134134.ru",
      async () =>
        Response.json(
          { status: "unauthorized", requestId: "request-3" },
          { status: 401 },
        ),
    );

    await expect(required.get(token)).rejects.toThrow("подписка");
    await expect(unauthorized.get(token)).rejects.toThrow("привяжите");
  });

  it("rejects a malformed configuration response", async () => {
    const client = new DeviceConfigurationClient(
      "https://app.134134.ru",
      async () =>
        Response.json({
          status: "active",
          subscriptionUrl: "javascript:alert(1)",
          expiresAt: "not-a-date",
        }),
    );

    await expect(client.get(token)).rejects.toThrow(
      "Некорректный ответ сервера",
    );
  });
});
