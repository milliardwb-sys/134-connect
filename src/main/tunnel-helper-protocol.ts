import { z } from "zod";

import type { XrayConfiguration } from "./subscription-parser";

const jsonObjectSchema = z.record(z.string(), z.unknown());
const ipAddressSchema = z.union([z.ipv4(), z.ipv6()]);

export const tunnelLaunchRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    parentPid: z.number().int().positive(),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    createdAt: z.string().datetime({ offset: true }),
    bypassAddresses: z
      .array(ipAddressSchema)
      .min(1)
      .max(16)
      .refine((values) => new Set(values).size === values.length),
    xrayConfiguration: z
      .object({
        log: z.object({ loglevel: z.literal("warning") }).strict(),
        inbounds: z.array(jsonObjectSchema).min(1).max(16),
        outbounds: z.array(jsonObjectSchema).min(1).max(32),
      })
      .strict(),
  })
  .strict();

export type TunnelLaunchRequest = z.infer<
  typeof tunnelLaunchRequestSchema
>;

export type TunnelHelperArguments = {
  requestPath: string;
  requestSha256: string;
};

export function createTunnelLaunchRequest(input: {
  parentPid: number;
  nonce: string;
  bypassAddresses: string[];
  xrayConfiguration: XrayConfiguration;
  now?: Date;
}): TunnelLaunchRequest {
  return tunnelLaunchRequestSchema.parse({
    schemaVersion: 1,
    parentPid: input.parentPid,
    nonce: input.nonce,
    createdAt: (input.now ?? new Date()).toISOString(),
    bypassAddresses: input.bypassAddresses,
    xrayConfiguration: input.xrayConfiguration,
  });
}

export function parseTunnelHelperArguments(
  argv: readonly string[],
): TunnelHelperArguments | null {
  const index = argv.indexOf("--tunnel-helper");
  if (index < 0 || argv.length !== index + 3) return null;

  const encodedRequestPath = argv[index + 1];
  const requestSha256 = argv[index + 2];
  if (
    !encodedRequestPath ||
    !requestSha256 ||
    !/^[a-f0-9]{64}$/.test(requestSha256)
  ) {
    return null;
  }

  try {
    const requestPath = Buffer.from(
      encodedRequestPath,
      "base64url",
    ).toString("utf8");
    if (!requestPath) return null;
    return { requestPath, requestSha256 };
  } catch {
    return null;
  }
}
