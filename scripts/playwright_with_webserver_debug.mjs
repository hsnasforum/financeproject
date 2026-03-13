#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { sanitizePlaywrightColorEnv } from "./runtime_color_env.mjs";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = sanitizePlaywrightColorEnv({
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

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === "--dev-hmr") {
    env.E2E_DISABLE_DEV_HMR = "0";
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

const child = spawn(command, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

let finalized = false;

async function finalize(code, message) {
  if (finalized) return;
  finalized = true;

  try {
    await restoreFile(nextEnvPath, nextEnvSnapshot);
  } catch (error) {
    const restoreMessage = error instanceof Error ? error.message : String(error);
    console.error(`[playwright_with_webserver_debug] FAIL restore next-env.d.ts: ${restoreMessage}`);
    process.exit(1);
    return;
  }

  if (message) {
    console.error(message);
  }
  process.exit(code);
}

child.on("error", (error) => {
  void finalize(1, `[playwright_with_webserver_debug] FAIL ${error.message}`);
});

child.on("close", (code) => {
  void finalize(code ?? 1);
});
