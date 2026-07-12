import fs from "node:fs/promises";
import path from "node:path";
import { runPnpm } from "./pnpm_runner.mjs";
import {
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  currentGitSha,
  lockfileSha256,
  readPackageVersion,
} from "./planning_v2_desktop_provenance.mjs";

const REQUIRED_V3_ARTIFACT_FILES = [
  "src/lib/planning/v3/ops/doctor.ts",
  "src/lib/planning/v3/ops/refreshAll.ts",
  "src/lib/planning/v3/ops/export.ts",
  "src/lib/planning/v3/ops/restore.ts",
  "src/lib/planning/v3/report/weeklyHtml.ts",
  "tsconfig.planning-v3.json",
];

const SOURCE_ONLY_STANDALONE_ALIASES = [
  "tmp/txn-batch-detail-client-audit.tsx",
  "tmp/flow-v3-import-to-cashflow-audit.spec.ts",
];
// These known links are omitted or replaced from canonical project assets after standalone copy.
const REPLACED_STANDALONE_SYMLINKS = new Set([
  ...SOURCE_ONLY_STANDALONE_ALIASES,
  ".next/static",
  "public",
  "prisma",
]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    withNextBuild: true,
    artifactDir: ".dist/planning-v2-desktop",
  };
  for (const token of argv) {
    if (token === "--with-next-build") {
      out.withNextBuild = true;
      continue;
    }
    if (token === "--no-next-build") {
      out.withNextBuild = false;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "artifact-dir") out.artifactDir = asString(value) || out.artifactDir;
  }
  return out;
}

async function ensureFileExists(target) {
  try {
    await fs.access(target);
  } catch {
    throw new Error(`required file not found: ${target}`);
  }
}

async function copyIfExists(source, destination, options = {}) {
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  if (options.replaceDestination === true) {
    await fs.rm(destination, { recursive: true, force: true });
  }
  await fs.cp(source, destination, {
    recursive: true,
    force: true,
    dereference: options.dereferenceSource === true,
  });
  return true;
}

async function lstatOrNull(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}

