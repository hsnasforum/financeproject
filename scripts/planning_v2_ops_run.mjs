import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  OPS_LOGS_RELATIVE,
  OPS_REPORTS_RELATIVE,
  makeTimestampToken,
  normalizeKeep,
  pruneOpsArtifacts,
  tailText,
  writeJsonAtomic,
  writeTextAtomic,
} from "./planning_v2_ops_common.mjs";

const DEFAULT_STALE_DAYS = 45;
const DEFAULT_KEEP = 50;
const LOG_TAIL_LINES = 50;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeNowIso(input) {
  const row = asString(input);
  if (!row) return new Date().toISOString();
  const ms = Date.parse(row);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function maskSecrets(text) {
  const raw = asString(text);
  if (!raw) return "";
  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1***")
    .replace(/(ECOS_API_KEY|GITHUB_TOKEN|FINLIFE_API_KEY)\s*=\s*[^\s]+/gi, "$1=***")
    .replace(/(["']?(?:token|api[_-]?key|secret|password)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, "$1***$2");
}

function sanitizeCommandForReport(command, args) {
  return [command, ...args]
    .map((part) => maskSecrets(String(part)))
    .join(" ");
}

function normalizePkgScripts(pkgJson) {
  const scripts = pkgJson?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return {};
  return scripts;
}

async function loadPackageScripts(cwd) {
  const filePath = path.resolve(cwd, "package.json");
  const raw = await fs.readFile(filePath, "utf-8");
  return normalizePkgScripts(JSON.parse(raw));
}

function hasScript(scripts, name) {
  return typeof scripts?.[name] === "string" && scripts[name].trim().length > 0;
}

function createRunner(cwd) {
  return function runScript(scriptName, extraArgs = []) {
    return new Promise((resolve, reject) => {
      const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
      const args = [scriptName, ...extraArgs];
      const startedAtMs = Date.now();
      const out = [];
      const err = [];
      const child = spawn(command, args, {
        cwd,
        env: process.env,
      });
      child.stdout.on("data", (chunk) => out.push(String(chunk)));
      child.stderr.on("data", (chunk) => err.push(String(chunk)));
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          command,
          args,
          exitCode: Number.isFinite(code) ? code : 1,
          durationMs: Date.now() - startedAtMs,
          stdout: out.join(""),
          stderr: err.join(""),
        });
      });
    });
  };
}

function toSnapshotRef(snapshot, id) {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  return {
    ...(asString(id) ? { id: asString(id) } : {}),
    ...(asString(snapshot.asOf) ? { asOf: asString(snapshot.asOf) } : {}),
    ...(asString(snapshot.fetchedAt) ? { fetchedAt: asString(snapshot.fetchedAt) } : {}),
  };
}

function formatStepRow(step) {
  const base = `[${step.status}] ${step.name}`;
  if (step.note) return `${base} (${step.note})`;
  return base;
}

function parseArgs(argv) {
  const args = {
    withRegress: false,
    keep: DEFAULT_KEEP,
    staleDays: DEFAULT_STALE_DAYS,
    strictDoctor: false,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    if (token === "--with-regress") args.withRegress = true;
    if (token === "--strict-doctor") args.strictDoctor = true;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rest.join("=");
    if (key === "keep") args.keep = normalizeKeep(value, DEFAULT_KEEP);
    if (key === "stale-days") args.staleDays = Math.max(1, Math.min(3650, toInt(value, DEFAULT_STALE_DAYS)));
  }
  return args;
}

async function loadOpsHelpers() {
  const storageRaw = await tsImport("../src/lib/planning/assumptions/storage.ts", { parentURL: import.meta.url });
  const syncRaw = await tsImport("../src/lib/planning/ops/shouldSyncSnapshot.ts", { parentURL: import.meta.url });
  const storage = storageRaw?.default && typeof storageRaw.default === "object" ? storageRaw.default : storageRaw;
  const syncModule = syncRaw?.default && typeof syncRaw.default === "object" ? syncRaw.default : syncRaw;
  return {
    loadLatestAssumptionsSnapshot: storage?.loadLatestAssumptionsSnapshot,
    findAssumptionsSnapshotId: storage?.findAssumptionsSnapshotId,
    shouldSyncSnapshot: syncModule?.shouldSyncSnapshot,
  };
}

function buildTimestampForFilename(nowIso) {
  return makeTimestampToken(new Date(nowIso)).replace(/Z$/, "");
}

function pushStep(steps, payload) {
  steps.push({
    name: payload.name,
    command: payload.command,
    status: payload.status,
    ...(payload.exitCode !== undefined ? { exitCode: payload.exitCode } : {}),
    ...(payload.durationMs !== undefined ? { durationMs: payload.durationMs } : {}),
    ...(payload.note ? { note: payload.note } : {}),
  });
}

function resolveStepLogs(blocks) {
  return blocks.join("\n\n").trimEnd() + "\n";
}

