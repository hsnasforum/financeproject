import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./pnpm_runner.mjs";
import {
  copyPreservedDesktopState,
  isSameOrNestedDesktopPath,
  resolveProspectiveDesktopCanonicalPath,
} from "./planning_desktop_install_state.mjs";
import { loadPlanningDesktopEnvironment } from "./planning_v2_desktop_env.mjs";
import {
  formatPlanningSqliteDatabaseUrl,
  resolvePlanningSqliteDatabase,
} from "../src/lib/planning/deployment/runtimeDatabase.mjs";
import {
  resolvePlanningControlRoot,
  resolvePlanningDataRoot,
} from "../src/lib/planning/deployment/runtimeRoot.mjs";
import {
  currentGitSha,
  lockfileSha256,
  readPackageVersion,
} from "./planning_v2_desktop_provenance.mjs";
import {
  DESKTOP_VERIFY_MODE_PRISTINE_INSTALL,
  verifyPlanningDesktopArtifact,
} from "./planning_v2_desktop_verify.mjs";

const DESKTOP_RENAME_RETRYABLE_CODES = new Set(["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"]);
const DESKTOP_RENAME_MAX_ATTEMPTS = 61;
const DESKTOP_RENAME_RETRY_DELAY_MS = 250;
const DESKTOP_SOURCE_ONLY_FILES = new Set(["install.cmd", "install.sh"]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    from: ".dist/planning-v2-desktop",
    to: path.join(os.homedir(), "planning-v2-desktop"),
    selfContainedSource: false,
    skipInstall: false,
    skipShortcuts: false,
  };
  for (const token of argv) {
    if (token === "--self-contained-source") {
      out.selfContainedSource = true;
      continue;
    }
    if (token === "--skip-install") {
      out.skipInstall = true;
      continue;
    }
    if (token === "--skip-shortcuts") {
      out.skipShortcuts = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "from") out.from = asString(value) || out.from;
    if (key === "to") out.to = asString(value) || out.to;
  }
  return out;
}

