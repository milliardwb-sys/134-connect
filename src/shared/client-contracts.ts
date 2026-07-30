import { z } from "zod";

const requestIdSchema = z.string().uuid();

export const createPairingSessionResponseSchema = z
  .object({
    loginCode: z
      .string()
      .regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/),
    pollSecret: z.string().min(40).max(128),
    expiresAt: z.string().datetime({ offset: true }),
    requestId: requestIdSchema,
  })
  .strict();

const pairingPendingSchema = z
  .object({
    status: z.enum(["pending", "expired", "invalid", "limit_reached"]),
    requestId: requestIdSchema,
  })
  .strict();

const pairingIssuedSchema = z
  .object({
    status: z.literal("issued"),
    sessionToken: z.string().min(32).max(1_024),
    accountLabel: z.string().trim().min(1).max(80),
    expiresAt: z.string().datetime({ offset: true }),
    requestId: requestIdSchema,
  })
  .strict();

export const pairingPollResponseSchema = z.discriminatedUnion("status", [
  pairingPendingSchema,
  pairingIssuedSchema,
]);

export type PairingPollResponse = z.infer<typeof pairingPollResponseSchema>;
export type PairingIssuedResponse = z.infer<typeof pairingIssuedSchema>;

export type RendererAccount = {
  accountLabel: string;
  expiresAt: string;
};

export function toRendererAccount(
  response: PairingIssuedResponse,
): RendererAccount {
  return {
    accountLabel: response.accountLabel,
    expiresAt: response.expiresAt,
  };
}
