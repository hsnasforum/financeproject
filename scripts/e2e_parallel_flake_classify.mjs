#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";

const DEFAULT_RUNS = 2;
const DEFAULT_DEV_PORT_BASE = 3126;
const DEFAULT_PROD_PORT_BASE = 3210;
const MODE_VALUES = new Set(["both", "development", "production", "dev", "prod"]);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const flakePlaywrightArgs = [
  "test",
  "tests/e2e/flow-planner-to-history.spec.ts",
  "tests/e2e/flow-history-to-report.spec.ts",
  "tests/e2e/dart-flow.spec.ts",
  "--workers=2",
  "--reporter=line",
];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseRuns(value, fallback = DEFAULT_RUNS) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) return fallback;
  return parsed;
}

function parsePort(value, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function normalizeMode(value) {
  const normalized = asString(value).toLowerCase();
  if (!MODE_VALUES.has(normalized)) return "";
  if (normalized === "dev") return "development";
  if (normalized === "prod") return "production";
  return normalized;
}

function parseArgs(argv) {
  const out = {
    runs: DEFAULT_RUNS,
    mode: "both",
    stopOnFail: false,
    devPortBase: DEFAULT_DEV_PORT_BASE,
    prodPortBase: DEFAULT_PROD_PORT_BASE,
    skipBuild: false,
    devHmr: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    if (token === "--stop-on-fail") {
      out.stopOnFail = true;
      continue;
    }
    if (token === "--skip-build") {
      out.skipBuild = true;
      continue;
    }
    if (token === "--dev-hmr") {
      out.devHmr = true;
      continue;
    }

    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const inlineValue = rest.join("=");
    const value = inlineValue || asString(argv[index + 1]);

    if ((key === "runs" || key === "count") && value) {
      out.runs = parseRuns(value, out.runs);
      if (!inlineValue) index += 1;
      continue;
    }

    if (key === "mode" && value) {
      out.mode = normalizeMode(value) || out.mode;
      if (!inlineValue) index += 1;
      continue;
    }

    if (key === "dev-port-base" && value) {
      out.devPortBase = parsePort(value, out.devPortBase);
      if (!inlineValue) index += 1;
      continue;
    }

    if (key === "prod-port-base" && value) {
      out.prodPortBase = parsePort(value, out.prodPortBase);
      if (!inlineValue) index += 1;
      continue;
    }
  }

  return out;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 1) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function canBindPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      resolve({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    server.once("listening", () => {
      server.close(() => {
        resolve({ ok: true, message: "" });
      });
    });
    server.listen(port, host);
  });
}

function runCommand({ command, args, env, label }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`[e2e:parallel:classify] START ${label}`);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      const durationMs = Date.now() - startedAt;
      const exitCode = typeof code === "number" ? code : 1;
      const ok = exitCode === 0;
      const signalSuffix = signal ? ` signal=${signal}` : "";
      console.log(
        `[e2e:parallel:classify] ${ok ? "PASS" : "FAIL"} ${label} duration=${formatDuration(durationMs)} exit=${exitCode}${signalSuffix}`,
      );
      resolve({ ok, exitCode, signal: signal ?? null, durationMs });
    });
  });
}

async function runBuildOnce() {
  return runCommand({
    label: "production build",
    command: pnpmCommand,
    args: ["build"],
  });
}

async function runDevelopmentAttempt(attempt, runs, port, devHmr) {
  return runCommand({
    label: `development attempt=${attempt}/${runs} port=${port}${devHmr ? " devHmr=Y" : ""}`,
    command: process.execPath,
    args: [
      "scripts/playwright_with_webserver_debug.mjs",
      ...(devHmr ? ["--dev-hmr"] : []),
      "--port",
      String(port),
      ...flakePlaywrightArgs,
    ],
  });
}

async function runProductionAttempt(attempt, runs, port) {
  return runCommand({
    label: `production attempt=${attempt}/${runs} port=${port}`,
    command: process.execPath,
    args: [
      "scripts/playwright_with_webserver_debug.mjs",
      "--runtime=production",
      "--port",
      String(port),
      ...flakePlaywrightArgs,
    ],
  });
}

function printSummary(mode, entries) {
  const passed = entries.filter((entry) => entry.ok).length;
  const failed = entries.filter((entry) => !entry.ok);
  const totalDurationMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);

  console.log(
    `[e2e:parallel:classify] summary mode=${mode} pass=${passed}/${entries.length} totalDuration=${formatDuration(totalDurationMs)}`,
  );
  for (const entry of failed) {
    const signalSuffix = entry.signal ? ` signal=${entry.signal}` : "";
    console.log(
      `[e2e:parallel:classify] summary mode=${mode} failedAttempt=${entry.attempt} port=${entry.port} exit=${entry.exitCode}${signalSuffix}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const developmentEntries = [];
  const productionEntries = [];

  console.log(
    `[e2e:parallel:classify] start runs=${args.runs} mode=${args.mode} devPortBase=${args.devPortBase} prodPortBase=${args.prodPortBase} stopOnFail=${args.stopOnFail ? "Y" : "N"} skipBuild=${args.skipBuild ? "Y" : "N"} devHmr=${args.devHmr ? "Y" : "N"}`,
  );

  if (!args.skipBuild && (args.mode === "production" || args.mode === "both")) {
    const build = await runBuildOnce();
    if (!build.ok) {
      process.exit(build.exitCode);
      return;
    }
  }

  let shouldStop = false;
  for (let runIndex = 0; runIndex < args.runs && !shouldStop; runIndex += 1) {
    const attempt = runIndex + 1;

    if (args.mode === "development" || args.mode === "both") {
      const port = args.devPortBase + runIndex;
      const devBind = await canBindPort(port);
      if (!devBind.ok) {
        console.error(
          `[e2e:parallel:classify] BLOCKED development attempt=${attempt}/${args.runs} port=${port} reason=${devBind.message}`,
        );
        process.exit(2);
        return;
      }
      const result = await runDevelopmentAttempt(attempt, args.runs, port, args.devHmr);
      developmentEntries.push({ attempt, port, ...result });
      if (!result.ok && args.stopOnFail) {
        shouldStop = true;
      }
    }

    if (!shouldStop && (args.mode === "production" || args.mode === "both")) {
      const port = args.prodPortBase + runIndex;
      const prodBind = await canBindPort(port);
      if (!prodBind.ok) {
        console.error(
          `[e2e:parallel:classify] BLOCKED production attempt=${attempt}/${args.runs} port=${port} reason=${prodBind.message}`,
        );
        process.exit(2);
        return;
      }
      const result = await runProductionAttempt(attempt, args.runs, port);
      productionEntries.push({ attempt, port, ...result });
      if (!result.ok && args.stopOnFail) {
        shouldStop = true;
      }
    }
  }

  if (developmentEntries.length > 0) printSummary("development", developmentEntries);
  if (productionEntries.length > 0) printSummary("production", productionEntries);

  const failed = [...developmentEntries, ...productionEntries].some((entry) => !entry.ok);
  if (failed) {
    process.exit(1);
    return;
  }

  console.log("[e2e:parallel:classify] PASS");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[e2e:parallel:classify] FAIL\n${message}`);
  process.exit(1);
});
