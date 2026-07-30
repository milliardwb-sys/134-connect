import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const XRAY_VERSION = "v26.3.27";
const ARCHIVE = "Xray-windows-64.zip";
const EXPECTED_SHA256 =
  "d004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad";
const RELEASE_URL = `https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}/${ARCHIVE}`;

const root = process.cwd();
const resourcesDirectory = path.join(root, "resources", "xray");
const archivePath = path.join(resourcesDirectory, ARCHIVE);
const sevenZip = path.join(
  root,
  "node_modules",
  "7zip-bin",
  "win",
  "x64",
  "7za.exe",
);

await mkdir(resourcesDirectory, { recursive: true });
const response = await fetch(RELEASE_URL, {
  redirect: "follow",
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
  throw new Error(`Xray download failed with HTTP ${response.status}`);
}

const archive = Buffer.from(await response.arrayBuffer());
const actualSha256 = createHash("sha256").update(archive).digest("hex");
if (actualSha256 !== EXPECTED_SHA256) {
  throw new Error(
    `Xray checksum mismatch: expected ${EXPECTED_SHA256}, received ${actualSha256}`,
  );
}

await writeFile(archivePath, archive);
const extracted = spawnSync(
  sevenZip,
  ["x", archivePath, `-o${resourcesDirectory}`, "-y"],
  { stdio: "inherit", windowsHide: true },
);
await rm(archivePath, { force: true });

if (extracted.status !== 0) {
  throw new Error(`Xray extraction failed with code ${extracted.status}`);
}

console.log(`Verified ${ARCHIVE} ${XRAY_VERSION} (${actualSha256})`);
