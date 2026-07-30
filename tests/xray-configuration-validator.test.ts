import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { XrayConfigurationValidator } from "../src/main/xray-configuration-validator";

describe("XrayConfigurationValidator", () => {
  it("writes a private temporary config, validates it, and removes it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "134-xray-test-"));
    const calls: Array<{ executable: string; args: readonly string[] }> = [];
    const validator = new XrayConfigurationValidator(
      async (executable, args) => {
        calls.push({ executable, args });
      },
    );

    await validator.validate(
      "C:\\Program Files\\134\\xray.exe",
      directory,
      { log: { loglevel: "warning" }, inbounds: [], outbounds: [] },
    );

    expect(calls[0]?.executable).toBe(
      "C:\\Program Files\\134\\xray.exe",
    );
    expect(calls[0]?.args.slice(0, 3)).toEqual([
      "run",
      "-test",
      "-config",
    ]);
    expect(await readdir(directory)).toEqual([]);
  });

  it("removes the secret config even when Xray rejects it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "134-xray-test-"));
    const validator = new XrayConfigurationValidator(async () => {
      throw new Error("invalid config");
    });

    await expect(
      validator.validate("xray.exe", directory, {
        log: { loglevel: "warning" },
        inbounds: [],
        outbounds: [],
      }),
    ).rejects.toThrow("invalid config");
    expect(await readdir(directory)).toEqual([]);
  });
});
