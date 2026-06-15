#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { isCommandNotFound, pnpmCommandCandidates } from "./pnpm_runner.mjs";

const INSTALL_ARGS = ["exec", "playwright", "install", "--with-deps", "chromium"];
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_TIMEOUT_MS = 7 * 60 * 1000;
const DEFAULT_DELAY_MS = 10_000;
const KILL_GRACE_MS = 5_000;

export function parseBoundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parseInstallConfig(argv = [], env = process.env) {
  const config = {
    attempts: parseBoundedInteger(env.PLAYWRIGHT_INSTALL_ATTEMPTS, DEFAULT_ATTEMPTS, { min: 1, max: 5 }),
    timeoutMs: parseBoundedInteger(env.PLAYWRIGHT_INSTALL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, {
      min: 30_000,
      max: 30 * 60 * 1000,
    }),
    delayMs: parseBoundedInteger(env.PLAYWRIGHT_INSTALL_RETRY_DELAY_MS, DEFAULT_DELAY_MS, {
      min: 0,
      max: 5 * 60 * 1000,
    }),
  };

  for (const arg of argv) {
    if (arg.startsWith("--attempts=")) {
      config.attempts = parseBoundedInteger(arg.slice("--attempts=".length), config.attempts, { min: 1, max: 5 });
    } else if (arg.startsWith("--timeout-ms=")) {
      config.timeoutMs = parseBoundedInteger(arg.slice("--timeout-ms=".length), config.timeoutMs, {
        min: 30_000,
        max: 30 * 60 * 1000,
      });
    } else if (arg.startsWith("--delay-ms=")) {
      config.delayMs = parseBoundedInteger(arg.slice("--delay-ms=".length), config.delayMs, {
        min: 0,
        max: 5 * 60 * 1000,
      });
    }
  }

  return config;
}

function terminateChild(child) {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // The process may already have exited.
    }
  }
}

function forceKillChild(child) {
  if (!child.pid) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process may already have exited.
    }
  }
}

function runCandidateWithTimeout(candidate, args, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;

    const child = spawn(candidate.command, [...candidate.args, ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
      env: process.env,
      cwd: process.cwd(),
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`[playwright:install] attempt timed out after ${timeoutMs}ms; terminating installer`);
      terminateChild(child);
    }, timeoutMs);

    const killTimeout = setTimeout(() => {
      if (!settled && timedOut) forceKillChild(child);
    }, timeoutMs + KILL_GRACE_MS);

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimeout);
      resolve(payload);
    };

    child.on("error", (error) =>
      finish({ code: 1, signal: null, timedOut, error, command: candidate.command, args: [...candidate.args, ...args] }),
    );
    child.on("close", (code, signal) =>
      finish({
        code: typeof code === "number" ? code : timedOut ? 124 : 1,
        signal: signal ?? null,
        timedOut,
        command: candidate.command,
        args: [...candidate.args, ...args],
      }),
    );
  });
}

async function runPnpmInstallOnce(timeoutMs) {
  const candidates = pnpmCommandCandidates();
  let lastResult = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const result = await runCandidateWithTimeout(candidates[index], INSTALL_ARGS, timeoutMs);
    lastResult = result;
    if (isCommandNotFound(result.error) && index + 1 < candidates.length) continue;
    return result;
  }

  return lastResult ?? { code: 1, signal: null, timedOut: false };
}

export async function installChromiumWithRetry(config) {
  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    console.log(
      `[playwright:install] installing chromium attempt=${attempt}/${config.attempts} timeoutMs=${config.timeoutMs}`,
    );
    const result = await runPnpmInstallOnce(config.timeoutMs);
    if (result.code === 0) return 0;

    const signalSuffix = result.signal ? ` signal=${result.signal}` : "";
    const timeoutSuffix = result.timedOut ? " timedOut=true" : "";
    console.error(`[playwright:install] attempt=${attempt} failed code=${result.code}${signalSuffix}${timeoutSuffix}`);

    if (attempt < config.attempts && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  return 1;
}

async function main() {
  const config = parseInstallConfig(process.argv.slice(2));
  const code = await installChromiumWithRetry(config);
  process.exit(code);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
