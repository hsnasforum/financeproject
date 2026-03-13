import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { runOpsPipeline } from "./planning_v2_ops_run.mjs";
import {
  OPS_LOGS_RELATIVE,
  OPS_REPORTS_RELATIVE,
  makeTimestampToken,
  writeJsonAtomic,
  writeTextAtomic,
} from "./planning_v2_ops_common.mjs";

const DEFAULT_KEEP = 50;
const DEFAULT_STALE_DAYS = 45;
const DEFAULT_LEGACY_LIMIT = 100;
const DEFAULT_LEGACY_FAIL_THRESHOLD = 0;
const LEGACY_BACKFILL_CONFIRM = "BACKFILL LEGACY RUNS";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKeep(value, fallback = DEFAULT_KEEP) {
  return Math.max(1, Math.min(500, toInt(value, fallback)));
}

function normalizeLegacyLimit(value, fallback = DEFAULT_LEGACY_LIMIT) {
  return Math.max(1, Math.min(500, toInt(value, fallback)));
}

function normalizeLegacyFailThreshold(value, fallback = DEFAULT_LEGACY_FAIL_THRESHOLD) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(-1, Math.min(100_000, parsed));
}

function normalizeLegacyMode(value) {
  const normalized = asString(value).toLowerCase();
  if (normalized === "off" || normalized === "skip") return "off";
  if (normalized === "apply") return "apply";
  return "check";
}

