import {
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeStorage } from "electron";
import { z } from "zod";

const identitySchema = z
  .object({
    publicKey: z.string().min(32),
    encryptedPrivateKey: z.string().min(1),
  })
  .strict();

export type DeviceIdentity = {
  publicKey: string;
  privateKey: KeyObject;
};

export async function getOrCreateDeviceIdentity(
  userDataPath: string,
): Promise<DeviceIdentity> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Защищённое хранилище Windows недоступно");
  }

  const filePath = path.join(userDataPath, "device-identity.json");

  try {
    const stored = identitySchema.parse(
      JSON.parse(await readFile(filePath, "utf8")),
    );
    const privatePem = safeStorage.decryptString(
      Buffer.from(stored.encryptedPrivateKey, "base64"),
    );
    const { createPrivateKey } = await import("node:crypto");

    return {
      publicKey: stored.publicKey,
      privateKey: createPrivateKey(privatePem),
    };
  } catch {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const privatePem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        publicKey: publicPem,
        encryptedPrivateKey: safeStorage
          .encryptString(privatePem)
          .toString("base64"),
      }),
      { encoding: "utf8", mode: 0o600 },
    );

    return { publicKey: publicPem, privateKey };
  }
}
