import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const MAX_TAIL_LENGTH = 2_000;

function parseArgs(argv) {
  const options = {
    strict: false,
    skipDoctor: false,
  };

  for (const arg of argv) {
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--skip-doctor") {
      options.skipDoctor = true;
      continue;
    }
  }
  return options;
}

function readPackageScripts(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    if (!parsed.scripts || typeof parsed.scripts !== "object" || Array.isArray(parsed.scripts)) return {};
    return parsed.scripts;
  } catch {
    return {};
  }
}

function loadEnvFiles(cwd = process.cwd()) {
  for (const name of [".env.local", "env.local", ".env"]) {
    const filePath = path.join(cwd, name);
    if (!fs.existsSync(filePath)) continue;
    dotenv.config({ path: filePath, override: false, quiet: true });
  }
}

function appendTail(current, chunk, maxLength = MAX_TAIL_LENGTH) {
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(-maxLength);
}

function sanitizeTail(text) {
  const normalized = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (normalized.length <= MAX_TAIL_LENGTH) return normalized;
  return normalized.slice(-MAX_TAIL_LENGTH);
}

function runPnpmScript(scriptName, cwd) {
  return new Promise((resolve) => {
    const child = spawn(PNPM_BIN, [scriptName], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdoutTail = "";
    let stderrTail = "";

    child.stdout?.on("data", (chunk) => {
      const text = chunk instanceof Buffer ? chunk.toString("utf-8") : String(chunk);
      process.stdout.write(text);
      stdoutTail = appendTail(stdoutTail, text);
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk instanceof Buffer ? chunk.toString("utf-8") : String(chunk);
      process.stderr.write(text);
      stderrTail = appendTail(stderrTail, text);
    });

    child.on("error", (error) => {
      console.error(`[daily:refresh] failed to start "${scriptName}": ${String(error)}`);
      resolve({
        code: 1,
        stdoutTail: sanitizeTail(stdoutTail),
        stderrTail: sanitizeTail(`${stderrTail}\n${String(error)}`),
      });
    });
    child.on("close", (code) => {
      resolve({
        code: typeof code === "number" ? code : 1,
        stdoutTail: sanitizeTail(stdoutTail),
        stderrTail: sanitizeTail(stderrTail),
      });
    });
  });
}

function shouldMarkDartWatchSkipped(stepName, result, hasOpenDartKey) {
  if (stepName !== "dart:watch") return false;
  if (hasOpenDartKey) return false;
  return result.code === 0;
}

function formatLogLine(message) {
  return `[daily:refresh] ${message}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  loadEnvFiles(cwd);
  const scripts = readPackageScripts(cwd);
  const hasOpenDartKey = Boolean((process.env.OPENDART_API_KEY ?? "").trim());
  const generatedAt = new Date().toISOString();
  const logLines = [];
  const records = [];
  const plan = [];

  const addLog = (message) => {
    const line = formatLogLine(message);
    logLines.push(line);
    console.log(line);
  };

  if (typeof scripts["warm:if-stale"] === "string" && scripts["warm:if-stale"].trim()) {
    plan.push({ name: "warm:if-stale", required: false, runnable: true });
  } else {
    plan.push({ name: "warm:if-stale", required: false, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["dart:watch"] === "string" && scripts["dart:watch"].trim()) {
    plan.push({ name: "dart:watch", required: true, runnable: true });
  } else {
    plan.push({ name: "dart:watch", required: true, runnable: false, reason: "script_not_found" });
  }

  if (options.skipDoctor) {
    plan.push({ name: "data:doctor", required: false, runnable: false, reason: "cli_skip_doctor" });
  } else if (typeof scripts["data:doctor"] === "string" && scripts["data:doctor"].trim()) {
    plan.push({ name: "data:doctor", required: false, runnable: true });
  } else {
    plan.push({ name: "data:doctor", required: false, runnable: false, reason: "script_not_found" });
  }

  if (!hasOpenDartKey) {
    addLog("OPENDART_API_KEY is missing; dart:watch may skip network call (expected).");
  }

  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    const stepPrefix = `[${index + 1}/${plan.length}] ${step.name}`;

    if (!step.runnable) {
      const status = step.required ? "failed" : "skipped";
      addLog(`${stepPrefix} ${status} (${step.reason})`);
      records.push({
        name: step.name,
        status,
        tookMs: 0,
        stdoutTail: "",
        stderrTail: step.required ? step.reason : "",
      });
      continue;
    }

    addLog(`${stepPrefix} start`);
    const startedAt = Date.now();
    const result = await runPnpmScript(step.name, cwd);
    const tookMs = Date.now() - startedAt;

    let status = result.code === 0 ? "ok" : "failed";
    if (shouldMarkDartWatchSkipped(step.name, result, hasOpenDartKey)) {
      status = "skipped";
    }

    if (status === "failed") {
      addLog(`${stepPrefix} failed (exit ${result.code})`);
    } else if (status === "skipped") {
      addLog(`${stepPrefix} skipped`);
    } else {
      addLog(`${stepPrefix} done`);
    }

    records.push({
      name: step.name,
      status,
      tookMs,
      stdoutTail: result.stdoutTail,
      stderrTail: result.stderrTail,
    });
  }

  const failedCount = records.filter((step) => step.status === "failed").length;
  const summary = {
    generatedAt,
    steps: records,
    ok: failedCount === 0,
  };

  const tmpDir = path.join(cwd, "tmp");
  const resultPath = path.join(tmpDir, "daily_refresh_result.json");
  const logPath = path.join(tmpDir, "daily_refresh.log");
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");

  const logBody = [
    ...logLines,
    formatLogLine(`summary: steps=${records.length}, failed=${failedCount}, strict=${options.strict ? "Y" : "N"}, ok=${summary.ok ? "Y" : "N"}`),
    ...records.map((step) => formatLogLine(`- ${step.name}: ${step.status} (${step.tookMs}ms)`)),
  ].join("\n");
  fs.writeFileSync(logPath, `${logBody}\n`, "utf-8");

  addLog(`summary: steps=${records.length}, failed=${failedCount}, strict=${options.strict ? "Y" : "N"}, ok=${summary.ok ? "Y" : "N"}`);
  addLog(`result json: ${path.relative(cwd, resultPath)}`);
  addLog(`log file: ${path.relative(cwd, logPath)}`);

  if (options.strict && failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(`[daily:refresh] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
