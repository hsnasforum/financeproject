#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createIsolatedPlanningV2E2EOptions,
  createPlanningDesktopE2EEnvironment,
} from "./planning_v2_e2e_isolation.mjs";
import { preparePlanningSmokeDatabase } from "./planning_smoke_database.mjs";
import { sanitizePlaywrightColorEnv } from "./runtime_color_env.mjs";

const commandCandidates = process.platform === "win32"
  ? [
      { command: "pnpm.cmd", args: [] },
      { command: "corepack.cmd", args: ["pnpm"] },
    ]
  : [
      { command: "pnpm", args: [] },
      { command: "corepack", args: ["pnpm"] },
    ];
let env = sanitizePlaywrightColorEnv({
  ...process.env,
  DEBUG: process.env.DEBUG || "pw:webserver",
});
const rawArgs = process.argv.slice(2);
const playwrightArgs = [];
const nextEnvPath = path.join(process.cwd(), "next-env.d.ts");

async function captureFile(filePath) {
  try {
    return {
      exists: true,
      content: await fs.readFile(filePath, "utf8"),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { exists: false, content: "" };
    }
    throw error;
  }
}

async function restoreFile(filePath, snapshot) {
  if (!snapshot.exists) {
    await fs.unlink(filePath).catch((error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
      throw error;
    });
    return;
  }

  const current = await fs.readFile(filePath, "utf8").catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  });
  if (current === snapshot.content) return;
  await fs.writeFile(filePath, snapshot.content);
}

function setRuntime(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return;
  if (normalized !== "development" && normalized !== "production") {
    console.error(`[playwright_with_webserver_debug] FAIL unsupported runtime: ${value}`);
    process.exit(1);
  }
  env.E2E_WEB_SERVER_MODE = normalized;
  if (normalized === "production") {
    env.PLANNING_E2E_DESKTOP_SESSION_TOKEN = String(
      env.PLANNING_E2E_DESKTOP_SESSION_TOKEN || randomBytes(32).toString("base64url"),
    );
    env.PLANNING_SINGLE_USER_MODE = "true";
    env.PLANNING_NAMESPACE_ENABLED = "false";
    env.PLANNING_TRUST_AUTH_HEADERS = "false";
    env.PLANNING_FORWARDED_HEADERS_TRUSTED = "false";
  }
}

function setPort(value) {
  const normalized = value.trim();
  if (!normalized) return;
  if (!/^\d+$/.test(normalized)) {
    console.error(`[playwright_with_webserver_debug] FAIL invalid port: ${value}`);
    process.exit(1);
  }
  env.PORT = normalized;
}

function portFromBaseUrl(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (url.port) return url.port;
    if (url.protocol === "http:") return "80";
    if (url.protocol === "https:") return "443";
  } catch {
    return undefined;
  }
  return undefined;
}

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--dev-hmr") {
    env.E2E_DISABLE_DEV_HMR = "0";
    continue;
  }
  if (arg === "--debug-pages") {
    env.PLANNING_DEBUG_ENABLED = "true";
    continue;
  }
  if (arg.startsWith("--runtime=")) {
    setRuntime(arg.slice("--runtime=".length));
    continue;
  }
  if (arg === "--runtime") {
    setRuntime(rawArgs[index + 1] ?? "");
    index += 1;
    continue;
  }
  if (arg.startsWith("--port=")) {
    setPort(arg.slice("--port=".length));
    continue;
  }
  if (arg === "--port") {
    setPort(rawArgs[index + 1] ?? "");
    index += 1;
    continue;
  }
  playwrightArgs.push(arg);
}

const args = ["exec", "playwright", ...playwrightArgs];
const nextEnvSnapshot = await captureFile(nextEnvPath);
const configuredBaseUrl = env.BASE_URL || env.E2E_BASE_URL || env.PLANNING_BASE_URL;
const isolated = await createIsolatedPlanningV2E2EOptions(env, {
  defaultPort: 3126,
  preferredPort: env.PORT || portFromBaseUrl(configuredBaseUrl),
  distDirPrefix: ".next-e2e",
  sandboxPrefix: "finance-full-e2e-",
  forceIsolatedPlanningData: true,
});
env = isolated.env;
if (env.E2E_WEB_SERVER_MODE === "production") {
  try {
    const smokeDatabase = await preparePlanningSmokeDatabase({
      appDir: process.cwd(),
      databasePath: path.join(path.dirname(isolated.planningDataDir), "database", "finance.db"),
    });
    env = createPlanningDesktopE2EEnvironment(env, {
      databaseUrl: smokeDatabase.databaseUrl,
      planningDataDir: isolated.planningDataDir,
      sessionToken: env.PLANNING_E2E_DESKTOP_SESSION_TOKEN,
    });
    env.DATABASE_URL = smokeDatabase.databaseUrl;
  } catch (error) {
    await isolated.cleanup();
    throw error;
  }
}
console.log(
  `[playwright_with_webserver_debug] isolated port=${isolated.port} distDir=${isolated.distDir} planningDataDir=${isolated.planningDataDir}`,
);

let finalized = false;

function runPlaywright(candidateIndex = 0) {
  const candidate = commandCandidates[candidateIndex];
  let startedFallback = false;
  const child = spawn(candidate.command, [...candidate.args, ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && error.code === "ENOENT"
      && candidateIndex + 1 < commandCandidates.length
    ) {
      startedFallback = true;
      runPlaywright(candidateIndex + 1);
      return;
    }

    void finalize(1, `[playwright_with_webserver_debug] FAIL ${error.message}`);
  });

  child.on("close", (code) => {
    if (startedFallback) return;
    void finalize(code ?? 1);
  });
}

async function finalize(code, message) {
  if (finalized) return;
  finalized = true;

  let cleanupFailed = false;
  try {
    await restoreFile(nextEnvPath, nextEnvSnapshot);
  } catch (error) {
    const restoreMessage = error instanceof Error ? error.message : String(error);
    console.error(`[playwright_with_webserver_debug] FAIL restore next-env.d.ts: ${restoreMessage}`);
    cleanupFailed = true;
  }

  try {
    await isolated.cleanup();
  } catch (error) {
    const cleanupMessage = error instanceof Error ? error.message : String(error);
    console.error(`[playwright_with_webserver_debug] FAIL cleanup: ${cleanupMessage}`);
    cleanupFailed = true;
  }

  if (message) {
    console.error(message);
  }
  process.exit(cleanupFailed ? 1 : code);
}

runPlaywright();
