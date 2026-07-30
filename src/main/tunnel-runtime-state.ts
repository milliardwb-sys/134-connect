import { z } from "zod";

export const tunnelRuntimeStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    nonce: z.string().regex(/^[a-f0-9]{32}$/),
    status: z.enum([
      "starting",
      "connected",
      "stopping",
      "disconnected",
      "error",
    ]),
    message: z.string().min(1).max(240).optional(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type TunnelRuntimeState = z.infer<
  typeof tunnelRuntimeStateSchema
>;

export function createTunnelRuntimeState(input: {
  nonce: string;
  status: TunnelRuntimeState["status"];
  message?: string;
  now?: Date;
}): TunnelRuntimeState {
  return tunnelRuntimeStateSchema.parse({
    schemaVersion: 1,
    nonce: input.nonce,
    status: input.status,
    message: input.message,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
}
