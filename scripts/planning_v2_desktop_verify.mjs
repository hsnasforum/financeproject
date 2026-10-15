import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_MANIFEST_FILENAME,
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  lockfileSha256,
  readDesktopManifest,
  readPackageVersion,
} from "./planning_v2_desktop_provenance.mjs";

export const DESKTOP_VERIFY_MODE_RUNTIME = "runtime";
export const DESKTOP_VERIFY_MODE_PRISTINE_INSTALL = "pristine-install";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireEqual(label, actual, expected) {
  if (actual === expected) return;
  throw new Error(
    `desktop self-verification mismatch: ${label} expected=${expected || "(empty)"} actual=${actual || "(empty)"}`,
  );
}

function requireObject(value, label) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error(`desktop self-verification missing ${label}`);
}

async function assertRegularFile(filePath, label) {
  let stats;
  try {
    stats = await fs.lstat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`desktop self-verification missing ${label}: ${filePath}`);
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`desktop self-verification requires a regular ${label}: ${filePath}`);
  }
}

function parseArgs(argv) {
  const out = {
    mode: DESKTOP_VERIFY_MODE_RUNTIME,
    root: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const inlineValue = rawRest.join("=");
    const nextValue = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[index + 1]
      : "";
    const value = inlineValue || nextValue;
    if (!inlineValue && nextValue) index += 1;
    if (rawKey === "mode") out.mode = asString(value);
    if (rawKey === "root") out.root = asString(value) || out.root;
  }
  return out;
}

function assertVerifyMode(mode) {
  if (mode === DESKTOP_VERIFY_MODE_RUNTIME || mode === DESKTOP_VERIFY_MODE_PRISTINE_INSTALL) {
    return;
  }
  throw new Error(`unsupported desktop self-verification mode: ${mode || "(empty)"}`);
}

function assertChecksumContract(checksum) {
  const expected = requireObject(checksum, "artifactChecksum");
  requireEqual("artifactChecksum.algorithm", asString(expected.algorithm), "sha256");
  if (!/^[0-9a-f]{64}$/u.test(asString(expected.value))) {
    throw new Error("desktop self-verification invalid artifactChecksum.value");
  }
  if (!Number.isInteger(expected.fileCount) || expected.fileCount < 0) {
    throw new Error("desktop self-verification invalid artifactChecksum.fileCount");
  }
  if (!Number.isInteger(expected.totalBytes) || expected.totalBytes < 0) {
    throw new Error("desktop self-verification invalid artifactChecksum.totalBytes");
  }
  if (
    !Array.isArray(expected.excludes)
    || expected.excludes.length !== 1
    || expected.excludes[0] !== DESKTOP_MANIFEST_FILENAME
  ) {
    throw new Error("desktop self-verification invalid artifactChecksum.excludes");
  }
  return expected;
}

export async function verifyPlanningDesktopArtifact({
  artifactDir = process.cwd(),
  mode = DESKTOP_VERIFY_MODE_RUNTIME,
} = {}) {
  assertVerifyMode(mode);
  const root = path.resolve(artifactDir);
  // Check in a fixed order: with Promise.all the first lstat to settle decided which missing file
  // was reported, so input without a manifest could fail on package.json instead.
  for (const [relativePath, label] of [
    [DESKTOP_MANIFEST_FILENAME, "desktop manifest"],
    ["package.json", "package.json"],
    ["pnpm-lock.yaml", "pnpm lockfile"],
    [".env.local.example", "desktop environment template"],
  ]) {
    await assertRegularFile(path.join(root, relativePath), label);
  }

  const manifest = await readDesktopManifest(root);
  requireEqual("kind", asString(manifest.kind), DESKTOP_MANIFEST_KIND);
  requireEqual(
    "provenanceVersion",
    String(manifest.provenanceVersion ?? ""),
    String(DESKTOP_PROVENANCE_VERSION),
  );

  const packageVersion = await readPackageVersion(root);
  if (!packageVersion || packageVersion === "unknown") {
    throw new Error("desktop self-verification requires package.json version");
  }
  requireEqual("version", asString(manifest.version), packageVersion);
  requireEqual("packageVersion", asString(manifest.packageVersion), packageVersion);
  if (!/^[0-9a-f]{40}$/u.test(asString(manifest.gitSha))) {
    throw new Error("desktop self-verification invalid gitSha");
  }
  requireEqual("lockfileSha256", asString(manifest.lockfileSha256), await lockfileSha256(root));
  requireEqual("platform", asString(manifest.platform), process.platform);
  requireEqual("arch", asString(manifest.arch), process.arch);
  requireEqual("nodeAbi", asString(manifest.nodeAbi), process.versions.modules);

  const expectedChecksum = assertChecksumContract(manifest.artifactChecksum);
  let actualChecksum = null;
  if (mode === DESKTOP_VERIFY_MODE_PRISTINE_INSTALL) {
    actualChecksum = await computeArtifactChecksum(root);
    requireEqual("artifactChecksum.value", asString(expectedChecksum.value), actualChecksum.value);
    requireEqual(
      "artifactChecksum.fileCount",
      String(expectedChecksum.fileCount),
      String(actualChecksum.fileCount),
    );
    requireEqual(
      "artifactChecksum.totalBytes",
      String(expectedChecksum.totalBytes),
      String(actualChecksum.totalBytes),
    );
  }

  return { manifest, checksum: actualChecksum, mode, artifactDir: root };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await verifyPlanningDesktopArtifact({
    artifactDir: args.root,
    mode: args.mode,
  });
  process.stdout.write(
    `[planning:v2:desktop:verify] ok mode=${result.mode} version=${result.manifest.version} platform=${result.manifest.platform} arch=${result.manifest.arch} nodeAbi=${result.manifest.nodeAbi}\n`,
  );
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[planning:v2:desktop:verify] failed\n${message}\n`);
    process.exit(1);
  });
}
