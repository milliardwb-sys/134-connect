import { z } from "zod";

const uuidSchema = z.string().uuid();
const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9._:-]+$/);
const networkSchema = z.enum(["tcp", "ws", "grpc"]);
const securitySchema = z.enum(["none", "tls", "reality"]);

export type VlessProfile = {
  protocol: "vless";
  userId: string;
  address: string;
  port: number;
  network: z.infer<typeof networkSchema>;
  security: z.infer<typeof securitySchema>;
  encryption: "none";
  flow?: string;
  serverName?: string;
  fingerprint?: string;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  path?: string;
  host?: string;
  serviceName?: string;
  remark: string;
};

type JsonRecord = Record<string, unknown>;

export type XrayConfiguration = {
  log: { loglevel: "warning" };
  inbounds: JsonRecord[];
  outbounds: JsonRecord[];
};

export function parseSubscription(rawPayload: string): VlessProfile {
  const payload = decodeSubscription(rawPayload);
  const link = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("vless://"));

  if (!link) {
    throw new Error("Подписка не содержит поддерживаемую VLESS-конфигурацию");
  }

  try {
    return parseVlessLink(link);
  } catch {
    throw new Error("Некорректная VLESS-конфигурация");
  }
}

function decodeSubscription(rawPayload: string): string {
  const value = rawPayload.trim();
  if (value.length === 0 || value.length > 1_048_576) {
    throw new Error("Некорректный размер подписки");
  }
  if (value.includes("vless://")) return value;

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    if (!decoded.includes("vless://")) {
      throw new Error("Missing VLESS link");
    }
    return decoded;
  } catch {
    throw new Error("Подписка не содержит поддерживаемую VLESS-конфигурацию");
  }
}

function parseVlessLink(link: string): VlessProfile {
  const url = new URL(link);
  if (
    url.protocol !== "vless:" ||
    url.password ||
    !url.hostname ||
    !url.port
  ) {
    throw new Error("Invalid VLESS URL");
  }

  const userId = uuidSchema.parse(decodeURIComponent(url.username));
  const address = hostnameSchema.parse(url.hostname);
  const port = z.coerce.number().int().min(1).max(65_535).parse(url.port);
  const network = networkSchema.parse(url.searchParams.get("type") ?? "tcp");
  const security = securitySchema.parse(
    url.searchParams.get("security") ?? "none",
  );
  const encryption = url.searchParams.get("encryption") ?? "none";
  if (encryption !== "none") throw new Error("Unsupported encryption");

  const profile: VlessProfile = {
    protocol: "vless",
    userId,
    address,
    port,
    network,
    security,
    encryption,
    remark: decodeURIComponent(url.hash.slice(1)).slice(0, 80),
  };
  assignOptional(profile, "flow", url.searchParams.get("flow"), 64);
  assignOptional(profile, "serverName", url.searchParams.get("sni"), 253);
  assignOptional(profile, "fingerprint", url.searchParams.get("fp"), 32);
  assignOptional(profile, "publicKey", url.searchParams.get("pbk"), 128);
  assignOptional(profile, "shortId", url.searchParams.get("sid"), 32);
  assignOptional(profile, "spiderX", url.searchParams.get("spx"), 256);
  assignOptional(profile, "path", url.searchParams.get("path"), 512);
  assignOptional(profile, "host", url.searchParams.get("host"), 253);
  assignOptional(
    profile,
    "serviceName",
    url.searchParams.get("serviceName"),
    256,
  );

  if (
    security === "reality" &&
    (!profile.serverName ||
      !profile.publicKey ||
      !profile.shortId)
  ) {
    throw new Error("Incomplete Reality configuration");
  }

  return profile;
}

function assignOptional<K extends keyof VlessProfile>(
  profile: VlessProfile,
  key: K,
  value: string | null,
  maxLength: number,
): void {
  if (!value) return;
  const decoded = decodeURIComponent(value);
  if (decoded.length > maxLength) {
    throw new Error(`VLESS ${String(key)} is too long`);
  }
  profile[key] = decoded as VlessProfile[K];
}

export function buildXrayConfiguration(
  profile: VlessProfile,
  outboundInterface?: string,
): XrayConfiguration {
  const streamSettings: JsonRecord = {
    network: profile.network,
    security: profile.security,
  };

  if (profile.security === "reality") {
    streamSettings.realitySettings = {
      serverName: profile.serverName,
      fingerprint: profile.fingerprint ?? "chrome",
      publicKey: profile.publicKey,
      shortId: profile.shortId,
      spiderX: profile.spiderX ?? "/",
    };
  } else if (profile.security === "tls") {
    streamSettings.tlsSettings = {
      serverName: profile.serverName,
      fingerprint: profile.fingerprint ?? "chrome",
    };
  }

  if (profile.network === "ws") {
    streamSettings.wsSettings = {
      path: profile.path ?? "/",
      headers: profile.host ? { Host: profile.host } : {},
    };
  } else if (profile.network === "grpc") {
    streamSettings.grpcSettings = {
      serviceName: profile.serviceName ?? "",
    };
  }

  if (outboundInterface) {
    streamSettings.sockopt = { interface: outboundInterface };
  }

  const user: JsonRecord = {
    id: profile.userId,
    encryption: "none",
  };
  if (profile.flow) user.flow = profile.flow;

  return {
    log: { loglevel: "warning" },
    inbounds: [
      {
        tag: "socks-in",
        listen: "127.0.0.1",
        port: 10808,
        protocol: "socks",
        settings: { udp: true },
      },
    ],
    outbounds: [
      {
        tag: "proxy",
        protocol: "vless",
        settings: {
          vnext: [
            {
              address: profile.address,
              port: profile.port,
              users: [user],
            },
          ],
        },
        streamSettings,
      },
      { tag: "direct", protocol: "freedom" },
      { tag: "blocked", protocol: "blackhole" },
    ],
  };
}
