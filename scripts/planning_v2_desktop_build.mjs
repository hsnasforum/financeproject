import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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

async function ensureFileExists(target) {
  try {
    await fs.access(target);
  } catch {
    throw new Error(`required file not found: ${target}`);
  }
}

async function copyIfExists(source, destination) {
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  await fs.cp(source, destination, { recursive: true, force: true });
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

  if (args.withNextBuild) {
    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await runCommand(pnpmCmd, ["build"], cwd);
  }

  await ensureFileExists(path.join(cwd, "src"));
  await ensureFileExists(path.join(cwd, "scripts"));
  await ensureFileExists(path.join(cwd, "package.json"));
  await ensureFileExists(path.join(cwd, "pnpm-lock.yaml"));

  await fs.rm(artifactDir, { recursive: true, force: true });
  await fs.mkdir(artifactDir, { recursive: true });

  await copyIfExists(path.join(cwd, "src"), path.join(artifactDir, "src"));
  await copyIfExists(path.join(cwd, "public"), path.join(artifactDir, "public"));
  await copyIfExists(path.join(cwd, "scripts"), path.join(artifactDir, "scripts"));
  await copyPrismaAssets(cwd, artifactDir);
  await copyIfExists(path.join(cwd, "next.config.ts"), path.join(artifactDir, "next.config.ts"));
  await copyIfExists(path.join(cwd, "tsconfig.json"), path.join(artifactDir, "tsconfig.json"));
  await copyIfExists(path.join(cwd, "middleware.ts"), path.join(artifactDir, "middleware.ts"));
  await copyIfExists(path.join(cwd, ".env.local.example"), path.join(artifactDir, ".env.local.example"));
  await copyIfExists(path.join(cwd, ".next", "standalone"), path.join(artifactDir, ".next", "standalone"));
  await copyIfExists(path.join(cwd, ".next", "static"), path.join(artifactDir, ".next", "static"));
  await copyIfExists(
    path.join(cwd, ".next", "static"),
    path.join(artifactDir, ".next", "standalone", ".next", "static"),
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

  const packageJson = JSON.parse(await fs.readFile(path.join(cwd, "package.json"), "utf-8"));
  const manifest = {
    kind: "planning-v2-desktop",
    version: asString(packageJson.version) || "unknown",
    builtAt: new Date().toISOString(),
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
