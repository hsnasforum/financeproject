#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_MANIFEST_KIND,
  DESKTOP_MANIFEST_FILENAME,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  fileSha256,
  listArtifactFiles,
  readDesktopManifest,
} from "./planning_v2_desktop_provenance.mjs";

export const RELEASE_PROVENANCE_SCHEMA_VERSION = 1;
export const RELEASE_PROVENANCE_KIND = "planning-v2-desktop-release";
export const RELEASE_INVENTORY_KIND = "planning-v2-desktop-inventory";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REQUIRED_RELEASE_ARTIFACT_FILES = [
  ".next/standalone/server.js",
  ".next/standalone/.next/BUILD_ID",
  ".next/standalone/.next/required-server-files.json",
  ".next/standalone/.next/server/app-paths-manifest.json",
  "package.json",
  "pnpm-lock.yaml",
  "run.sh",
  "run.cmd",
  DESKTOP_MANIFEST_FILENAME,
];
const REQUIRED_NON_EMPTY_RUNTIME_DIRECTORIES = [
  ".next/standalone/.next/server",
  ".next/standalone/.next/static",
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireString(value, field) {
  const normalized = asString(value);
  if (!normalized) throw new Error(`release provenance ${field} is missing`);
  return normalized;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`release provenance ${field} is invalid`);
  }
  return value;
}

function requireIsoTimestamp(value, field) {
  const normalized = requireString(value, field);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalized) {
    throw new Error(`release provenance ${field} is invalid`);
  }
  return normalized;
}

function normalizeChecksum(value, field) {
  if (!isRecord(value) || value.algorithm !== "sha256" || !SHA256_PATTERN.test(asString(value.value))) {
    throw new Error(`release provenance ${field} is invalid`);
  }
  const excludes = Array.isArray(value.excludes)
    ? value.excludes.map((entry) => asString(entry)).filter(Boolean)
    : [];
  return {
    algorithm: "sha256",
    value: asString(value.value).toLowerCase(),
    fileCount: requireNonNegativeInteger(value.fileCount, `${field}.fileCount`),
    totalBytes: requireNonNegativeInteger(value.totalBytes, `${field}.totalBytes`),
    excludes,
  };
}

function checksumsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function lstatOrNull(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

async function requirePlainDirectory(directoryPath, label) {
  const stats = await lstatOrNull(directoryPath);
  if (!stats || stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a non-symlink directory: ${directoryPath}`);
  }
}

async function requirePlainFile(filePath, label) {
  const stats = await lstatOrNull(filePath);
  if (!stats || stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a non-symlink file: ${filePath}`);
  }
  return stats;
}

