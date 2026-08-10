import { describe, expect, it } from "vitest";

import {
  buildXrayConfiguration,
  parseSubscription,
} from "../src/main/subscription-parser";

const realityLink =
  "vless://22222222-2222-4222-8222-222222222222@edge.example.com:443" +
  "?type=tcp&security=reality&sni=cdn.example.com&fp=chrome" +
  "&pbk=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk&sid=0123456789abcdef" +
  "&spx=%2F&flow=xtls-rprx-vision#134%20Germany";

describe("subscription parser", () => {
  it("parses a plain VLESS Reality subscription", () => {
    const profile = parseSubscription(`${realityLink}\n`);

    expect(profile.protocol).toBe("vless");
    expect(profile.address).toBe("edge.example.com");
    expect(profile.port).toBe(443);
    expect(profile.security).toBe("reality");
    expect(profile.remark).toBe("134 Germany");
  });

  it("decodes a base64 subscription and ignores unrelated lines", () => {
    const payload = Buffer.from(
      `# managed by 134\n${realityLink}\n`,
      "utf8",
    ).toString("base64");

    expect(parseSubscription(payload).userId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("builds an Xray config with a local SOCKS endpoint and bound outbound", () => {
    const config = buildXrayConfiguration(
      parseSubscription(realityLink),
      "Wi-Fi",
    );

    expect(config.inbounds[0]).toMatchObject({
      listen: "127.0.0.1",
      port: 10808,
      protocol: "socks",
    });
    expect(config.outbounds[0]).toMatchObject({
      protocol: "vless",
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          serverName: "cdn.example.com",
          fingerprint: "chrome",
          publicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijk",
          shortId: "0123456789abcdef",
          spiderX: "/",
        },
        sockopt: { interface: "Wi-Fi" },
      },
    });
  });

  it("rejects unsupported, malformed, or credential-bearing links", () => {
    expect(() => parseSubscription("trojan://secret@example.com:443")).toThrow(
      "VLESS",
    );
    expect(() =>
      parseSubscription(
        "vless://not-a-uuid@example.com:443?security=reality",
      ),
    ).toThrow("VLESS");
    expect(() =>
      parseSubscription(
        "vless://22222222-2222-4222-8222-222222222222:user@example.com:443",
      ),
    ).toThrow("VLESS");
  });
});
