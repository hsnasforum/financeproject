#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isCommandNotFound, pnpmCommandCandidates, pnpmSpawnOptions } from "./pnpm_runner.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const cwd = process.cwd();

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    out[key] = rest.length > 0 ? rest.join("=") : "true";
  }
  return out;
}

function writeExitFile(exitFile, payload) {
  fs.writeFileSync(exitFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function runWorker(args) {
  const logFile = String(args["log-file"] ?? "").trim();
  const exitFile = String(args["exit-file"] ?? "").trim();
  if (!logFile || !exitFile) {
    throw new Error("--worker requires --log-file and --exit-file");
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.mkdirSync(path.dirname(exitFile), { recursive: true });
  const logFd = fs.openSync(logFile, "a");
  const startedAt = new Date().toISOString();
  fs.writeSync(logFd, `[build:detached] worker start ${startedAt} cwd=${cwd}\n`);

  const candidates = pnpmCommandCandidates();

  const runBuild = (candidateIndex = 0) => {
    const candidate = candidates[candidateIndex];
    let fallbackStarted = false;
    const child = spawn(candidate.command, [...candidate.args, "build"], pnpmSpawnOptions(candidate, {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
      stdio: ["ignore", logFd, logFd],
    }));

    child.on("error", (error) => {
      if (isCommandNotFound(error) && candidateIndex + 1 < candidates.length) {
        fallbackStarted = true;
        fs.writeSync(logFd, `[build:detached] worker fallback from ${candidate.command} to ${candidates[candidateIndex + 1].command}\n`);
        runBuild(candidateIndex + 1);
        return;
      }

      const finishedAt = new Date().toISOString();
      fs.writeSync(logFd, `[build:detached] worker error ${finishedAt} ${error.message}\n`);
      writeExitFile(exitFile, {
        ok: false,
        code: 1,
        signal: null,
        pid: child.pid ?? null,
        startedAt,
        finishedAt,
        logFile,
        error: error.message,
      });
      fs.closeSync(logFd);
      process.exit(1);
    });

    child.on("exit", (code, signal) => {
      if (fallbackStarted) return;
      const finishedAt = new Date().toISOString();
      const normalizedCode = typeof code === "number" ? code : 1;
      fs.writeSync(
        logFd,
        `[build:detached] worker exit ${finishedAt} code=${normalizedCode} signal=${signal ?? "null"}\n`,
      );
      writeExitFile(exitFile, {
        ok: normalizedCode === 0,
        code: normalizedCode,
        signal: signal ?? null,
        pid: child.pid ?? null,
        startedAt,
        finishedAt,
        logFile,
      });
      fs.closeSync(logFd);
      process.exit(0);
    });
  };

  runBuild();
}

function startDetachedBuild(args) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseDir = path.resolve(String(args["base-dir"] ?? process.env.FINANCE_BUILD_DETACHED_DIR ?? os.tmpdir()));
  const logFile = path.resolve(String(args["log-file"] ?? path.join(baseDir, `finance-build-detached-${stamp}.log`)));
  const exitFile = path.resolve(
    String(args["exit-file"] ?? path.join(baseDir, `finance-build-detached-${stamp}.exit.json`)),
  );

  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.mkdirSync(path.dirname(exitFile), { recursive: true });

  const child = spawn(
    process.execPath,
    [scriptPath, "--worker", `--log-file=${logFile}`, `--exit-file=${exitFile}`],
    {
      cwd,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: "ignore",
    },
  );
  child.unref();

  console.log(`[build:detached] started pid=${child.pid ?? "unknown"}`);
  console.log(`[build:detached] log=${logFile}`);
  console.log(`[build:detached] exit=${exitFile}`);
  console.log("[build:detached] next: inspect the exit json or tail the log.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.worker).toLowerCase() === "true") {
    await runWorker(args);
    return;
  }
  startDetachedBuild(args);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build:detached] FAIL ${message}`);
  process.exit(1);
});
