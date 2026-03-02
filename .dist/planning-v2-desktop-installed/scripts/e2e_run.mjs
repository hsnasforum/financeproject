#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const HOST = "127.0.0.1";
const START_PORT = 3100;
const MAX_SCAN = 50;
const READY_TIMEOUT_MS = 60_000;
const READY_INTERVAL_MS = 500;

function commandFor(bin) {
  return process.platform === "win32" ? `${bin}.cmd` : bin;
}

function loadLocalEnv() {
  const root = process.cwd();
  const candidates = [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    dotenv.config({ path: file, override: false });
  }
}

function isPortFree(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ host, port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(host, startPort, maxScan) {
  for (let offset = 0; offset <= maxScan; offset += 1) {
    const port = startPort + offset;
    const free = await isPortFree(host, port);
    if (free) return port;
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + maxScan}`);
}

function resolveNextDevFlags() {
  const help = spawnSync(commandFor("pnpm"), ["exec", "next", "dev", "--help"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const text = `${help.stdout ?? ""}\n${help.stderr ?? ""}`;
  const hostFlag = text.includes("--hostname") ? "--hostname" : "-H";
  const portFlag = text.includes("--port") ? "--port" : "-p";
  return { hostFlag, portFlag };
}

async function waitForReady(baseUrl, timeoutMs, intervalMs) {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for dev server: ${baseUrl}`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return;
    } catch {
      // keep polling
    }
    await delay(intervalMs);
  }
}

function killProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

function runPlaywright(env) {
  return new Promise((resolve) => {
    let combinedOutput = "";
    const child = spawn(commandFor("pnpm"), ["exec", "playwright", "test"], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      combinedOutput += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      combinedOutput += text;
      process.stderr.write(text);
    });
    child.on("close", (code, signal) => {
      if (signal) {
        resolve({ code: 1, output: combinedOutput });
        return;
      }
      resolve({ code: code ?? 1, output: combinedOutput });
    });
  });
}

function hasMissingBrowserDeps(output) {
  return /libnspr4\.so|Failed to launch browser|Missing dependencies|error while loading shared libraries/i.test(output);
}

function printMissingDepsHint() {
  console.error("[e2e] 시스템 라이브러리 누락으로 브라우저 실행에 실패했습니다.");
  console.error("[e2e] 해결책 1: pnpm e2e:docker");
  console.error("[e2e] 해결책 2 (리눅스): sudo pnpm exec playwright install-deps");
  console.error("[e2e] 또는: sudo apt-get update && sudo apt-get install -y libnspr4 libnss3");
  console.error("[e2e] sudo 권한이 없으면 docker 경로를 사용하세요.");
}

async function main() {
  loadLocalEnv();
  const port = await findFreePort(HOST, START_PORT, MAX_SCAN);
  const baseUrl = `http://${HOST}:${port}`;
  const { hostFlag, portFlag } = resolveNextDevFlags();

  console.log(`[e2e] baseURL=${baseUrl}`);

  const devServer = spawn(
    commandFor("pnpm"),
    ["exec", "next", "dev", hostFlag, HOST, portFlag, String(port)],
    {
      stdio: "inherit",
      env: { ...process.env },
      detached: process.platform !== "win32",
    },
  );

  const cleanup = () => killProcessTree(devServer);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForReady(`${baseUrl}/`, READY_TIMEOUT_MS, READY_INTERVAL_MS);
    const result = await runPlaywright({ ...process.env, E2E_BASE_URL: baseUrl });
    if (result.code !== 0 && hasMissingBrowserDeps(result.output)) {
      printMissingDepsHint();
    }
    cleanup();
    process.exit(result.code);
  } catch (error) {
    cleanup();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[e2e] failed: ${message}`);
    process.exit(1);
  }
}

void main();
