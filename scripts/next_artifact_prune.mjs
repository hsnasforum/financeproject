#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_TRANSIENT_NEXT_DIR_PATTERN = /^\.next-(?:e2e|host)(?:-.+)?$/;
const ROOT_ISOLATED_BUILD_DIR_PATTERN = /^\.next-build(?:-.+)?$/;
const ROOT_ISOLATED_BUILD_TSCONFIG_PATTERN = /^\.next-build(?:-.+)?-tsconfig\.json$/;
const STANDALONE_SHADOW_NEXT_DIR_PATTERN = /^\.next-.+/;
const ISOLATED_BUILD_INFO_FILENAME = ".next-build-info.json";

function parsePsRows() {
  try {
    const result = spawnSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return [];

    return String(result.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(.*)$/);
        if (!match) return null;
        return {
          pid: Number.parseInt(match[1], 10),
          command: match[2] ?? "",
        };
      })
      .filter((entry) => entry && Number.isFinite(entry.pid) && entry.command);
  } catch {
    return [];
  }
}

function resolveProcessCwd(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return "";
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return "";
  }
}

function isWithinProject(projectRoot, processCwd, command) {
  const normalizedRoot = path.resolve(projectRoot);
  if (processCwd) {
    const relative = path.relative(normalizedRoot, processCwd);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return true;
    }
  }

  return typeof command === "string" && command.includes(normalizedRoot);
}

function classifyRuntimeProcess(command) {
  if (command.includes("next_dev_safe.mjs") || command.includes("next/dist/bin/next dev")) return "dev";
  if (command.includes("next_build_safe.mjs") || command.includes("next/dist/bin/next build")) return "build";
  if (command.includes("next_prod_safe.mjs") || command.includes("next/dist/bin/next start")) return "prod";
  if (command.includes("playwright_with_webserver_debug.mjs") || command.includes("playwright test")) return "playwright";
  return "";
}

