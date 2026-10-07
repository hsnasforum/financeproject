import fs from "node:fs/promises";
import path from "node:path";
import {
  DESKTOP_MANIFEST_FILENAME,
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  lockfileSha256,
  readDesktopManifest,
  readPackageVersion,
} from "./planning_v2_desktop_provenance.mjs";

export const DESKTOP_OWNED_TOP_LEVEL = Object.freeze(new Set([
  ".env.local.example",
  ".next",
  "desktop-manifest.json",
  "install.cmd",
  "install.sh",
  "middleware.ts",
  "next.config.ts",
  "node_modules",
  "package.json",
  "pnpm-lock.yaml",
  "prisma.config.mjs",
  "public",
  "run.cmd",
  "run.sh",
  "scripts",
  "src",
  "tsconfig.json",
  "tsconfig.planning-v3.json",
  "uninstall.cmd",
  "uninstall.sh",
]));

const PRISMA_OWNED_ENTRIES = Object.freeze(new Set([
  "migrations",
  "schema.prisma",
]));
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isSameOrNestedDesktopPath(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveProspectiveDesktopCanonicalPath(candidatePath) {
  const unresolved = [];
  let cursor = path.resolve(candidatePath);

  while (true) {
    try {
      const canonical = await fs.realpath(cursor);
      return path.resolve(canonical, ...unresolved.reverse());
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
      const stats = await lstatOrNull(cursor);
      if (stats?.isSymbolicLink()) {
        throw new Error(`desktop path contains a dangling symlink or junction: ${cursor}`);
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      unresolved.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

export async function assertManagedDesktopDatabasePath({
  installDir,
  databasePath,
  allowExternal = false,
}) {
  if (allowExternal) return Object.freeze({ managed: true, allowedExternal: true });
  const resolvedInstallDir = path.resolve(installDir);
  const manifestPath = path.join(resolvedInstallDir, "desktop-manifest.json");
  const manifestStats = await lstatOrNull(manifestPath);
  if (!manifestStats) return Object.freeze({ managed: false, allowedExternal: false });
  if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
    throw new Error(`managed desktop manifest must be a regular file: ${manifestPath}`);
  }
  const [canonicalInstallDir, canonicalDatabasePath] = await Promise.all([
    fs.realpath(resolvedInstallDir),
    resolveProspectiveDesktopCanonicalPath(databasePath),
  ]);
  if (!isSameOrNestedDesktopPath(canonicalInstallDir, canonicalDatabasePath)) {
    throw new Error(
      `managed desktop DATABASE_URL must stay inside the installation directory: ${databasePath}`,
    );
  }
  return Object.freeze({ managed: true, allowedExternal: false });
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
  if (!stats) return false;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} must be a non-symlink directory: ${directoryPath}`);
  }
  return true;
}

async function requirePlainFile(filePath, label) {
  const stats = await lstatOrNull(filePath);
  if (!stats || stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${label} must be a non-symlink file: ${filePath}`);
  }
}

function assertDesktopChecksumIdentity(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || value.algorithm !== "sha256"
    || !SHA256_PATTERN.test(asString(value.value))
    || !Number.isInteger(value.fileCount)
    || value.fileCount < 0
    || !Number.isInteger(value.totalBytes)
    || value.totalBytes < 0
    || !Array.isArray(value.excludes)
    || value.excludes.length !== 1
    || value.excludes[0] !== DESKTOP_MANIFEST_FILENAME
  ) {
    throw new Error("desktop uninstall target has an invalid artifact checksum identity");
  }
}

export async function assertDesktopInstallationIdentity(targetDir) {
  const installDir = path.resolve(targetDir);
  if (!await requirePlainDirectory(installDir, "desktop uninstall target")) {
    throw new Error(`desktop uninstall target is not an installed directory: ${installDir}`);
  }

  await Promise.all([
    requirePlainFile(
      path.join(installDir, DESKTOP_MANIFEST_FILENAME),
      "desktop uninstall manifest",
    ),
    requirePlainFile(path.join(installDir, "package.json"), "desktop uninstall package"),
    requirePlainFile(path.join(installDir, "pnpm-lock.yaml"), "desktop uninstall lockfile"),
    requirePlainFile(
      path.join(installDir, ".env.local.example"),
      "desktop uninstall environment template",
    ),
    requirePlainFile(
      path.join(installDir, "scripts", "planning_desktop_install_state.mjs"),
      "desktop uninstall state module",
    ),
    requirePlainFile(
      path.join(installDir, "scripts", "planning_v2_desktop_uninstall.mjs"),
      "desktop uninstall module",
    ),
  ]);

  const manifest = await readDesktopManifest(installDir);
  const packageVersion = await readPackageVersion(installDir);
  if (
    manifest.kind !== DESKTOP_MANIFEST_KIND
    || manifest.provenanceVersion !== DESKTOP_PROVENANCE_VERSION
    || !packageVersion
    || packageVersion === "unknown"
    || asString(manifest.version) !== packageVersion
    || asString(manifest.packageVersion) !== packageVersion
    || !FULL_SHA_PATTERN.test(asString(manifest.gitSha))
    || !asString(manifest.platform)
    || !asString(manifest.arch)
    || !asString(manifest.nodeAbi)
  ) {
    throw new Error("desktop uninstall target identity does not match a managed installation");
  }
  const expectedLockfileSha256 = asString(manifest.lockfileSha256).toLowerCase();
  const actualLockfileSha256 = await lockfileSha256(installDir);
  if (!SHA256_PATTERN.test(expectedLockfileSha256) || expectedLockfileSha256 !== actualLockfileSha256) {
    throw new Error("desktop uninstall target lockfile identity does not match its manifest");
  }
  assertDesktopChecksumIdentity(manifest.artifactChecksum);

  return Object.freeze({ installDir, manifest });
}

