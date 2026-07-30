import { z } from "zod";

export const appSnapshotSchema = z
  .object({
    version: z.string().min(1).max(32),
    platform: z.enum(["win32", "darwin", "linux"]),
    paired: z.boolean(),
    account: z
      .object({
        accountLabel: z.string().min(1).max(80),
        expiresAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable(),
    connectionStatus: z.enum([
      "unpaired",
      "disconnected",
      "connecting",
      "connected",
      "disconnecting",
      "error",
    ]),
  })
  .strict();

export type AppSnapshot = z.infer<typeof appSnapshotSchema>;

export const commandResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), snapshot: appSnapshotSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      message: z.string().min(1).max(240),
      incidentId: z.string().min(1).max(64).optional(),
    })
    .strict(),
]);

export type CommandResult = z.infer<typeof commandResultSchema>;

export const pairingStartResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      loginCode: z.string().min(9).max(9),
      expiresAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      message: z.string().min(1).max(240),
    })
    .strict(),
]);

export type PairingStartResult = z.infer<typeof pairingStartResultSchema>;

export type DesktopBridge = {
  getSnapshot(): Promise<AppSnapshot>;
  startPairing(): Promise<PairingStartResult>;
  checkPairing(): Promise<CommandResult>;
  connect(): Promise<CommandResult>;
  disconnect(): Promise<CommandResult>;
  openHelp(): Promise<void>;
};