function isPathWithin(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (
    relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

function pathsEqual(left, right) {
  const leftResolved = path.resolve(left);
  const rightResolved = path.resolve(right);
  return process.platform === "win32"
    ? leftResolved.toLowerCase() === rightResolved.toLowerCase()
    : leftResolved === rightResolved;
}

async function canResolveActivePackageFrom(resolutionFrom, packageName, activeDestination) {
  if (!resolutionFrom || !packageName) return false;
  const packagePath = packageName.split("/");
  let current = path.resolve(resolutionFrom);
  while (true) {
    if (path.basename(current) !== "node_modules") {
      const candidate = path.join(current, "node_modules", ...packagePath);
      if (pathsEqual(candidate, activeDestination)) return true;
      if (await lstatOrNull(candidate)) return false;
    }
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

async function canonicalPathForComparison(target) {
  const unresolvedSegments = [];
  let current = path.resolve(target);
  while (true) {
    try {
      const currentReal = await fs.realpath(current);
      return path.resolve(currentReal, ...unresolvedSegments.reverse());
    } catch (error) {
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      unresolvedSegments.push(path.basename(current));
      current = parent;
    }
  }
}

async function assertArtifactDoesNotOverlapStandalone(artifactDir, sourceStandaloneDir) {
  const [artifactComparable, sourceComparable] = await Promise.all([
    canonicalPathForComparison(artifactDir),
    canonicalPathForComparison(sourceStandaloneDir),
  ]);
  if (
    isPathWithin(sourceComparable, artifactComparable)
    || isPathWithin(artifactComparable, sourceComparable)
  ) {
    throw new Error(`desktop artifact directory overlaps source standalone: ${artifactDir}`);
  }
}

async function copyRegularFile(source, destination, stats) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  await fs.chmod(destination, stats.mode & 0o777);
}

async function resolveVirtualStorePackageContext(directoryReal, sourceRootReal) {
  const packageParent = path.dirname(directoryReal);
  let nodeModulesDir;
  let packageName;
  if (path.basename(packageParent) === "node_modules") {
    nodeModulesDir = packageParent;
    packageName = path.basename(directoryReal);
  } else {
    const scopeName = path.basename(packageParent);
    const scopeParent = path.dirname(packageParent);
    if (!scopeName.startsWith("@") || path.basename(scopeParent) !== "node_modules") return null;
    nodeModulesDir = scopeParent;
    packageName = `${scopeName}/${path.basename(directoryReal)}`;
  }

  const contextRelativePath = toPosixPath(path.relative(sourceRootReal, nodeModulesDir));
  if (
    !isPathWithin(sourceRootReal, nodeModulesDir)
    || !contextRelativePath.startsWith("node_modules/.pnpm/")
    || !contextRelativePath.endsWith("/node_modules")
  ) {
    return null;
  }

  const packageJsonPath = path.join(directoryReal, "package.json");
  const packageJsonStats = await lstatOrNull(packageJsonPath);
  if (!packageJsonStats || packageJsonStats.isSymbolicLink() || !packageJsonStats.isFile()) return null;
  let packageJson;
  try {
    packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  } catch {
    return null;
  }
  if (!packageJson || typeof packageJson !== "object" || packageJson.name !== packageName) return null;
  return { nodeModulesDir, packageName };
}

async function listPackageContextEntries(nodeModulesDir, relativePath) {
  const out = [];
  const entries = await fs.readdir(nodeModulesDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.name === ".prisma") {
      out.push({ packageName: entry.name, source: entryPath, allowRegularDirectory: true });
      continue;
    }
    if (entry.name.startsWith(".")) continue;
    if (!entry.name.startsWith("@")) {
      out.push({ packageName: entry.name, source: entryPath, allowRegularDirectory: false });
      continue;
    }
    const scopeStats = await fs.lstat(entryPath);
    if (scopeStats.isSymbolicLink() || !scopeStats.isDirectory()) {
      throw new Error(`desktop standalone package context has unsupported scope entry: ${relativePath}/node_modules/${entry.name}`);
    }
    const scopedEntries = await fs.readdir(entryPath, { withFileTypes: true });
    scopedEntries.sort((left, right) => left.name.localeCompare(right.name));
    for (const scopedEntry of scopedEntries) {
      if (scopedEntry.name.startsWith(".")) continue;
      out.push({
        packageName: `${entry.name}/${scopedEntry.name}`,
        source: path.join(entryPath, scopedEntry.name),
        allowRegularDirectory: false,
      });
    }
  }
  return out;
}

async function materializePackageResolutionContext({
  packageContext,
  destination,
  sourceRootReal,
  relativePath,
  activeDirectories,
  activePackages,
}) {
  const contextEntries = await listPackageContextEntries(packageContext.nodeModulesDir, relativePath);
  for (const entry of contextEntries) {
    if (entry.packageName === packageContext.packageName) continue;
    const dependencyDestination = path.join(destination, "node_modules", ...entry.packageName.split("/"));
    if (await lstatOrNull(dependencyDestination)) continue;
    const entryStats = await fs.lstat(entry.source);
    if (!entryStats.isSymbolicLink()) {
      if (entry.allowRegularDirectory && entryStats.isDirectory()) {
        await copyResolvedStandaloneEntry({
          source: entry.source,
          destination: dependencyDestination,
          sourceRootReal,
          relativePath: `${relativePath}/node_modules/${entry.packageName}`,
          activeDirectories,
          activePackages,
          stats: entryStats,
        });
        continue;
      }
      throw new Error(
        `desktop standalone package context dependency must be a symlink: ${relativePath}/node_modules/${entry.packageName}`,
      );
    }
    await materializeStandaloneEntry({
      source: entry.source,
      destination: dependencyDestination,
      sourceRootReal,
      relativePath: `${relativePath}/node_modules/${entry.packageName}`,
      activeDirectories,
      activePackages,
      resolutionFrom: destination,
      requestedPackageName: entry.packageName,
    });
  }
}

async function copyResolvedStandaloneEntry({
  source,
  destination,
  sourceRootReal,
  relativePath,
  activeDirectories,
  activePackages,
  stats,
  packageContext = null,
}) {
  if (stats.isFile()) {
    await copyRegularFile(source, destination, stats);
    return;
  }
  if (!stats.isDirectory()) {
    throw new Error(`desktop standalone contains unsupported filesystem entry: ${relativePath}`);
  }

  const directoryReal = await fs.realpath(source);
  if (!isPathWithin(sourceRootReal, directoryReal)) {
    throw new Error(`desktop standalone directory escapes source root: ${relativePath} -> ${directoryReal}`);
  }
  if (activeDirectories.has(directoryReal)) {
    throw new Error(`desktop standalone symlink cycle detected: ${relativePath}`);
  }

  activeDirectories.add(directoryReal);
  if (packageContext) {
    activePackages.set(directoryReal, {
      destination,
      packageName: packageContext.packageName,
    });
  }
  try {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(directoryReal, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      await materializeStandaloneEntry({
        source: path.join(directoryReal, entry.name),
        destination: path.join(destination, entry.name),
        sourceRootReal,
        relativePath: childRelativePath,
        activeDirectories,
        activePackages,
      });
    }
    if (packageContext) {
      await materializePackageResolutionContext({
        packageContext,
        destination,
        sourceRootReal,
        relativePath,
        activeDirectories,
        activePackages,
      });
    }
  } finally {
    if (packageContext && pathsEqual(activePackages.get(directoryReal)?.destination || "", destination)) {
      activePackages.delete(directoryReal);
    }
    activeDirectories.delete(directoryReal);
  }
}

async function materializeStandaloneEntry({
  source,
  destination,
  sourceRootReal,
  relativePath,
  activeDirectories,
  activePackages,
  resolutionFrom = "",
  requestedPackageName = "",
}) {
  const stats = await fs.lstat(source);
  if (!stats.isSymbolicLink()) {
    await copyResolvedStandaloneEntry({
      source,
      destination,
      sourceRootReal,
      relativePath,
      activeDirectories,
      activePackages,
      stats,
    });
    return;
  }

  const portableRelativePath = toPosixPath(relativePath);
  if (REPLACED_STANDALONE_SYMLINKS.has(portableRelativePath)) return;

  let targetReal;
  try {
    targetReal = await fs.realpath(source);
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : "";
    if (code === "ELOOP") {
      throw new Error(`desktop standalone contains cyclic symlink: ${portableRelativePath}`);
    }
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new Error(`desktop standalone contains dangling symlink: ${portableRelativePath}`);
    }
    throw new Error(`desktop standalone symlink target could not be resolved: ${portableRelativePath} (${code || "unknown"})`);
  }
  if (!isPathWithin(sourceRootReal, targetReal)) {
    throw new Error(`desktop standalone symlink escapes source root: ${portableRelativePath} -> ${targetReal}`);
  }

  const targetStats = await fs.lstat(targetReal);
  if (targetStats.isFile()) {
    throw new Error(`desktop standalone contains unsupported file symlink: ${portableRelativePath}`);
  }
  if (targetStats.isDirectory() && activeDirectories.has(targetReal)) {
    const activePackage = activePackages.get(targetReal);
    if (
      activePackage
      && requestedPackageName === activePackage.packageName
      && await canResolveActivePackageFrom(
        resolutionFrom,
        requestedPackageName,
        activePackage.destination,
      )
    ) {
      return;
    }
    throw new Error(`desktop standalone symlink cycle detected: ${portableRelativePath}`);
  }
  const packageContext = targetStats.isDirectory()
    ? await resolveVirtualStorePackageContext(targetReal, sourceRootReal)
    : null;
  if (!packageContext) {
    throw new Error(`desktop standalone contains unsupported directory symlink: ${portableRelativePath}`);
  }
  await copyResolvedStandaloneEntry({
    source: targetReal,
    destination,
    sourceRootReal,
    relativePath: portableRelativePath,
    activeDirectories,
    activePackages,
    stats: targetStats,
    packageContext,
  });
}

async function copyStandaloneIfExists(source, destination) {
  const sourceStats = await lstatOrNull(source);
  if (!sourceStats) return false;
  if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
    throw new Error(`desktop standalone source must be a non-symlink directory: ${source}`);
  }
  const sourceRootReal = await fs.realpath(source);
  await copyResolvedStandaloneEntry({
    source: sourceRootReal,
    destination,
    sourceRootReal,
    relativePath: "",
    activeDirectories: new Set(),
    activePackages: new Map(),
    stats: sourceStats,
  });
  return true;
}

