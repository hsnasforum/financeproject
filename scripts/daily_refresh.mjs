import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { resolveDailyRefreshOutcome } from "./daily_refresh_contract.mjs";
import { runPnpmBuffered } from "./pnpm_runner.mjs";

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

function runPnpmScript(scriptName, cwd, args = []) {
  let stdoutTail = "";
  let stderrTail = "";
  return runPnpmBuffered([scriptName, ...args], {
    cwd,
    env: process.env,
    onStdout: (text) => {
      process.stdout.write(text);
      stdoutTail = appendTail(stdoutTail, text);
    },
    onStderr: (text) => {
      process.stderr.write(text);
      stderrTail = appendTail(stderrTail, text);
    },
  }).then((result) => ({
    code: result.code,
    stdoutTail: sanitizeTail(stdoutTail),
    stderrTail: sanitizeTail(result.error ? `${stderrTail}\n${String(result.error)}` : stderrTail),
  }));
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
    plan.push({
      name: "warm:if-stale",
      required: false,
      runnable: true,
      args: ["--", "--exchange-only"],
    });
  } else {
    plan.push({ name: "warm:if-stale", required: false, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["finlife:sync:if-stale"] === "string" && scripts["finlife:sync:if-stale"].trim()) {
    plan.push({ name: "finlife:sync:if-stale", required: true, runnable: true });
  } else {
    plan.push({ name: "finlife:sync:if-stale", required: true, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["datago:sync"] === "string" && scripts["datago:sync"].trim()) {
    plan.push({ name: "datago:sync", required: true, runnable: true });
  } else {
    plan.push({ name: "datago:sync", required: true, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["gov24:sync:if-stale"] === "string" && scripts["gov24:sync:if-stale"].trim()) {
    plan.push({ name: "gov24:sync:if-stale", required: true, runnable: true });
  } else {
    plan.push({ name: "gov24:sync:if-stale", required: true, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["news:refresh"] === "string" && scripts["news:refresh"].trim()) {
    plan.push({ name: "news:refresh", required: true, runnable: true, passStrict: true });
  } else {
    plan.push({ name: "news:refresh", required: true, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["indicators:refresh"] === "string" && scripts["indicators:refresh"].trim()) {
    plan.push({ name: "indicators:refresh", required: true, runnable: true, passStrict: true });
  } else {
    plan.push({ name: "indicators:refresh", required: true, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts["dart:watch"] === "string" && scripts["dart:watch"].trim()) {
    plan.push({ name: "dart:watch", required: true, runnable: true, passStrict: true });
  } else {
    plan.push({ name: "dart:watch", required: true, runnable: false, reason: "script_not_found" });
  }

  if (options.skipDoctor) {
    plan.push({ name: "data:doctor", required: false, runnable: false, reason: "cli_skip_doctor" });
  } else if (typeof scripts["data:doctor"] === "string" && scripts["data:doctor"].trim()) {
    plan.push({ name: "data:doctor", required: false, runnable: true, passStrict: true });
  } else {
    plan.push({ name: "data:doctor", required: false, runnable: false, reason: "script_not_found" });
  }

  if (typeof scripts.cleanup === "string" && scripts.cleanup.trim()) {
    plan.push({ name: "cleanup", required: false, runnable: true, tolerateFailureInNonStrict: true });
  } else {
    plan.push({ name: "cleanup", required: false, runnable: false, reason: "script_not_found" });
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
    const childArgs = [
      ...(step.args ?? []),
      ...(options.strict && step.passStrict ? ["--", "--strict"] : []),
    ];
    const result = await runPnpmScript(step.name, cwd, childArgs);
    const tookMs = Date.now() - startedAt;

    let status = result.code === 0 ? "ok" : "failed";
    if (shouldMarkDartWatchSkipped(step.name, result, hasOpenDartKey)) {
      status = "skipped";
    }

    const nonBlockingFailure = status === "failed" && !options.strict && step.tolerateFailureInNonStrict === true;

    if (status === "failed") {
      if (nonBlockingFailure) {
        addLog(`${stepPrefix} failed (exit ${result.code}, non-blocking)`);
      } else {
        addLog(`${stepPrefix} failed (exit ${result.code})`);
      }
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

  const { summary, failedCount, exitCode } = resolveDailyRefreshOutcome({
    generatedAt,
    strict: options.strict,
    plan,
    records,
  });

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

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(`[daily:refresh] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
