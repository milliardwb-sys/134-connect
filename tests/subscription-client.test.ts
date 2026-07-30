import { describe, expect, it } from "vitest";

import { SubscriptionClient } from "../src/main/subscription-client";

describe("SubscriptionClient", () => {
  it("downloads a bounded HTTPS subscription with a client identity", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new SubscriptionClient(async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response("vless://example", {
        headers: { "content-length": "15" },
      });
    });

    await expect(
      client.get("https://sub.example/personal"),
    ).resolves.toBe("vless://example");
    expect(requests[0]).toEqual({
      url: "https://sub.example/personal",
      init: expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          accept: "text/plain",
          "user-agent": "134-Connect/0.1",
        }),
      }),
    });
  });

  it("rejects insecure URLs and oversized responses", async () => {
    const client = new SubscriptionClient(async () =>
      new Response("x", {
        headers: { "content-length": String(2 * 1_048_576) },
      }),
    );

    await expect(client.get("http://sub.example/secret")).rejects.toThrow(
      "HTTPS",
    );
    await expect(
      client.get("https://sub.example/secret"),
    ).rejects.toThrow("слишком");
  });
});