async function copyPrismaAssets(cwd, artifactDir) {
  const sourceDir = path.join(cwd, "prisma");
  const targetDir = path.join(artifactDir, "prisma");
  try {
    await fs.access(sourceDir);
  } catch {
    return false;
  }
  await fs.mkdir(targetDir, { recursive: true });
  await copyIfExists(path.join(sourceDir, "schema.prisma"), path.join(targetDir, "schema.prisma"));
  await copyIfExists(path.join(sourceDir, "migrations"), path.join(targetDir, "migrations"));
  return true;
}

function buildInstallSh() {
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env.local ] && [ -f .env.local.example ]; then
  cp .env.local.example .env.local
fi
pnpm install --frozen-lockfile
printf "[planning:v2:desktop] install complete\\n"
`;
}

function buildRunSh() {
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="\${PORT:-3100}"
export PLANNING_PACKAGED_MODE="1"
export PLANNING_RUNTIME_MODE="packaged"
export PLANNING_APP_NAME="\${PLANNING_APP_NAME:-PlanningV2}"
node scripts/planning_v2_desktop_launch.mjs --runtime prod --port "$PORT" --path "/planning"
`;
}

function buildInstallCmd() {
  return `@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.local" if exist ".env.local.example" copy ".env.local.example" ".env.local" >nul
pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
set TARGET=%CD%\\run.cmd
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $programs = [Environment]::GetFolderPath('Programs'); $paths = @((Join-Path $desktop 'Planning v2.lnk'), (Join-Path $programs 'Planning v2.lnk')); foreach ($p in $paths) { $s = $ws.CreateShortcut($p); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%CD%'; $s.IconLocation = '%TARGET%'; $s.Save() }"
echo [planning:v2:desktop] install complete
`;
}

