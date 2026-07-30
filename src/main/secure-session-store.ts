import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeStorage } from "electron";
import { z } from "zod";

const storedSessionSchema = z
  .object({
    encryptedSession: z.string().min(1),
    accountLabel: z.string().min(1).max(80),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type StoredSession = z.infer<typeof storedSessionSchema>;

export class SecureSessionStore {
  readonly #filePath: string;

  public constructor(userDataPath: string) {
    this.#filePath = path.join(userDataPath, "session.json");
  }

  public async save(
    sessionToken: string,
    accountLabel: string,
    expiresAt: string,
  ): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Защищённое хранилище Windows недоступно");
    }

    const encryptedSession = safeStorage
      .encryptString(sessionToken)
      .toString("base64");
    const value = storedSessionSchema.parse({
      encryptedSession,
      accountLabel,
      expiresAt,
    });

    await mkdir(path.dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(value), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  public async load(): Promise<
    | (StoredSession & {
        sessionToken: string;
      })
    | null
  > {
    try {
      const raw = await readFile(this.#filePath, "utf8");
      const stored = storedSessionSchema.parse(JSON.parse(raw));

      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }

      return {
        ...stored,
        sessionToken: safeStorage.decryptString(
          Buffer.from(stored.encryptedSession, "base64"),
        ),
      };
    } catch {
      return null;
    }
  }
}