async function copyPreservedEntry(sourcePath, targetPath, label) {
  const pending = [sourcePath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    const stats = await fs.lstat(currentPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} contains an unsupported symlink or junction: ${currentPath}`);
    }
    if (stats.isDirectory()) {
      for (const entry of await fs.readdir(currentPath)) {
        pending.push(path.join(currentPath, entry));
      }
      continue;
    }
    if (!stats.isFile()) {
      throw new Error(`${label} contains an unsupported filesystem entry: ${currentPath}`);
    }
  }
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.cp(sourcePath, targetPath, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    dereference: false,
    verbatimSymlinks: true,
  });
}

async function copyPreservedPrismaState(existingDir, stageDir) {
  const sourceDir = path.join(existingDir, "prisma");
  if (!await requirePlainDirectory(sourceDir, "existing Prisma state")) return [];
  const targetDir = path.join(stageDir, "prisma");
  await fs.mkdir(targetDir, { recursive: true });
  const preserved = [];
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    if (PRISMA_OWNED_ENTRIES.has(entry.name)) continue;
    await copyPreservedEntry(
      path.join(sourceDir, entry.name),
      path.join(targetDir, entry.name),
      "existing Prisma state",
    );
    preserved.push(`prisma/${entry.name}`);
  }
  return preserved;
}

export async function copyPreservedDesktopState({ existingDir, stageDir }) {
  if (!await requirePlainDirectory(existingDir, "existing desktop installation")) return [];
  await requirePlainDirectory(stageDir, "desktop installation stage");
  const preserved = [];
  for (const entry of await fs.readdir(existingDir, { withFileTypes: true })) {
    if (entry.name === "prisma") {
      preserved.push(...await copyPreservedPrismaState(existingDir, stageDir));
      continue;
    }
    if (DESKTOP_OWNED_TOP_LEVEL.has(entry.name)) continue;
    await copyPreservedEntry(
      path.join(existingDir, entry.name),
      path.join(stageDir, entry.name),
      "existing desktop state",
    );
    preserved.push(entry.name);
  }
  return preserved.sort((left, right) => left.localeCompare(right));
}

async function removeOwnedPrismaEntries(targetDir) {
  const prismaDir = path.join(targetDir, "prisma");
  if (!await requirePlainDirectory(prismaDir, "desktop Prisma directory")) return;
  for (const entry of PRISMA_OWNED_ENTRIES) {
    await fs.rm(path.join(prismaDir, entry), { recursive: true, force: true });
  }
  if ((await fs.readdir(prismaDir)).length === 0) {
    await fs.rmdir(prismaDir);
  }
}

/**
 * @param {string} targetDir
 * @param {{ preserveOwnedEntries?: string[] }} [options]
 */
export async function removeDesktopBinariesPreservingState(targetDir, options = {}) {
  await assertDesktopInstallationIdentity(targetDir);
  const preservedOwnedEntries = new Set(options.preserveOwnedEntries ?? []);
  for (const entry of preservedOwnedEntries) {
    if (!DESKTOP_OWNED_TOP_LEVEL.has(entry)) {
      throw new Error(`cannot preserve an unknown desktop package entry: ${entry}`);
    }
  }
  for (const entry of DESKTOP_OWNED_TOP_LEVEL) {
    if (preservedOwnedEntries.has(entry)) continue;
    await fs.rm(path.join(targetDir, entry), { recursive: true, force: true });
  }
  await removeOwnedPrismaEntries(targetDir);
  const remaining = (await fs.readdir(targetDir)).sort((left, right) => left.localeCompare(right));
  const preserved = remaining.filter((entry) => !preservedOwnedEntries.has(entry));
  if (remaining.length === 0) {
    await fs.rmdir(targetDir);
  }
  return preserved;
}
