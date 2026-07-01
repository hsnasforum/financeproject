import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { runPnpm } from "./pnpm_runner.mjs";
import {
  DESKTOP_MANIFEST_KIND,
  DESKTOP_PROVENANCE_VERSION,
  computeArtifactChecksum,
  currentGitSha,
  lockfileSha256,
  readDesktopManifest,
  readPackageVersion,
} from "./planning_v2_desktop_provenance.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    from: ".dist/planning-v2-desktop",
    to: path.join(os.homedir(), "planning-v2-desktop"),
    skipInstall: false,
  };
  for (const token of argv) {
    if (token === "--skip-install") {
      out.skipInstall = true;
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

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
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

async function createWindowsShortcuts(installDir, shortcutName = "Planning v2") {
  if (process.platform !== "win32") return;
  const target = path.join(installDir, "run.cmd");
  const targetEscaped = escapePwsh(target);
  const workEscaped = escapePwsh(installDir);
  const nameEscaped = escapePwsh(shortcutName);
  const script = [
    "$ws = New-Object -ComObject WScript.Shell",
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$programs = [Environment]::GetFolderPath('Programs')",
    `$target = '${targetEscaped}'`,
    `$work = '${workEscaped}'`,
    `$name = '${nameEscaped}'`,
    "$paths = @((Join-Path $desktop ($name + '.lnk')), (Join-Path $programs ($name + '.lnk')))",
    "foreach ($linkPath in $paths) {",
    "  $shortcut = $ws.CreateShortcut($linkPath)",
    "  $shortcut.TargetPath = $target",
    "  $shortcut.WorkingDirectory = $work",
    "  $shortcut.IconLocation = $target",
    "  $shortcut.Save()",
    "}",
  ].join("; ");
  await runCommand("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], installDir);
}

function requireEqual(label, actual, expected) {
  if (actual === expected) return;
  throw new Error(`desktop provenance manifest mismatch: ${label} expected=${expected || "(empty)"} actual=${actual || "(empty)"}`);
}

function requireObject(value, label) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  throw new Error(`desktop provenance manifest missing ${label}`);
}

async function verifyDesktopArtifact(fromDir, cwd) {
  const manifest = await readDesktopManifest(fromDir);
  requireEqual("kind", asString(manifest.kind), DESKTOP_MANIFEST_KIND);
  requireEqual("provenanceVersion", String(manifest.provenanceVersion ?? ""), String(DESKTOP_PROVENANCE_VERSION));

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

  const expectedChecksum = requireObject(manifest.artifactChecksum, "artifactChecksum");
  requireEqual("artifactChecksum.algorithm", asString(expectedChecksum.algorithm), "sha256");
  const actualChecksum = await computeArtifactChecksum(fromDir);
  requireEqual("artifactChecksum.value", asString(expectedChecksum.value), actualChecksum.value);
  requireEqual("artifactChecksum.fileCount", String(expectedChecksum.fileCount ?? ""), String(actualChecksum.fileCount));
  requireEqual("artifactChecksum.totalBytes", String(expectedChecksum.totalBytes ?? ""), String(actualChecksum.totalBytes));

  return {
    manifest,
    checksum: actualChecksum,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const fromDir = path.resolve(cwd, args.from);
  const toDir = path.resolve(cwd, args.to);

  await fs.access(fromDir);
  const verified = await verifyDesktopArtifact(fromDir, cwd);
  await fs.rm(toDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(toDir), { recursive: true });
  await fs.mkdir(toDir, { recursive: true });
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(fromDir, entry.name);
    const targetPath = path.join(toDir, entry.name);
    await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
  }

  if (!args.skipInstall) {
    const result = await runPnpm(["install", "--frozen-lockfile"], {
      cwd: toDir,
      env: process.env,
      stdio: "inherit",
    });
    if (result.code !== 0) {
      throw new Error(`pnpm install --frozen-lockfile failed with code ${result.code}`);
    }
  }

  if (process.platform === "win32") {
    await createWindowsShortcuts(toDir, "Planning v2");
  }

  process.stdout.write(
    `[planning:v2:desktop:install] verified version=${verified.manifest.version} gitSha=${verified.manifest.gitSha} files=${verified.checksum.fileCount}\n`,
  );
  process.stdout.write(`[planning:v2:desktop:install] installed=${toDir}\n`);
  process.stdout.write(`[planning:v2:desktop:install] run=${process.platform === "win32" ? "run.cmd" : "./run.sh"}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:desktop:install] failed\n${message}\n`);
  process.exit(1);
});