function runCommand(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed (${code ?? "unknown"})`));
      }
    });
  });
}

function escapePwsh(value) {
  return String(value).replace(/'/g, "''");
}

function assertDesktopShortcutName(shortcutName) {
  const name = asString(shortcutName);
  if (
    !name
    || name === "."
    || name === ".."
    || /[<>:"/\\|?*\u0000-\u001F]/u.test(name)
    || /[. ]$/u.test(name)
  ) {
    throw new Error("desktop shortcut name contains unsupported Windows filename characters");
  }
  return name;
}

export function buildWindowsShortcutScript(
  installDir,
  shortcutName = "Planning v2",
  shortcutPaths = [],
) {
  const safeName = assertDesktopShortcutName(shortcutName);
  const target = path.join(installDir, "run.cmd");
  const targetEscaped = escapePwsh(target);
  const workEscaped = escapePwsh(installDir);
  const nameEscaped = escapePwsh(safeName);
  const pathsStatement = shortcutPaths.length > 0
    ? `$paths = @(${shortcutPaths.map((shortcutPath) => `'${escapePwsh(shortcutPath)}'`).join(", ")})`
    : "$paths = @((Join-Path $desktop ($name + '.lnk')), (Join-Path $programs ($name + '.lnk')))";
  return [
    "$ws = New-Object -ComObject WScript.Shell",
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$programs = [Environment]::GetFolderPath('Programs')",
    `$target = '${targetEscaped}'`,
    `$work = '${workEscaped}'`,
    `$name = '${nameEscaped}'`,
    pathsStatement,
    "$previous = @{}",
    "foreach ($linkPath in $paths) {",
    "  if ([IO.File]::Exists($linkPath)) { $previous[$linkPath] = [IO.File]::ReadAllBytes($linkPath) } else { $previous[$linkPath] = $null }",
    "}",
    "$touched = New-Object System.Collections.Generic.List[string]",
    "try {",
    "  foreach ($linkPath in $paths) {",
    "    $touched.Add($linkPath)",
    "    $shortcut = $ws.CreateShortcut($linkPath)",
    "    $shortcut.TargetPath = $target",
    "    $shortcut.WorkingDirectory = $work",
    "    $shortcut.IconLocation = $target",
    "    $shortcut.Save()",
    "  }",
    "} catch {",
    "  $creationError = $_.Exception",
    "  $rollbackFailures = New-Object System.Collections.Generic.List[System.Exception]",
    "  foreach ($linkPath in $touched) {",
    "    try {",
    "      if ($null -eq $previous[$linkPath]) { [IO.File]::Delete($linkPath) } else { [IO.File]::WriteAllBytes($linkPath, [byte[]]$previous[$linkPath]) }",
    "    } catch { $rollbackFailures.Add($_.Exception) }",
    "  }",
    "  if ($rollbackFailures.Count -gt 0) {",
    "    $failures = New-Object System.Collections.Generic.List[System.Exception]",
    "    $failures.Add($creationError)",
    "    foreach ($failure in $rollbackFailures) { $failures.Add($failure) }",
    "    throw [AggregateException]::new('desktop shortcut creation and rollback failed', $failures)",
    "  }",
    "  throw $creationError",
    "}",
  ].join("; ");
}

export function buildWindowsShortcutRemovalScript(
  shortcutName = "Planning v2",
  shortcutPaths = [],
) {
  const safeName = assertDesktopShortcutName(shortcutName);
  const nameEscaped = escapePwsh(safeName);
  const pathsStatement = shortcutPaths.length > 0
    ? `$paths = @(${shortcutPaths.map((shortcutPath) => `'${escapePwsh(shortcutPath)}'`).join(", ")})`
    : "$paths = @((Join-Path $desktop ($name + '.lnk')), (Join-Path $programs ($name + '.lnk')))";
  return [
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$programs = [Environment]::GetFolderPath('Programs')",
    `$name = '${nameEscaped}'`,
    pathsStatement,
    "$failures = New-Object System.Collections.Generic.List[System.Exception]",
    "foreach ($linkPath in $paths) {",
    "  try { [IO.File]::Delete($linkPath) } catch { $failures.Add($_.Exception) }",
    "}",
    "if ($failures.Count -gt 0) { throw [AggregateException]::new('desktop shortcut removal failed', $failures) }",
  ].join("; ");
}

export async function createWindowsShortcuts(
  installDir,
  shortcutName = "Planning v2",
  options = {},
) {
  if (process.platform !== "win32") return;
  const script = buildWindowsShortcutScript(
    installDir,
    shortcutName,
    options.shortcutPaths ?? [],
  );
  await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], installDir);
}

export async function removeWindowsShortcuts(
  shortcutName = "Planning v2",
  options = {},
) {
  if (process.platform !== "win32") return;
  const script = buildWindowsShortcutRemovalScript(
    shortcutName,
    options.shortcutPaths ?? [],
  );
  await runCommand(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    options.cwd ?? process.cwd(),
  );
}

function requireEqual(label, actual, expected) {
  if (actual === expected) return;
  throw new Error(`desktop provenance manifest mismatch: ${label} expected=${expected || "(empty)"} actual=${actual || "(empty)"}`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} source
 * @param {string} destination
 * @param {{
 *   rename?: (source: string, destination: string) => Promise<void>;
 *   wait?: (milliseconds: number) => Promise<unknown>;
 *   maxAttempts?: number;
 *   retryDelayMs?: number;
 * }} [options]
 */
export async function renameDesktopPath(source, destination, options = {}) {
  const rename = options.rename ?? fs.rename;
  const wait = options.wait ?? delay;
  const maxAttempts = options.maxAttempts ?? DESKTOP_RENAME_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DESKTOP_RENAME_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
      if (!DESKTOP_RENAME_RETRYABLE_CODES.has(code) || attempt === maxAttempts) {
        throw error;
      }
      await wait(retryDelayMs);
    }
  }
}

async function removeDesktopPath(target) {
  await fs.rm(target, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: DESKTOP_RENAME_RETRY_DELAY_MS,
  });
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return false;
    return true;
  }
}

/**
 * @param {{
 *   installDir?: string;
 *   env?: NodeJS.ProcessEnv;
 *   platform?: NodeJS.Platform;
 * }} [options]
 */
export async function assertDesktopInstallationStopped(options = {}) {
  const {
    installDir,
    env = process.env,
    platform = process.platform,
  } = options;
  const resolvedInstallDir = path.resolve(installDir ?? process.cwd());
  const runtimeEnv = { ...env };
  await loadPlanningDesktopEnvironment({
    cwd: resolvedInstallDir,
    env: runtimeEnv,
    authoritativeKeys: ["PLANNING_APP_NAME", "PLANNING_DATA_DIR"],
  });
  runtimeEnv.NODE_ENV = "production";
  const dataRoot = resolvePlanningDataRoot({
    cwd: resolvedInstallDir,
    env: runtimeEnv,
    platform,
  });
  const controlRoot = resolvePlanningControlRoot({
    cwd: resolvedInstallDir,
    env: runtimeEnv,
    platform,
  });
  const lockPath = path.join(controlRoot, "runtime", "desktop-instance.lock.json");
  let raw;
  try {
    const stats = await fs.lstat(lockPath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`desktop runtime lock is not a regular file: ${lockPath}`);
    }
    raw = await fs.readFile(lockPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return Object.freeze({ env: runtimeEnv, dataRoot, controlRoot, lockPath });
    }
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`desktop runtime lock cannot be verified; close the app and inspect ${lockPath}`);
  }
  const pid = Math.trunc(Number(payload?.pid));
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`desktop runtime lock cannot be verified; close the app and inspect ${lockPath}`);
  }
  if (isProcessAlive(pid)) {
    throw new Error(`desktop app is still running (pid=${pid}); close it before installing or updating`);
  }
  return Object.freeze({ env: runtimeEnv, dataRoot, controlRoot, lockPath });
}

export async function assertDesktopInstallPathsSeparated(fromDir, toDir) {
  const [canonicalSource, canonicalTarget] = await Promise.all([
    resolveProspectiveDesktopCanonicalPath(fromDir),
    resolveProspectiveDesktopCanonicalPath(toDir),
  ]);
  if (
    isSameOrNestedDesktopPath(canonicalSource, canonicalTarget)
    || isSameOrNestedDesktopPath(canonicalTarget, canonicalSource)
  ) {
    throw new Error("desktop artifact source and installation target must not overlap");
  }
  return Object.freeze({ canonicalSource, canonicalTarget });
}

async function copyArtifact(fromDir, stageDir) {
  await fs.mkdir(stageDir, { recursive: true });
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    if (DESKTOP_SOURCE_ONLY_FILES.has(entry.name)) continue;
    await fs.cp(
      path.join(fromDir, entry.name),
      path.join(stageDir, entry.name),
      { recursive: true, force: true, preserveTimestamps: true },
    );
  }
}

async function ensureDesktopEnv(stageDir) {
  const envPath = path.join(stageDir, ".env.local");
  if (await pathExists(envPath)) return false;
  const examplePath = path.join(stageDir, ".env.local.example");
  if (!await pathExists(examplePath)) {
    throw new Error(`desktop environment template missing: ${examplePath}`);
  }
  await fs.copyFile(examplePath, envPath);
  return true;
}

/**
 * @param {{
 *   stageDir: string;
 *   toDir?: string;
 *   env?: NodeJS.ProcessEnv;
 * }} options
 */
export async function resolveDesktopStageDatabaseEnvironment(options) {
  const stageDir = path.resolve(options.stageDir);
  const toDir = path.resolve(options.toDir ?? stageDir);
  const runtimeEnv = { ...(options.env ?? process.env) };
  await loadPlanningDesktopEnvironment({
    cwd: stageDir,
    env: runtimeEnv,
    authoritativeKeys: ["DATABASE_URL"],
  });
  const configured = resolvePlanningSqliteDatabase({ cwd: stageDir, env: runtimeEnv });
  let databasePath = configured.databasePath;

  if (!isSameOrNestedDesktopPath(stageDir, databasePath)) {
    if (!isSameOrNestedDesktopPath(toDir, databasePath)) {
      throw new Error(
        `desktop installation DATABASE_URL must stay inside the installation directory: ${databasePath}`,
      );
    }
    databasePath = path.join(stageDir, path.relative(toDir, databasePath));
  }

  const [canonicalStage, canonicalDatabase] = await Promise.all([
    fs.realpath(stageDir),
    resolveProspectiveDesktopCanonicalPath(databasePath),
  ]);
  if (!isSameOrNestedDesktopPath(canonicalStage, canonicalDatabase)) {
    throw new Error(
      `desktop installation DATABASE_URL must stay inside the installation directory: ${databasePath}`,
    );
  }

  const databaseUrl = formatPlanningSqliteDatabaseUrl({ cwd: stageDir, databasePath });
  runtimeEnv.DATABASE_URL = databaseUrl;
  return Object.freeze({ env: runtimeEnv, databasePath, databaseUrl });
}

async function prepareStage({ fromDir, toDir, stageDir, skipInstall }) {
  await copyArtifact(fromDir, stageDir);
  const preserved = await copyPreservedDesktopState({ existingDir: toDir, stageDir });
  await ensureDesktopEnv(stageDir);
  const database = await resolveDesktopStageDatabaseEnvironment({ stageDir, toDir });

  if (!skipInstall) {
    const result = await runPnpm(["install", "--frozen-lockfile"], {
      cwd: stageDir,
      env: database.env,
      stdio: "inherit",
    });
    if (result.code !== 0) {
      throw new Error(`pnpm install --frozen-lockfile failed with code ${result.code}`);
    }
  }

  await runCommand(
    process.execPath,
    ["scripts/prisma_cli_safe.mjs", "db", "push"],
    stageDir,
    database.env,
  );
  return preserved;
}

async function activateStage({ stageDir, toDir, backupDir }) {
  const hadExisting = await pathExists(toDir);
  if (hadExisting) await renameDesktopPath(toDir, backupDir);
  try {
    await renameDesktopPath(stageDir, toDir);
  } catch (error) {
    if (hadExisting && !await pathExists(toDir) && await pathExists(backupDir)) {
      try {
        await renameDesktopPath(backupDir, toDir);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "desktop installation activation and rollback both failed",
        );
      }
    }
    throw error;
  }
  return hadExisting;
}

async function rollbackActivation({ toDir, backupDir, hadExisting }) {
  await removeDesktopPath(toDir);
  if (hadExisting && await pathExists(backupDir)) {
    await renameDesktopPath(backupDir, toDir);
  }
}

async function verifyDesktopArtifact(fromDir, cwd, options = {}) {
  const verified = await verifyPlanningDesktopArtifact({
    artifactDir: fromDir,
    mode: DESKTOP_VERIFY_MODE_PRISTINE_INSTALL,
  });
  const manifest = verified.manifest;
  if (options.requireWorkspaceIdentity === false) {
    return {
      manifest,
      checksum: verified.checksum,
    };
  }
  const packageVersion = await readPackageVersion(cwd);
  requireEqual("version", asString(manifest.version), packageVersion);
  requireEqual("packageVersion", asString(manifest.packageVersion), packageVersion);

  const gitSha = currentGitSha(cwd);
  if (!gitSha) {
    throw new Error("desktop provenance manifest cannot be verified: current git SHA is unavailable");
  }
  requireEqual("gitSha", asString(manifest.gitSha).toLowerCase(), gitSha);

  const lockfileDigest = await lockfileSha256(cwd);
  requireEqual("lockfileSha256", asString(manifest.lockfileSha256), lockfileDigest);

  return {
    manifest,
    checksum: verified.checksum,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const fromDir = path.resolve(cwd, args.from);
  const toDir = path.resolve(cwd, args.to);
  await fs.access(fromDir);
  await assertDesktopInstallPathsSeparated(fromDir, toDir);
  const verified = await verifyDesktopArtifact(fromDir, cwd, {
    requireWorkspaceIdentity: !args.selfContainedSource,
  });
  await fs.mkdir(path.dirname(toDir), { recursive: true });
  await assertDesktopInstallationStopped({ installDir: toDir });
  const suffix = `${process.pid}-${randomUUID()}`;
  const stageDir = path.join(path.dirname(toDir), `.${path.basename(toDir)}.install-${suffix}`);
  const backupDir = path.join(path.dirname(toDir), `.${path.basename(toDir)}.backup-${suffix}`);
  let hadExisting = false;
  let activated = false;
  let preserved = [];
  let installationError = null;
  try {
    preserved = await prepareStage({ fromDir, toDir, stageDir, skipInstall: args.skipInstall });
    await assertDesktopInstallationStopped({ installDir: toDir });
    hadExisting = await activateStage({ stageDir, toDir, backupDir });
    activated = true;
    if (process.platform === "win32" && !args.skipShortcuts) {
      await createWindowsShortcuts(toDir, "Planning v2");
    }
  } catch (error) {
    if (activated) {
      try {
        await rollbackActivation({ toDir, backupDir, hadExisting });
      } catch (rollbackError) {
        installationError = new AggregateError(
          [error, rollbackError],
          "desktop installation failed and the previous installation could not be restored",
        );
      }
    }
    installationError ??= error;
  }
  let cleanupError = null;
  try {
    await removeDesktopPath(stageDir);
  } catch (error) {
    cleanupError = error;
  }
  if (installationError && cleanupError) {
    throw new AggregateError(
      [installationError, cleanupError],
      "desktop installation failed and the staging directory could not be removed",
    );
  }
  if (installationError) throw installationError;
  if (cleanupError) throw cleanupError;
  if (hadExisting) {
    await removeDesktopPath(backupDir);
  }

  process.stdout.write(
    `[planning:v2:desktop:install] verified version=${verified.manifest.version} gitSha=${verified.manifest.gitSha} files=${verified.checksum.fileCount}\n`,
  );
  process.stdout.write(`[planning:v2:desktop:install] installed=${toDir}\n`);
  process.stdout.write(`[planning:v2:desktop:install] preserved=${preserved.length}\n`);
  process.stdout.write(`[planning:v2:desktop:install] run=${process.platform === "win32" ? "run.cmd" : "./run.sh"}\n`);
}

const invokedPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[planning:v2:desktop:install] failed\n${message}\n`);
    process.exit(1);
  });
}