function fallbackRedactText(text) {
  return String(text ?? "")
    .replace(/\b(Bearer\s+)[^\s"'`]+/gi, "$1***")
    .replace(/(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN|FINLIFE_API_KEY)\s*=\s*[^\s]+/gi, "$1=***")
    .replace(/\.data(?:[\\/][^\s"'`)\]}]+)+/g, "<DATA_PATH>")
    .replace(/\b\d{7,}\b/g, "<AMOUNT>");
}

export function parseOpsSafetyArgs(argv = []) {
  const out = {
    withRegress: false,
    strictDoctor: false,
    keep: DEFAULT_KEEP,
    staleDays: DEFAULT_STALE_DAYS,
    legacyMode: "check",
    legacyLimit: DEFAULT_LEGACY_LIMIT,
    legacyIncludeOpsDoctor: false,
    legacyFailThreshold: DEFAULT_LEGACY_FAIL_THRESHOLD,
    confirm: "",
  };

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    if (token === "--with-regress") out.withRegress = true;
    if (token === "--strict-doctor") out.strictDoctor = true;
    if (token === "--legacy-include-ops-doctor") out.legacyIncludeOpsDoctor = true;
    if (token === "--legacy-apply") out.legacyMode = "apply";
    if (token === "--legacy-off") out.legacyMode = "off";
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "keep") out.keep = normalizeKeep(value, DEFAULT_KEEP);
    if (key === "stale-days") out.staleDays = Math.max(1, Math.min(3650, toInt(value, DEFAULT_STALE_DAYS)));
    if (key === "legacy-mode") out.legacyMode = normalizeLegacyMode(value);
    if (key === "legacy-limit") out.legacyLimit = normalizeLegacyLimit(value, DEFAULT_LEGACY_LIMIT);
    if (key === "legacy-fail-threshold") out.legacyFailThreshold = normalizeLegacyFailThreshold(value, DEFAULT_LEGACY_FAIL_THRESHOLD);
    if (key === "confirm") out.confirm = value;
  }

  return out;
}

async function loadLegacyBackfillHelpers() {
  const modRaw = await tsImport("../src/lib/planning/store/runStore.ts", { parentURL: import.meta.url });
  const mod = modRaw?.default && typeof modRaw.default === "object" ? modRaw.default : modRaw;
  return {
    summarizeLegacyRunBackfill: typeof mod?.summarizeLegacyRunBackfill === "function"
      ? mod.summarizeLegacyRunBackfill
      : null,
    listLegacyRunBackfillCandidates: typeof mod?.listLegacyRunBackfillCandidates === "function"
      ? mod.listLegacyRunBackfillCandidates
      : null,
    backfillLegacyRuns: typeof mod?.backfillLegacyRuns === "function"
      ? mod.backfillLegacyRuns
      : null,
  };
}

function buildLegacyLogBlock(input) {
  const lines = [
    "## legacy-backfill",
    `mode=${input.mode}`,
    `includeOpsDoctor=${input.includeOpsDoctor ? "true" : "false"}`,
    `limit=${input.limit}`,
    `failThreshold=${input.failThreshold}`,
    "",
    "[summary]",
    `totalRuns=${input.summary?.totalRuns ?? "-"}`,
    `legacyCandidates=${input.summary?.legacyCandidates ?? "-"}`,
    `resultDtoOnlyCandidates=${input.summary?.resultDtoOnlyCandidates ?? "-"}`,
    `missingResultDtoCandidates=${input.summary?.missingResultDtoCandidates ?? "-"}`,
    `missingEngineSchemaCandidates=${input.summary?.missingEngineSchemaCandidates ?? "-"}`,
    "",
    "[candidates]",
    `count=${input.candidateCount}`,
    `overThreshold=${input.overThreshold ? "true" : "false"}`,
  ];
  if (Array.isArray(input.candidatesSample) && input.candidatesSample.length > 0) {
    lines.push(...input.candidatesSample.map((row) => (
      `- ${row.id} profile=${row.profileId} kind=${row.runKind} reason=${row.reason}`
    )));
  } else {
    lines.push("- sample=none");
  }
  if (input.applyResult) {
    lines.push("", "[apply]");
    lines.push(`selected=${input.applyResult.selected}`);
    lines.push(`migrated=${input.applyResult.migrated}`);
    lines.push(`skipped=${input.applyResult.skipped}`);
    lines.push(`failed=${input.applyResult.failed}`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function runOpsSafetyPipeline(options = {}) {
  const startedAt = new Date().toISOString();
  const cwd = path.resolve(options.cwd || process.cwd());
  const args = {
    withRegress: options.withRegress === true,
    strictDoctor: options.strictDoctor === true,
    keep: normalizeKeep(options.keep, DEFAULT_KEEP),
    staleDays: Math.max(1, Math.min(3650, toInt(options.staleDays, DEFAULT_STALE_DAYS))),
    legacyMode: normalizeLegacyMode(options.legacyMode),
    legacyLimit: normalizeLegacyLimit(options.legacyLimit, DEFAULT_LEGACY_LIMIT),
    legacyIncludeOpsDoctor: options.legacyIncludeOpsDoctor === true,
    legacyFailThreshold: normalizeLegacyFailThreshold(options.legacyFailThreshold, DEFAULT_LEGACY_FAIL_THRESHOLD),
    confirm: asString(options.confirm),
  };

  const opsRunner = typeof options.opsPipelineRunner === "function" ? options.opsPipelineRunner : runOpsPipeline;
  const legacyHelpers = options.legacyHelpers || await loadLegacyBackfillHelpers();
  const reportErrors = [];

  const opsResult = await opsRunner({
    cwd,
    withRegress: args.withRegress,
    strictDoctor: args.strictDoctor,
    keep: args.keep,
    staleDays: args.staleDays,
  });

  let legacySection = {
    mode: args.legacyMode,
    includeOpsDoctor: args.legacyIncludeOpsDoctor,
    limit: args.legacyLimit,
    failThreshold: args.legacyFailThreshold,
    status: "SKIPPED",
    reason: "legacy_check_disabled",
  };

  let legacyLogBlock = "";
  if (args.legacyMode !== "off") {
    if (
      typeof legacyHelpers?.summarizeLegacyRunBackfill !== "function"
      || typeof legacyHelpers?.listLegacyRunBackfillCandidates !== "function"
    ) {
      legacySection = {
        ...legacySection,
        status: "FAIL",
        reason: "legacy_helpers_unavailable",
      };
      reportErrors.push("legacy backfill helpers unavailable");
    } else {
      const summary = await legacyHelpers.summarizeLegacyRunBackfill();
      const candidates = await legacyHelpers.listLegacyRunBackfillCandidates({
        limit: args.legacyLimit,
        includeOpsDoctor: args.legacyIncludeOpsDoctor,
      });
      const candidateCount = Array.isArray(candidates) ? candidates.length : 0;
      const overThreshold = args.legacyFailThreshold >= 0 && candidateCount > args.legacyFailThreshold;

      const baseLegacy = {
        mode: args.legacyMode,
        includeOpsDoctor: args.legacyIncludeOpsDoctor,
        limit: args.legacyLimit,
        failThreshold: args.legacyFailThreshold,
        summary,
        candidateCount,
        overThreshold,
        candidatesSample: Array.isArray(candidates) ? candidates.slice(0, 20) : [],
      };

      if (args.legacyMode === "apply") {
        if (args.confirm !== LEGACY_BACKFILL_CONFIRM) {
          legacySection = {
            ...baseLegacy,
            status: "FAIL",
            reason: "confirm_mismatch",
          };
          reportErrors.push(`legacy apply confirm mismatch (required: "${LEGACY_BACKFILL_CONFIRM}")`);
        } else if (typeof legacyHelpers.backfillLegacyRuns !== "function") {
          legacySection = {
            ...baseLegacy,
            status: "FAIL",
            reason: "legacy_apply_unavailable",
          };
          reportErrors.push("legacy backfill apply helper unavailable");
        } else {
          const applyResult = await legacyHelpers.backfillLegacyRuns({
            limit: args.legacyLimit,
            includeOpsDoctor: args.legacyIncludeOpsDoctor,
          });
          const applyFailed = Math.max(0, Number(applyResult?.failed ?? 0)) > 0;
          legacySection = {
            ...baseLegacy,
            status: applyFailed || overThreshold ? "FAIL" : "PASS",
            reason: applyFailed ? "apply_failed" : (overThreshold ? "threshold_exceeded" : "ok"),
            applyResult,
          };
          if (applyFailed) reportErrors.push(`legacy backfill apply failed count=${applyResult.failed}`);
          if (overThreshold) reportErrors.push(`legacy candidates exceed threshold (${candidateCount} > ${args.legacyFailThreshold})`);
        }
      } else {
        legacySection = {
          ...baseLegacy,
          status: overThreshold ? "FAIL" : "PASS",
          reason: overThreshold ? "threshold_exceeded" : "ok",
        };
        if (overThreshold) {
          reportErrors.push(`legacy candidates exceed threshold (${candidateCount} > ${args.legacyFailThreshold})`);
        }
      }
      legacyLogBlock = buildLegacyLogBlock(legacySection);
    }
  }

  const ok = Boolean(opsResult.ok) && legacySection.status !== "FAIL";
  const finishedAt = new Date().toISOString();
  const token = makeTimestampToken(startedAt).replace(/Z$/, "");
  const reportPathAbs = path.resolve(cwd, OPS_REPORTS_RELATIVE, `${token}-safety.json`);
  const logPathAbs = path.resolve(cwd, OPS_LOGS_RELATIVE, `${token}-safety.log`);

  const report = {
    version: 1,
    startedAt,
    finishedAt,
    ok,
    options: {
      withRegress: args.withRegress,
      strictDoctor: args.strictDoctor,
      keep: args.keep,
      staleDays: args.staleDays,
      legacyMode: args.legacyMode,
      legacyLimit: args.legacyLimit,
      legacyIncludeOpsDoctor: args.legacyIncludeOpsDoctor,
      legacyFailThreshold: args.legacyFailThreshold,
    },
    opsRun: {
      ok: Boolean(opsResult.ok),
      reportPath: asString(opsResult.reportPath),
      logPath: asString(opsResult.logPath),
      steps: Array.isArray(opsResult.report?.steps) ? opsResult.report.steps : [],
    },
    legacyBackfill: legacySection,
    ...(reportErrors.length > 0 ? { errors: reportErrors } : {}),
  };

  const safetyLog = [
    "# planning:v2:ops:safety",
    `startedAt=${startedAt}`,
    `finishedAt=${finishedAt}`,
    `ok=${ok ? "true" : "false"}`,
    "",
    "[ops]",
    `ok=${opsResult.ok ? "true" : "false"}`,
    `report=${asString(opsResult.reportPath)}`,
    `log=${asString(opsResult.logPath)}`,
    "",
    legacyLogBlock.trimEnd(),
  ].join("\n").trimEnd() + "\n";

  await writeJsonAtomic(reportPathAbs, report);
  await writeTextAtomic(logPathAbs, safetyLog);

  return {
    ok,
    report,
    reportPath: path.relative(cwd, reportPathAbs).replaceAll("\\", "/"),
    logPath: path.relative(cwd, logPathAbs).replaceAll("\\", "/"),
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseOpsSafetyArgs(argv);
  const result = await runOpsSafetyPipeline(args);
  console.log("[planning:v2:ops:safety] summary");
  console.log(`- opsRun: ${result.report.opsRun.ok ? "PASS" : "FAIL"}`);
  console.log(`- legacyBackfill: ${result.report.legacyBackfill.status} (${result.report.legacyBackfill.reason})`);
  if (typeof result.report.legacyBackfill.candidateCount === "number") {
    console.log(`- legacyCandidates=${result.report.legacyBackfill.candidateCount}`);
  }
  console.log(`[planning:v2:ops:safety] report=${result.reportPath}`);
  console.log(`[planning:v2:ops:safety] log=${result.logPath}`);
  if (!result.ok) {
    const message = Array.isArray(result.report.errors) && result.report.errors.length > 0
      ? result.report.errors.join("; ")
      : "ops safety pipeline failed";
    throw new Error(message);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:v2:ops:safety] FAIL\n${fallbackRedactText(message)}`);
    process.exit(1);
  });
}