function buildRunCmd() {
  return `@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3100
set PLANNING_PACKAGED_MODE=1
set PLANNING_RUNTIME_MODE=packaged
if "%PLANNING_APP_NAME%"=="" set PLANNING_APP_NAME=PlanningV2
node scripts/planning_v2_desktop_launch.mjs --runtime prod --port %PORT% --path /planning
`;
}

function buildUninstallSh() {
  return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[planning:v2:desktop] uninstall started (binaries only)"
node scripts/planning_v2_desktop_uninstall.mjs --target "$(pwd)"
`;
}

function buildUninstallCmd() {
  return `@echo off
setlocal
cd /d "%~dp0"
echo [planning:v2:desktop] uninstall started (binaries only)
node scripts/planning_v2_desktop_uninstall.mjs --target "%CD%"
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const artifactDir = path.resolve(cwd, args.artifactDir);
  const sourceStandaloneDir = path.join(cwd, ".next", "standalone");
  await assertArtifactDoesNotOverlapStandalone(artifactDir, sourceStandaloneDir);

  if (args.withNextBuild) {
    const result = await runPnpm(["build"], {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    if (result.code !== 0) {
      throw new Error(`pnpm build failed with code ${result.code}`);
    }
  }

  await ensureFileExists(path.join(cwd, "src"));
  await ensureFileExists(path.join(cwd, "scripts"));
  await ensureFileExists(path.join(cwd, "package.json"));
  await ensureFileExists(path.join(cwd, "pnpm-lock.yaml"));
  for (const relativePath of REQUIRED_V3_ARTIFACT_FILES) {
    await ensureFileExists(path.join(cwd, relativePath));
  }

  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });

  await copyIfExists(path.join(cwd, "src"), path.join(artifactDir, "src"));
  await copyIfExists(path.join(cwd, "public"), path.join(artifactDir, "public"));
  await copyIfExists(path.join(cwd, "scripts"), path.join(artifactDir, "scripts"));
  await copyPrismaAssets(cwd, artifactDir);
  await copyIfExists(path.join(cwd, "next.config.ts"), path.join(artifactDir, "next.config.ts"));
  await copyIfExists(path.join(cwd, "tsconfig.json"), path.join(artifactDir, "tsconfig.json"));
  await copyIfExists(path.join(cwd, "tsconfig.planning-v3.json"), path.join(artifactDir, "tsconfig.planning-v3.json"));
  await copyIfExists(path.join(cwd, "middleware.ts"), path.join(artifactDir, "middleware.ts"));
  await copyIfExists(path.join(cwd, ".env.local.example"), path.join(artifactDir, ".env.local.example"));
  const artifactStandaloneDir = path.join(artifactDir, ".next", "standalone");
  await copyStandaloneIfExists(sourceStandaloneDir, artifactStandaloneDir);
  await copyIfExists(path.join(cwd, ".next", "static"), path.join(artifactDir, ".next", "static"));
  await copyIfExists(
    path.join(cwd, ".next", "static"),
    path.join(artifactStandaloneDir, ".next", "static"),
    { replaceDestination: true },
  );

  await fs.copyFile(path.join(cwd, "package.json"), path.join(artifactDir, "package.json"));
  await fs.copyFile(path.join(cwd, "pnpm-lock.yaml"), path.join(artifactDir, "pnpm-lock.yaml"));

  await fs.writeFile(path.join(artifactDir, "install.sh"), buildInstallSh(), "utf-8");
  await fs.writeFile(path.join(artifactDir, "run.sh"), buildRunSh(), "utf-8");
  await fs.writeFile(path.join(artifactDir, "uninstall.sh"), buildUninstallSh(), "utf-8");
  await fs.writeFile(path.join(artifactDir, "install.cmd"), buildInstallCmd(), "utf-8");
  await fs.writeFile(path.join(artifactDir, "run.cmd"), buildRunCmd(), "utf-8");
  await fs.writeFile(path.join(artifactDir, "uninstall.cmd"), buildUninstallCmd(), "utf-8");
  await fs.chmod(path.join(artifactDir, "install.sh"), 0o755);
  await fs.chmod(path.join(artifactDir, "run.sh"), 0o755);
  await fs.chmod(path.join(artifactDir, "uninstall.sh"), 0o755);

  const packageVersion = await readPackageVersion(cwd);
  const gitSha = currentGitSha(cwd);
  if (!gitSha) {
    throw new Error("git SHA could not be resolved for desktop provenance manifest");
  }
  const lockfileDigest = await lockfileSha256(cwd);
  const artifactChecksum = await computeArtifactChecksum(artifactDir);
  const manifest = {
    kind: DESKTOP_MANIFEST_KIND,
    provenanceVersion: DESKTOP_PROVENANCE_VERSION,
    version: packageVersion,
    packageVersion,
    gitSha,
    lockfileSha256: lockfileDigest,
    builtAt: new Date().toISOString(),
    artifactChecksum,
    localOnlyDefault: true,
    runtimeMode: "next-prod-local-only",
    packagingOption: "C (node-based portable runtime)",
    localDataDir: "os-standard-appdata",
    runCommand: process.platform === "win32" ? "run.cmd" : "./run.sh",
    installCommand: process.platform === "win32" ? "install.cmd" : "./install.sh",
    note: "HOST=127.0.0.1 강제, standalone 우선, dataDir는 OS 표준 앱데이터 경로입니다.",
  };
  await fs.writeFile(path.join(artifactDir, "desktop-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  process.stdout.write(`[planning:v2:desktop:build] artifact=${artifactDir}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:desktop:build] failed\n${message}\n`);
  process.exit(1);
});