function buildLogBlock(stepName, runResult) {
  const header = `## ${stepName}\ncommand=${sanitizeCommandForReport(runResult.command, runResult.args)}\nexitCode=${runResult.exitCode}\ndurationMs=${runResult.durationMs}`;
  return [
    header,
    "",
    "[stdout:last]",
    tailText(maskSecrets(runResult.stdout), LOG_TAIL_LINES),
    "",
    "[stderr:last]",
    tailText(maskSecrets(runResult.stderr), LOG_TAIL_LINES),
  ].join("\n");
}

async function runScriptStep(runScript, stepName, scriptName, extraArgs = []) {
  const result = await runScript(scriptName, extraArgs);
  return {
    stepName,
    scriptName,
    result,
  };
}

function findFallbackCompleteScripts(scripts) {
  const candidates = ["test", "planning:v2:smoke", "planning:v2:guard"];
  return candidates.filter((name) => hasScript(scripts, name));
}

export async function runOpsPipeline(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const startedAt = safeNowIso(options.nowIso);
  const keep = normalizeKeep(options.keep, DEFAULT_KEEP);
  const staleDays = Math.max(1, Math.min(3650, toInt(options.staleDays, DEFAULT_STALE_DAYS)));
  const withRegress = options.withRegress === true;
  const strictDoctor = options.strictDoctor === true;
  const pkgScripts = options.pkgScripts || await loadPackageScripts(cwd);
  const helpers = options.helpers || await loadOpsHelpers();
  const runScript = typeof options.runScript === "function" ? options.runScript : createRunner(cwd);

  const steps = [];
  const errors = [];
  const logBlocks = [];
  let finishedAt = startedAt;
  let overallOk = true;

  let beforeSnapshot;
  let beforeSnapshotId;
  if (typeof helpers.loadLatestAssumptionsSnapshot === "function") {
    beforeSnapshot = await helpers.loadLatestAssumptionsSnapshot();
  }
  if (beforeSnapshot && typeof helpers.findAssumptionsSnapshotId === "function") {
    try {
      beforeSnapshotId = await helpers.findAssumptionsSnapshotId(beforeSnapshot);
    } catch {
      beforeSnapshotId = undefined;
    }
  }

  const syncDecision = typeof helpers.shouldSyncSnapshot === "function"
    ? helpers.shouldSyncSnapshot({
      snapshot: beforeSnapshot,
      nowIso: startedAt,
      staleThresholdDays: staleDays,
    })
    : { attempt: false, reason: "SYNC_POLICY_UNAVAILABLE" };

  const snapshotSection = {
    before: toSnapshotRef(beforeSnapshot, beforeSnapshotId),
    after: undefined,
    syncAttempted: false,
    syncResult: "SKIPPED",
    syncReason: syncDecision.reason,
  };

  async function failAndStop(stepName, result, note) {
    pushStep(steps, {
      name: stepName,
      command: sanitizeCommandForReport(result.command, result.args),
      status: "FAIL",
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      note,
    });
    logBlocks.push(buildLogBlock(stepName, result));
    errors.push(`${stepName} failed (exit=${result.exitCode})`);
    overallOk = false;
    finishedAt = new Date().toISOString();
  }

  if (hasScript(pkgScripts, "planning:v2:doctor")) {
    const { result } = await runScriptStep(runScript, "doctor", "planning:v2:doctor", strictDoctor ? ["--", "--strict"] : []);
    if (result.exitCode !== 0) {
      await failAndStop("doctor", result, "doctor failed");
    } else {
      pushStep(steps, {
        name: "doctor",
        command: sanitizeCommandForReport(result.command, result.args),
        status: "PASS",
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });
      logBlocks.push(buildLogBlock("doctor", result));
    }
  } else {
    pushStep(steps, {
      name: "doctor",
      command: "pnpm planning:v2:doctor",
      status: "SKIPPED",
      note: "script_not_found",
    });
  }

  if (overallOk) {
    if (!syncDecision.attempt) {
      pushStep(steps, {
        name: "assumptions-sync",
        command: "pnpm planning:assumptions:sync",
        status: "SKIPPED",
        note: syncDecision.reason,
      });
    } else if (!hasScript(pkgScripts, "planning:assumptions:sync")) {
      snapshotSection.syncAttempted = false;
      snapshotSection.syncResult = "SKIPPED";
      pushStep(steps, {
        name: "assumptions-sync",
        command: "pnpm planning:assumptions:sync",
        status: "SKIPPED",
        note: "script_not_found",
      });
    } else {
      snapshotSection.syncAttempted = true;
      const { result } = await runScriptStep(runScript, "assumptions-sync", "planning:assumptions:sync", []);
      if (result.exitCode !== 0) {
        snapshotSection.syncResult = "WARN";
        pushStep(steps, {
          name: "assumptions-sync",
          command: sanitizeCommandForReport(result.command, result.args),
          status: "FAIL",
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          note: "sync_failed_continue",
        });
        errors.push(`assumptions-sync failed but continued (exit=${result.exitCode})`);
      } else {
        snapshotSection.syncResult = "PASS";
        pushStep(steps, {
          name: "assumptions-sync",
          command: sanitizeCommandForReport(result.command, result.args),
          status: "PASS",
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });
      }
      logBlocks.push(buildLogBlock("assumptions-sync", result));
    }
  }

  if (overallOk) {
    if (hasScript(pkgScripts, "planning:v2:complete")) {
      const { result } = await runScriptStep(runScript, "complete", "planning:v2:complete", []);
      if (result.exitCode !== 0) {
        await failAndStop("complete", result, "complete failed");
      } else {
        pushStep(steps, {
          name: "complete",
          command: sanitizeCommandForReport(result.command, result.args),
          status: "PASS",
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });
        logBlocks.push(buildLogBlock("complete", result));
      }
    } else {
      const fallbackScripts = findFallbackCompleteScripts(pkgScripts);
      if (fallbackScripts.length < 1) {
        pushStep(steps, {
          name: "complete-fallback",
          command: "pnpm test && pnpm planning:v2:smoke && pnpm planning:v2:guard",
          status: "SKIPPED",
          note: "no_fallback_scripts",
        });
      } else {
        for (const scriptName of fallbackScripts) {
          const stepName = `complete:${scriptName}`;
          const { result } = await runScriptStep(runScript, stepName, scriptName, []);
          if (result.exitCode !== 0) {
            await failAndStop(stepName, result, "complete fallback failed");
            break;
          }
          pushStep(steps, {
            name: stepName,
            command: sanitizeCommandForReport(result.command, result.args),
            status: "PASS",
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          });
          logBlocks.push(buildLogBlock(stepName, result));
        }
      }
    }
  }

  if (overallOk) {
    if (!withRegress) {
      pushStep(steps, {
        name: "regress",
        command: "pnpm planning:v2:regress",
        status: "SKIPPED",
        note: "with_regress_flag_not_set",
      });
    } else if (!hasScript(pkgScripts, "planning:v2:regress")) {
      pushStep(steps, {
        name: "regress",
        command: "pnpm planning:v2:regress",
        status: "SKIPPED",
        note: "script_not_found",
      });
    } else {
      const { result } = await runScriptStep(runScript, "regress", "planning:v2:regress", []);
      if (result.exitCode !== 0) {
        await failAndStop("regress", result, "regress failed");
      } else {
        pushStep(steps, {
          name: "regress",
          command: sanitizeCommandForReport(result.command, result.args),
          status: "PASS",
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });
        logBlocks.push(buildLogBlock("regress", result));
      }
    }
  }

  if (typeof helpers.loadLatestAssumptionsSnapshot === "function") {
    const afterSnapshot = await helpers.loadLatestAssumptionsSnapshot();
    let afterId;
    if (afterSnapshot && typeof helpers.findAssumptionsSnapshotId === "function") {
      try {
        afterId = await helpers.findAssumptionsSnapshotId(afterSnapshot);
      } catch {
        afterId = undefined;
      }
    }
    snapshotSection.after = toSnapshotRef(afterSnapshot, afterId);
  }

  finishedAt = new Date().toISOString();

  const report = {
    version: 1,
    startedAt,
    finishedAt,
    steps,
    snapshot: snapshotSection,
    ...(errors.length > 0 ? { errors } : {}),
  };

  const token = buildTimestampForFilename(startedAt);
  const reportPathAbs = path.resolve(cwd, OPS_REPORTS_RELATIVE, `${token}.json`);
  const logPathAbs = path.resolve(cwd, OPS_LOGS_RELATIVE, `${token}.log`);
  await writeJsonAtomic(reportPathAbs, report);
  await writeTextAtomic(logPathAbs, resolveStepLogs(logBlocks));
  const retention = await pruneOpsArtifacts(cwd, keep);

  return {
    ok: overallOk,
    report,
    reportPath: path.relative(cwd, reportPathAbs).replaceAll("\\", "/"),
    logPath: path.relative(cwd, logPathAbs).replaceAll("\\", "/"),
    retention,
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runOpsPipeline(args);
  console.log("[planning:v2:ops:run] summary");
  for (const step of result.report.steps) {
    console.log(`- ${formatStepRow(step)}`);
  }
  console.log(`[planning:v2:ops:run] report=${result.reportPath}`);
  console.log(`[planning:v2:ops:run] log=${result.logPath}`);
  console.log(
    `[planning:v2:ops:run] retention keep=${result.retention.keep} purgedReports=${result.retention.purgedReports} purgedLogs=${result.retention.purgedLogs}`,
  );
  if (!result.ok) {
    throw new Error("ops pipeline failed");
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:v2:ops:run] FAIL\n${maskSecrets(message)}`);
    process.exit(1);
  });
}
