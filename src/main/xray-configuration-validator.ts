import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { XrayConfiguration } from "./subscription-parser";

type RunExecutable = (
  executable: string,
  args: readonly string[],
) => Promise<void>;

const runExecutable: RunExecutable = (executable, args) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 256 * 1_024,
      },
      (error) => {
        if (error) reject(new Error("Xray отклонил конфигурацию"));
        else resolve();
      },
    );
  });

export class XrayConfigurationValidator {
  public constructor(
    private readonly execute: RunExecutable = runExecutable,
  ) {}

  public async validate(
    executable: string,
    runtimeDirectory: string,
    configuration: XrayConfiguration,
  ): Promise<void> {
    await mkdir(runtimeDirectory, { recursive: true });
    const configPath = path.join(
      runtimeDirectory,
      `xray-${randomUUID()}.json`,
    );

    try {
      await writeFile(configPath, JSON.stringify(configuration), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await this.execute(executable, [
        "run",
        "-test",
        "-config",
        configPath,
      ]);
    } finally {
      await rm(configPath, { force: true });
    }
  }
}