async function assertSupportedArtifactTree(rootDir, currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, "/");
    if (entry.isSymbolicLink()) {
      throw new Error(`release artifact contains unsupported symlink: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      await assertSupportedArtifactTree(rootDir, absolutePath);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`release artifact contains unsupported filesystem entry: ${relativePath}`);
    }
  }
}

async function requireNonEmptyRuntimeDirectory(artifactDir, relativePath) {
  const directoryPath = path.join(artifactDir, ...relativePath.split("/"));
  await requirePlainDirectory(directoryPath, `required release runtime ${relativePath}`);
  const files = await listArtifactFiles(directoryPath);
  if (files.length === 0) {
    throw new Error(`required release runtime directory is empty: ${relativePath}`);
  }
}

async function prepareOutputFile(filePath, label) {
  await requirePlainDirectory(path.dirname(filePath), `${label} parent`);
  const stats = await lstatOrNull(filePath);
  if (stats && (stats.isSymbolicLink() || !stats.isFile())) {
    throw new Error(`${label} output is not a regular file: ${filePath}`);
  }
}

function requireAssetBasename(value, field) {
  const normalized = requireString(value, field);
  if (path.basename(normalized) !== normalized || normalized === "." || normalized === "..") {
    throw new Error(`release provenance ${field} must be a basename`);
  }
  return normalized;
}

function requireArtifactRelativePath(value, field) {
  const normalized = requireString(value, field).replace(/\\/g, "/");
  if (normalized.startsWith("/")
    || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || /[\u0000\r\n\t]/.test(normalized)) {
    throw new Error(`release provenance ${field} is not a safe relative path`);
  }
  return normalized;
}

async function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function normalizeDesktopManifest(value) {
  if (!isRecord(value)) throw new Error("desktop provenance manifest is invalid");
  if (value.kind !== DESKTOP_MANIFEST_KIND || value.provenanceVersion !== DESKTOP_PROVENANCE_VERSION) {
    throw new Error("desktop provenance manifest schema is unsupported");
  }
  const version = requireString(value.version, "desktop version");
  const packageVersion = requireString(value.packageVersion, "desktop packageVersion");
  if (version !== packageVersion || !SEMVER_PATTERN.test(packageVersion)) {
    throw new Error("desktop provenance version fields do not match");
  }
  const gitSha = requireString(value.gitSha, "desktop gitSha").toLowerCase();
  if (!FULL_SHA_PATTERN.test(gitSha)) {
    throw new Error("desktop provenance gitSha is invalid");
  }
  const lockfileSha256 = requireString(value.lockfileSha256, "desktop lockfileSha256").toLowerCase();
  if (!SHA256_PATTERN.test(lockfileSha256)) {
    throw new Error("desktop provenance lockfileSha256 is invalid");
  }
  const artifactChecksum = normalizeChecksum(value.artifactChecksum, "desktop artifactChecksum");
  if (artifactChecksum.excludes.length !== 1 || artifactChecksum.excludes[0] !== DESKTOP_MANIFEST_FILENAME) {
    throw new Error("desktop provenance artifactChecksum excludes are invalid");
  }
  return {
    version,
    packageVersion,
    gitSha,
    lockfileSha256,
    artifactChecksum,
  };
}

function releaseAssetNames(tag) {
  return {
    archive: `planning-v2-desktop-${tag}.tar.gz`,
    inventory: `planning-v2-desktop-${tag}.inventory.json`,
    manifest: `planning-v2-desktop-${tag}.manifest.json`,
  };
}

async function createArchive(artifactDir, archivePath) {
  const result = spawnSync("tar", [
    "--sort=name",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    archivePath,
    "-C",
    path.dirname(artifactDir),
    path.basename(artifactDir),
  ], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error("release archive creation failed");
  }
  return requirePlainFile(archivePath, "release archive");
}

function detectPnpmVersion() {
  const result = spawnSync("pnpm", ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const version = asString(result.stdout);
  if (result.status !== 0 || !version) {
    throw new Error("release provenance could not resolve pnpm version");
  }
  return version;
}

async function buildInventory(artifactDir, sourceSha, artifactChecksum) {
  const contentFiles = await listArtifactFiles(artifactDir);
  const relativePaths = [...contentFiles, DESKTOP_MANIFEST_FILENAME]
    .sort((left, right) => left.localeCompare(right));
  if (relativePaths.length !== artifactChecksum.fileCount + 1) {
    throw new Error("release inventory file count does not match desktop artifactChecksum");
  }

  const files = [];
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(artifactDir, ...relativePath.split("/"));
    const stats = await requirePlainFile(absolutePath, "release inventory input");
    files.push({
      path: relativePath,
      bytes: stats.size,
      sha256: await fileSha256(absolutePath),
    });
  }
  return {
    schemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
    kind: RELEASE_INVENTORY_KIND,
    sourceSha,
    artifactChecksum,
    files,
  };
}

function normalizeAssetDescriptor(value, field) {
  if (!isRecord(value)) throw new Error(`release provenance ${field} is invalid`);
  const sha256 = requireString(value.sha256, `${field}.sha256`).toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`release provenance ${field}.sha256 is invalid`);
  }
  return {
    path: requireAssetBasename(value.path, `${field}.path`),
    sha256,
    bytes: requireNonNegativeInteger(value.bytes, `${field}.bytes`),
  };
}

function normalizeReleaseManifest(value) {
  if (!isRecord(value)) throw new Error("release provenance manifest is invalid");
  if (value.schemaVersion !== RELEASE_PROVENANCE_SCHEMA_VERSION || value.kind !== RELEASE_PROVENANCE_KIND) {
    throw new Error("release provenance manifest schema is unsupported");
  }
  const sourceSha = requireString(value.sourceSha, "sourceSha").toLowerCase();
  if (!FULL_SHA_PATTERN.test(sourceSha)) throw new Error("release provenance sourceSha is invalid");
  const packageVersion = requireString(value.packageVersion, "packageVersion");
  if (!SEMVER_PATTERN.test(packageVersion)) throw new Error("release provenance packageVersion is invalid");
  const tag = requireString(value.tag, "tag");
  if (tag !== `v${packageVersion}`) throw new Error("release provenance tag/version mismatch");
  if (!isRecord(value.toolchain)) throw new Error("release provenance toolchain is invalid");
  if (!isRecord(value.desktopArtifact)) throw new Error("release provenance desktopArtifact is invalid");
  if (!isRecord(value.inventory)) throw new Error("release provenance inventory is invalid");

  const inventory = {
    ...normalizeAssetDescriptor(value.inventory, "inventory"),
    fileCount: requireNonNegativeInteger(value.inventory.fileCount, "inventory.fileCount"),
  };
  const desktopDirectory = requireAssetBasename(
    value.desktopArtifact.directory,
    "desktopArtifact.directory",
  );
  const desktopManifestPath = requireArtifactRelativePath(
    value.desktopArtifact.manifestPath,
    "desktopArtifact.manifestPath",
  );
  if (desktopDirectory !== "planning-v2-desktop"
    || desktopManifestPath !== `${desktopDirectory}/${DESKTOP_MANIFEST_FILENAME}`) {
    throw new Error("release provenance desktop artifact paths are invalid");
  }
  const desktopArtifactChecksum = normalizeChecksum(
    value.desktopArtifact.artifactChecksum,
    "desktopArtifact.artifactChecksum",
  );
  if (desktopArtifactChecksum.excludes.length !== 1
    || desktopArtifactChecksum.excludes[0] !== DESKTOP_MANIFEST_FILENAME) {
    throw new Error("release provenance desktop artifactChecksum excludes are invalid");
  }
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    generatedAt: requireIsoTimestamp(value.generatedAt, "generatedAt"),
    sourceSha,
    tag,
    packageVersion,
    toolchain: {
      node: requireString(value.toolchain.node, "toolchain.node"),
      pnpm: requireString(value.toolchain.pnpm, "toolchain.pnpm"),
      platform: requireString(value.toolchain.platform, "toolchain.platform"),
      arch: requireString(value.toolchain.arch, "toolchain.arch"),
    },
    desktopArtifact: {
      directory: desktopDirectory,
      manifestPath: desktopManifestPath,
      manifestSha256: requireString(value.desktopArtifact.manifestSha256, "desktopArtifact.manifestSha256").toLowerCase(),
      lockfileSha256: requireString(value.desktopArtifact.lockfileSha256, "desktopArtifact.lockfileSha256").toLowerCase(),
      artifactChecksum: desktopArtifactChecksum,
    },
    archive: normalizeAssetDescriptor(value.archive, "archive"),
    inventory,
  };
}

/**
 * @param {{
 *   artifactDir: string;
 *   archivePath: string;
 *   inventoryPath: string;
 *   manifestPath: string;
 *   sourceSha: string;
 *   tag: string;
 *   nodeVersion?: string;
 *   pnpmVersion?: string;
 *   platform?: string;
 *   arch?: string;
 *   generatedAt?: string;
 * }} options
 */
export async function createReleaseArtifactProvenance(options) {
  const artifactDir = path.resolve(options.artifactDir);
  const archivePath = path.resolve(options.archivePath);
  const inventoryPath = path.resolve(options.inventoryPath);
  const manifestPath = path.resolve(options.manifestPath);
  const releaseDir = path.dirname(manifestPath);
  if (path.basename(artifactDir) !== "planning-v2-desktop") {
    throw new Error("release desktop artifact directory name is invalid");
  }
  if (path.dirname(archivePath) !== releaseDir || path.dirname(inventoryPath) !== releaseDir) {
    throw new Error("release archive, inventory, and manifest must share one directory");
  }
  if (new Set([archivePath, inventoryPath, manifestPath]).size !== 3) {
    throw new Error("release provenance output paths must be distinct");
  }

  const sourceSha = requireString(options.sourceSha, "sourceSha").toLowerCase();
  if (!FULL_SHA_PATTERN.test(sourceSha)) throw new Error("release provenance sourceSha is invalid");
  const tag = requireString(options.tag, "tag");
  const expectedNames = releaseAssetNames(tag);
  if (path.basename(archivePath) !== expectedNames.archive
    || path.basename(inventoryPath) !== expectedNames.inventory
    || path.basename(manifestPath) !== expectedNames.manifest) {
    throw new Error("release provenance output filenames do not match the tag");
  }
  await requirePlainDirectory(artifactDir, "desktop artifact directory");
  await assertSupportedArtifactTree(artifactDir);
  await prepareOutputFile(archivePath, "release archive");
  await prepareOutputFile(inventoryPath, "release inventory");
  await prepareOutputFile(manifestPath, "release manifest");

  const desktopManifestPath = path.join(artifactDir, DESKTOP_MANIFEST_FILENAME);
  for (const relativePath of REQUIRED_RELEASE_ARTIFACT_FILES) {
    const stats = await requirePlainFile(
      path.join(artifactDir, ...relativePath.split("/")),
      `required release artifact ${relativePath}`,
    );
    if (stats.size === 0) {
      throw new Error(`required release artifact is empty: ${relativePath}`);
    }
  }
  for (const relativePath of REQUIRED_NON_EMPTY_RUNTIME_DIRECTORIES) {
    await requireNonEmptyRuntimeDirectory(artifactDir, relativePath);
  }
  await requirePlainFile(desktopManifestPath, "desktop provenance manifest");
  const desktopManifest = normalizeDesktopManifest(await readDesktopManifest(artifactDir));
  if (desktopManifest.gitSha !== sourceSha) {
    throw new Error("desktop provenance source SHA does not match release source SHA");
  }
  if (tag !== `v${desktopManifest.packageVersion}`) {
    throw new Error("release tag does not match desktop package version");
  }
  const actualChecksum = normalizeChecksum(
    await computeArtifactChecksum(artifactDir),
    "recomputed desktop artifactChecksum",
  );
  if (!checksumsEqual(desktopManifest.artifactChecksum, actualChecksum)) {
    throw new Error("desktop artifactChecksum does not match release artifact contents");
  }

  const inventory = await buildInventory(artifactDir, sourceSha, actualChecksum);
  await fs.writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf-8");
  const inventoryStats = await requirePlainFile(inventoryPath, "release inventory");
  const archiveStats = await createArchive(artifactDir, archivePath);
  const generatedAt = requireIsoTimestamp(
    options.generatedAt ?? new Date().toISOString(),
    "generatedAt",
  );
  const manifest = {
    schemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
    kind: RELEASE_PROVENANCE_KIND,
    generatedAt,
    sourceSha,
    tag,
    packageVersion: desktopManifest.packageVersion,
    toolchain: {
      node: requireString(options.nodeVersion ?? process.version, "toolchain.node"),
      pnpm: requireString(options.pnpmVersion ?? detectPnpmVersion(), "toolchain.pnpm"),
      platform: requireString(options.platform ?? process.platform, "toolchain.platform"),
      arch: requireString(options.arch ?? process.arch, "toolchain.arch"),
    },
    desktopArtifact: {
      directory: path.basename(artifactDir),
      manifestPath: `${path.basename(artifactDir)}/${DESKTOP_MANIFEST_FILENAME}`,
      manifestSha256: await fileSha256(desktopManifestPath),
      lockfileSha256: desktopManifest.lockfileSha256,
      artifactChecksum: actualChecksum,
    },
    archive: {
      path: path.basename(archivePath),
      sha256: await fileSha256(archivePath),
      bytes: archiveStats.size,
    },
    inventory: {
      path: path.basename(inventoryPath),
      sha256: await fileSha256(inventoryPath),
      bytes: inventoryStats.size,
      fileCount: inventory.files.length,
    },
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  return normalizeReleaseManifest(manifest);
}

async function verifyAsset(releaseDir, descriptor, label) {
  const filePath = path.join(releaseDir, descriptor.path);
  const stats = await requirePlainFile(filePath, label);
  if (stats.size !== descriptor.bytes) {
    throw new Error(`${label} size does not match release provenance`);
  }
  const digest = await fileSha256(filePath);
  if (digest !== descriptor.sha256) {
    throw new Error(`${label} checksum does not match release provenance`);
  }
  return filePath;
}

/**
 * @param {{ manifestPath: string; sourceSha: string; tag: string }} options
 */
export async function verifyReleaseArtifactProvenance(options) {
  const manifestPath = path.resolve(options.manifestPath);
  const releaseDir = path.dirname(manifestPath);
  await requirePlainDirectory(releaseDir, "release directory");
  await requirePlainFile(manifestPath, "release provenance manifest");
  const manifest = normalizeReleaseManifest(
    await readJsonFile(manifestPath, "release provenance manifest"),
  );
  const sourceSha = requireString(options.sourceSha, "expected sourceSha").toLowerCase();
  const tag = requireString(options.tag, "expected tag");
  const expectedNames = releaseAssetNames(tag);
  if (path.basename(manifestPath) !== expectedNames.manifest
    || manifest.archive.path !== expectedNames.archive
    || manifest.inventory.path !== expectedNames.inventory) {
    throw new Error("release provenance asset filenames do not match the publish tag");
  }
  if (manifest.sourceSha !== sourceSha || manifest.tag !== tag) {
    throw new Error("release provenance does not match the publish event");
  }
  if (!SHA256_PATTERN.test(manifest.desktopArtifact.manifestSha256)) {
    throw new Error("release provenance desktop manifest checksum is invalid");
  }
  if (!SHA256_PATTERN.test(manifest.desktopArtifact.lockfileSha256)) {
    throw new Error("release provenance desktop lockfile checksum is invalid");
  }

  await verifyAsset(releaseDir, manifest.archive, "release archive");
  const inventoryPath = await verifyAsset(releaseDir, manifest.inventory, "release inventory");
  const inventory = await readJsonFile(inventoryPath, "release inventory");
  if (!isRecord(inventory)
    || inventory.schemaVersion !== RELEASE_PROVENANCE_SCHEMA_VERSION
    || inventory.kind !== RELEASE_INVENTORY_KIND
    || asString(inventory.sourceSha).toLowerCase() !== sourceSha
    || !Array.isArray(inventory.files)) {
    throw new Error("release inventory schema is invalid");
  }
  const inventoryChecksum = normalizeChecksum(inventory.artifactChecksum, "inventory artifactChecksum");
  if (!checksumsEqual(inventoryChecksum, manifest.desktopArtifact.artifactChecksum)) {
    throw new Error("release inventory artifactChecksum does not match manifest");
  }
  if (inventory.files.length !== manifest.inventory.fileCount) {
    throw new Error("release inventory file count does not match manifest");
  }
  const seenPaths = new Set();
  const inventoryRows = new Map();
  for (const [index, entry] of inventory.files.entries()) {
    if (!isRecord(entry)) throw new Error(`release inventory row ${index} is invalid`);
    const relativePath = requireArtifactRelativePath(entry.path, `inventory.files[${index}].path`);
    const sha256 = requireString(entry.sha256, `inventory.files[${index}].sha256`);
    requireNonNegativeInteger(entry.bytes, `inventory.files[${index}].bytes`);
    if (!SHA256_PATTERN.test(sha256) || seenPaths.has(relativePath)) {
      throw new Error(`release inventory row ${index} is invalid`);
    }
    seenPaths.add(relativePath);
    inventoryRows.set(relativePath, {
      sha256: sha256.toLowerCase(),
      bytes: entry.bytes,
    });
  }
  const desktopManifestRow = inventoryRows.get(DESKTOP_MANIFEST_FILENAME);
  const lockfileRow = inventoryRows.get("pnpm-lock.yaml");
  if (desktopManifestRow?.sha256 !== manifest.desktopArtifact.manifestSha256) {
    throw new Error("release inventory desktop manifest checksum does not match manifest");
  }
  if (lockfileRow?.sha256 !== manifest.desktopArtifact.lockfileSha256) {
    throw new Error("release inventory lockfile checksum does not match manifest");
  }
  return { ok: true, manifest };
}

function parseArgs(argv) {
  const options = {
    mode: "create",
    artifactDir: ".dist/planning-v2-desktop",
    archivePath: "",
    inventoryPath: "",
    manifestPath: "",
    sourceSha: process.env.GITHUB_SHA ?? "",
    tag: process.env.GITHUB_REF_NAME ?? "",
  };
  for (const token of argv) {
    if (!token.startsWith("--") || !token.includes("=")) {
      throw new Error(`unknown release provenance option: ${token}`);
    }
    const [rawKey, ...rest] = token.slice(2).split("=");
    const value = rest.join("=");
    if (rawKey === "mode") options.mode = value;
    else if (rawKey === "artifact-dir") options.artifactDir = value;
    else if (rawKey === "archive") options.archivePath = value;
    else if (rawKey === "inventory") options.inventoryPath = value;
    else if (rawKey === "manifest") options.manifestPath = value;
    else if (rawKey === "source-sha") options.sourceSha = value;
    else if (rawKey === "tag") options.tag = value;
    else throw new Error(`unknown release provenance option: ${token}`);
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "create") {
    const manifest = await createReleaseArtifactProvenance({
      artifactDir: args.artifactDir,
      archivePath: args.archivePath,
      inventoryPath: args.inventoryPath,
      manifestPath: args.manifestPath,
      sourceSha: args.sourceSha,
      tag: args.tag,
    });
    process.stdout.write(`[release:provenance] created ${args.manifestPath} sha=${manifest.sourceSha}\n`);
    return;
  }
  if (args.mode === "verify") {
    await verifyReleaseArtifactProvenance({
      manifestPath: args.manifestPath,
      sourceSha: args.sourceSha,
      tag: args.tag,
    });
    process.stdout.write(`[release:provenance] verified ${args.manifestPath}\n`);
    return;
  }
  throw new Error(`unsupported release provenance mode: ${args.mode}`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[release:provenance] ${message}\n`);
    process.exitCode = 1;
  });
}
