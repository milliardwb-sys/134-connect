import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const VERSION = "v0.8.3";
const COMMIT = "e271de19683937f23d3f8f0eb4df0a61fc4a6e50";
const ARCHIVE = "tun2proxy-x86_64-pc-windows-msvc.zip";
const EXPECTED_ARCHIVE_SHA256 =
  "76270c67698fa523b195ddf6473b80c4ad5be51865633d8ee60d72a020e957aa";
const EXPECTED_LICENSE_SHA256 =
  "8cddc80ccbbb14a8a3d7fee1fc1795d7fcd647f4c7063ad95246f9ff24b407c7";
const RELEASE_URL =
  `https://github.com/tun2proxy/tun2proxy/releases/download/${VERSION}/${ARCHIVE}`;
const LICENSE_URL =
  `https://raw.githubusercontent.com/tun2proxy/tun2proxy/${COMMIT}/LICENSE`;

const root = process.cwd();
const resourcesDirectory = path.join(root, "resources", "tun2proxy");
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
const archive = await downloadVerified(
  RELEASE_URL,
  EXPECTED_ARCHIVE_SHA256,
);
const license = await downloadVerified(
  LICENSE_URL,
  EXPECTED_LICENSE_SHA256,
);
await writeFile(archivePath, archive);
await writeFile(path.join(resourcesDirectory, "LICENSE"), license);

const extracted = spawnSync(
  sevenZip,
  ["x", archivePath, `-o${resourcesDirectory}`, "-y"],
  { stdio: "inherit", windowsHide: true },
);
await rm(archivePath, { force: true });
if (extracted.status !== 0) {
  throw new Error(`tun2proxy extraction failed with code ${extracted.status}`);
}

console.log(
  `Verified ${ARCHIVE} ${VERSION} (${EXPECTED_ARCHIVE_SHA256})`,
);

async function downloadVerified(url, expectedSha256) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }
  const content = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `Checksum mismatch: expected ${expectedSha256}, received ${actual}`,
    );
  }
  return content;
}