function listDirectories(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return [];

  try {
    return fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function listEntries(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return [];

  try {
    return fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function removeDirectory(absolutePath) {
  fs.rmSync(absolutePath, {
    recursive: true,
    force: true,
    maxRetries: 6,
    retryDelay: 250,
  });
}

function removeEntry(absolutePath) {
  fs.rmSync(absolutePath, {
    recursive: true,
    force: true,
    maxRetries: 6,
    retryDelay: 250,
  });
}

function readTrackedIsolatedBuildDist(baseDir) {
  const infoPath = path.join(baseDir, ISOLATED_BUILD_INFO_FILENAME);
  if (!fs.existsSync(infoPath)) return "";

  try {
    const raw = fs.readFileSync(infoPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.distDir === "string" ? parsed.distDir.trim() : "";
  } catch {
    return "";
  }
}

function expandIsolatedBuildPreserveNames(preserveNames = []) {
  const preserve = new Set();

  for (const value of preserveNames) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (!name) continue;
    preserve.add(name);
    if (ROOT_ISOLATED_BUILD_DIR_PATTERN.test(name)) {
      preserve.add(`${name}-tsconfig.json`);
    }
  }

  return preserve;
}

function pruneDirectories(baseDir, matcher, preserveNames = []) {
  const removed = [];
  const skipped = [];
  const preserve = new Set(
    preserveNames
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  for (const name of listDirectories(baseDir)) {
    if (!matcher.test(name)) continue;
    if (preserve.has(name)) {
      skipped.push(name);
      continue;
    }

    removeDirectory(path.join(baseDir, name));
    removed.push(name);
  }

  return {
    baseDir,
    removed,
    skipped,
    skippedDueToActiveRuntime: false,
    activeRuntimeProcesses: [],
  };
}

export function pruneRootIsolatedBuildArtifacts(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  return withRuntimeGuard(cwd, options, () => {
    const trackedDistDir = readTrackedIsolatedBuildDist(cwd);
    const preserve = expandIsolatedBuildPreserveNames([
      ...(options.preserveNames ?? []),
      ...(trackedDistDir ? [trackedDistDir] : []),
    ]);
    const removed = [];
    const skipped = [];

    for (const entry of listEntries(cwd)) {
      const name = entry.name;
      const isBuildDir = entry.isDirectory() && ROOT_ISOLATED_BUILD_DIR_PATTERN.test(name);
      const isBuildTsconfig = entry.isFile() && ROOT_ISOLATED_BUILD_TSCONFIG_PATTERN.test(name);
      if (!isBuildDir && !isBuildTsconfig) continue;

      if (preserve.has(name)) {
        skipped.push(name);
        continue;
      }

      removeEntry(path.join(cwd, name));
      removed.push(name);
    }

    const infoPath = path.join(cwd, ISOLATED_BUILD_INFO_FILENAME);
    if (fs.existsSync(infoPath)) {
      const keepTrackedInfo = trackedDistDir && fs.existsSync(path.join(cwd, trackedDistDir));
      if (keepTrackedInfo) {
        skipped.push(ISOLATED_BUILD_INFO_FILENAME);
      } else {
        removeEntry(infoPath);
        removed.push(ISOLATED_BUILD_INFO_FILENAME);
      }
    }

    return {
      baseDir: cwd,
      removed,
      skipped,
      skippedDueToActiveRuntime: false,
      activeRuntimeProcesses: [],
    };
  });
}

export function listRepoManagedRuntimeProcesses(projectRoot, options = {}) {
  const cwd = path.resolve(projectRoot);
  const ignorePids = new Set(
    [process.pid, ...(options.ignorePids ?? [])]
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  return parsePsRows()
    .filter((entry) => !ignorePids.has(entry.pid))
    .map((entry) => {
      const kind = classifyRuntimeProcess(entry.command);
      if (!kind) return null;
      const processCwd = resolveProcessCwd(entry.pid);
      if (!isWithinProject(cwd, processCwd, entry.command)) return null;
      return {
        pid: entry.pid,
        kind,
        command: entry.command,
        cwd: processCwd,
      };
    })
    .filter((entry) => entry !== null);
}

export function hasRepoManagedRuntimeProcess(projectRoot, options = {}) {
  return listRepoManagedRuntimeProcesses(projectRoot, options).length > 0;
}

export function hasRepoNextDevProcess(projectRoot, options = {}) {
  return listRepoManagedRuntimeProcesses(projectRoot, options).some((entry) => entry.kind === "dev");
}

function withRuntimeGuard(cwd, options, run) {
  if (options.allowRunning) {
    return run();
  }

  const activeRuntimeProcesses = listRepoManagedRuntimeProcesses(cwd, options);
  if (activeRuntimeProcesses.length > 0) {
    return {
      baseDir: "",
      removed: [],
      skipped: [],
      skippedDueToActiveRuntime: true,
      activeRuntimeProcesses,
    };
  }

  return run();
}

export function pruneRootTransientNextArtifacts(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  return withRuntimeGuard(cwd, options, () => pruneDirectories(
    cwd,
    ROOT_TRANSIENT_NEXT_DIR_PATTERN,
    options.preserveNames ?? [],
  ));
}

export function pruneStandaloneShadowNextArtifacts(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const distDir = (options.distDir ?? ".next").trim() || ".next";
  const standaloneDir = path.join(cwd, distDir, "standalone");

  return withRuntimeGuard(cwd, options, () => pruneDirectories(
    standaloneDir,
    STANDALONE_SHADOW_NEXT_DIR_PATTERN,
    options.preserveNames ?? [],
  ));
}

export function logPruneSummary(prefix, result) {
  if (!result) return;

  if (result.skippedDueToActiveRuntime) {
    const active = (result.activeRuntimeProcesses ?? [])
      .map((entry) => `${entry.kind}:${entry.pid}`)
      .join(", ");
    console.log(`${prefix} skipped active-runtime ${active || "unknown"}`);
    return;
  }
  if (result.removed.length > 0) {
    console.log(`${prefix} removed ${result.removed.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`${prefix} skipped ${result.skipped.join(", ")}`);
  }
}

function parseCliArgs(argv) {
  const options = {
    cwd: process.cwd(),
    distDir: ".next",
    allowRunning: false,
    rootOnly: false,
    standaloneOnly: false,
    preserveNames: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--cwd" && argv[index + 1]) {
      options.cwd = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--dist-dir" && argv[index + 1]) {
      options.distDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--preserve=")) {
      options.preserveNames.push(token.slice("--preserve=".length));
      continue;
    }
    if (token === "--preserve" && argv[index + 1]) {
      options.preserveNames.push(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--allow-running") {
      options.allowRunning = true;
      continue;
    }
    if (token === "--root-only") {
      options.rootOnly = true;
      continue;
    }
    if (token === "--standalone-only") {
      options.standaloneOnly = true;
    }
  }

  return options;
}

function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  const ignorePids = [process.pid];

  if (!options.standaloneOnly) {
    logPruneSummary(
      "[next_artifact_prune] root",
      pruneRootTransientNextArtifacts({
        cwd: options.cwd,
        preserveNames: options.preserveNames,
        allowRunning: options.allowRunning,
        ignorePids,
      }),
    );
    logPruneSummary(
      "[next_artifact_prune] root build",
      pruneRootIsolatedBuildArtifacts({
        cwd: options.cwd,
        preserveNames: options.preserveNames,
        allowRunning: options.allowRunning,
        ignorePids,
      }),
    );
  }

  if (!options.rootOnly) {
    logPruneSummary(
      "[next_artifact_prune] standalone",
      pruneStandaloneShadowNextArtifacts({
        cwd: options.cwd,
        distDir: options.distDir,
        preserveNames: options.preserveNames,
        allowRunning: options.allowRunning,
        ignorePids,
      }),
    );
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runCli();
}
