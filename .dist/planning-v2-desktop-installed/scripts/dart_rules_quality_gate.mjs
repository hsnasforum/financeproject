import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVAL_RELATIVE_PATH = path.join("tmp", "dart", "rules_eval.json");
const BASELINE_RELATIVE_PATH = path.join("docs", "dart-rules-quality-baseline.json");
const REPORT_RELATIVE_PATH = path.join("docs", "dart-rules-quality-report.md");

const UNKNOWN_RATE_DELTA_FAIL = 0.03;
const CORRECTION_RATE_DELTA_FAIL = 0.05;
const HIGH_RATE_DELTA_LIMIT = 0.10;
const CATEGORY_RATE_SPIKE_WARN_RATIO = 2;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampRate(value) {
  const parsed = toNumber(value, 0);
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

function normalizeCategoryRates(input) {
  if (!isRecord(input)) return {};
  const out = {};
  const entries = Object.entries(input).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, value] of entries) {
    const safeKey = asString(key);
    if (!safeKey) continue;
    out[safeKey] = clampRate(value);
  }
  return out;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function toPercent(rate) {
  return `${(clampRate(rate) * 100).toFixed(1)}%`;
}

function parseHighRatePolicy(input) {
  const safe = asString(input).toLowerCase();
  if (safe === "fail") return "fail";
  return "warn";
}

export function normalizeEvalSnapshot(raw) {
  const total = toNumber(raw?.total, 0);
  const categoryRatesFromInput = normalizeCategoryRates(raw?.categoryRates);
  const hasCategoryRates = Object.keys(categoryRatesFromInput).length > 0;
  const categoryCounts = isRecord(raw?.categoryCounts) ? raw.categoryCounts : {};

  const derivedCategoryRates = {};
  if (!hasCategoryRates && total > 0 && isRecord(categoryCounts)) {
    for (const [key, value] of Object.entries(categoryCounts)) {
      const safeKey = asString(key);
      if (!safeKey) continue;
      const count = toNumber(value, 0);
      if (count <= 0) continue;
      derivedCategoryRates[safeKey] = clampRate(count / total);
    }
  }

  return {
    unknownRate: clampRate(raw?.unknownRate ?? raw?.levelRates?.unknown),
    correctionFlagRate: clampRate(raw?.correctionFlagRate ?? raw?.flagRates?.correction),
    highRate: clampRate(raw?.highRate ?? raw?.levelRates?.high),
    categoryRates: hasCategoryRates ? categoryRatesFromInput : normalizeCategoryRates(derivedCategoryRates),
  };
}

export function buildBaselineFromEval(rawEval, input = {}) {
  const normalized = normalizeEvalSnapshot(rawEval);
  return {
    version: 1,
    updatedAt: asString(input.updatedAt) || new Date().toISOString(),
    sourceEval: asString(input.sourceEval) || EVAL_RELATIVE_PATH,
    unknownRate: normalized.unknownRate,
    correctionFlagRate: normalized.correctionFlagRate,
    highRate: normalized.highRate,
    categoryRates: normalized.categoryRates,
  };
}

export function evaluateQualityGate(currentRaw, baselineRaw, input = {}) {
  const policy = parseHighRatePolicy(input.highRatePolicy);
  const current = normalizeEvalSnapshot(currentRaw);
  const baseline = {
    unknownRate: clampRate(baselineRaw?.unknownRate),
    correctionFlagRate: clampRate(baselineRaw?.correctionFlagRate),
    highRate: clampRate(baselineRaw?.highRate),
    categoryRates: normalizeCategoryRates(baselineRaw?.categoryRates),
  };

  const checks = [];
  const warns = [];
  const fails = [];

  const unknownDelta = current.unknownRate - baseline.unknownRate;
  const unknownStatus = unknownDelta > UNKNOWN_RATE_DELTA_FAIL ? "FAIL" : "PASS";
  checks.push({
    key: "unknownRate",
    status: unknownStatus,
    baseline: baseline.unknownRate,
    current: current.unknownRate,
    delta: unknownDelta,
    threshold: UNKNOWN_RATE_DELTA_FAIL,
    policy: "fail",
    message: "unknownRate increase must be <= 0.03",
  });
  if (unknownStatus === "FAIL") fails.push("unknownRate");

  const correctionDelta = current.correctionFlagRate - baseline.correctionFlagRate;
  const correctionStatus = correctionDelta > CORRECTION_RATE_DELTA_FAIL ? "FAIL" : "PASS";
  checks.push({
    key: "correctionFlagRate",
    status: correctionStatus,
    baseline: baseline.correctionFlagRate,
    current: current.correctionFlagRate,
    delta: correctionDelta,
    threshold: CORRECTION_RATE_DELTA_FAIL,
    policy: "fail",
    message: "correctionFlagRate increase must be <= 0.05",
  });
  if (correctionStatus === "FAIL") fails.push("correctionFlagRate");

  const highDelta = current.highRate - baseline.highRate;
  let highStatus = "PASS";
  if (highDelta > HIGH_RATE_DELTA_LIMIT) {
    highStatus = policy === "fail" ? "FAIL" : "WARN";
  }
  checks.push({
    key: "highRate",
    status: highStatus,
    baseline: baseline.highRate,
    current: current.highRate,
    delta: highDelta,
    threshold: HIGH_RATE_DELTA_LIMIT,
    policy,
    message: "highRate increase must be <= 0.10",
  });
  if (highStatus === "FAIL") fails.push("highRate");
  if (highStatus === "WARN") warns.push("highRate");

  const spikeWarnings = [];
  const categoryKeys = [...new Set([
    ...Object.keys(baseline.categoryRates),
    ...Object.keys(current.categoryRates),
  ])].sort((a, b) => a.localeCompare(b));
  for (const key of categoryKeys) {
    const prev = clampRate(baseline.categoryRates[key]);
    const next = clampRate(current.categoryRates[key]);
    if (prev <= 0) continue;
    const ratio = next / prev;
    if (ratio >= CATEGORY_RATE_SPIKE_WARN_RATIO) {
      spikeWarnings.push({
        category: key,
        baseline: prev,
        current: next,
        ratio,
      });
    }
  }
  checks.push({
    key: "categoryRateSpike",
    status: spikeWarnings.length > 0 ? "WARN" : "PASS",
    baseline: null,
    current: null,
    delta: null,
    threshold: CATEGORY_RATE_SPIKE_WARN_RATIO,
    policy: "warn",
    message: "categoryRates spike >= 2x",
    details: spikeWarnings,
  });
  if (spikeWarnings.length > 0) warns.push("categoryRateSpike");

  let status = "PASS";
  if (fails.length > 0) status = "FAIL";
  else if (warns.length > 0) status = "WARN";

  return {
    status,
    checks,
    current,
    baseline,
    policy: {
      highRatePolicy: policy,
    },
    failCount: fails.length,
    warnCount: warns.length,
  };
}

export function buildQualityReportMarkdown(input) {
  const lines = [];
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();
  lines.push("# DART Rules Quality Gate Report");
  lines.push("");
  lines.push(`- generatedAt: ${generatedAt}`);
  lines.push(`- status: ${input.status}`);
  lines.push(`- evalPath: ${asString(input.evalPath) || EVAL_RELATIVE_PATH}`);
  lines.push(`- baselinePath: ${asString(input.baselinePath) || BASELINE_RELATIVE_PATH}`);
  lines.push(`- highRatePolicy: ${asString(input.policy?.highRatePolicy) || "warn"}`);
  lines.push("");

  if (input.status === "SKIP") {
    lines.push("## Result");
    lines.push("");
    lines.push(`- skipped: ${asString(input.reason) || "missing input"}`);
    return `${lines.join("\n").trimEnd()}\n`;
  }

  lines.push("## Metrics");
  lines.push("");
  lines.push(`- unknownRate: ${toPercent(input.baseline.unknownRate)} -> ${toPercent(input.current.unknownRate)}`);
  lines.push(`- correctionFlagRate: ${toPercent(input.baseline.correctionFlagRate)} -> ${toPercent(input.current.correctionFlagRate)}`);
  lines.push(`- highRate: ${toPercent(input.baseline.highRate)} -> ${toPercent(input.current.highRate)}`);
  lines.push("");

  lines.push("## Checks");
  lines.push("");
  for (const check of input.checks ?? []) {
    if (check.key === "categoryRateSpike") {
      lines.push(`- [${check.status}] categoryRateSpike threshold=${check.threshold}x`);
      const details = Array.isArray(check.details) ? check.details : [];
      if (details.length === 0) {
        lines.push("  - details: none");
      } else {
        for (const item of details) {
          lines.push(`  - ${item.category}: ${toPercent(item.baseline)} -> ${toPercent(item.current)} (${item.ratio.toFixed(2)}x)`);
        }
      }
      continue;
    }

    const delta = toNumber(check.delta, 0);
    const direction = delta >= 0 ? "+" : "";
    lines.push(
      `- [${check.status}] ${check.key}: ${toPercent(check.baseline)} -> ${toPercent(check.current)} (${direction}${delta.toFixed(4)}, threshold=${check.threshold}, policy=${check.policy})`,
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function parseArgs(argv) {
  const out = {
    updateBaseline: false,
    highRatePolicy: parseHighRatePolicy(process.env.DART_RULES_HIGH_RATE_POLICY),
  };

  for (const arg of argv) {
    if (arg === "--update-baseline") {
      out.updateBaseline = true;
      continue;
    }
    if (arg.startsWith("--high-rate-policy=")) {
      out.highRatePolicy = parseHighRatePolicy(arg.split("=")[1] ?? "");
    }
  }

  return out;
}

export function runQualityGate(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const updateBaseline = Boolean(input.updateBaseline);
  const highRatePolicy = parseHighRatePolicy(input.highRatePolicy ?? process.env.DART_RULES_HIGH_RATE_POLICY);
  const evalPath = path.join(cwd, asString(input.evalPath) || EVAL_RELATIVE_PATH);
  const baselinePath = path.join(cwd, asString(input.baselinePath) || BASELINE_RELATIVE_PATH);
  const reportPath = path.join(cwd, asString(input.reportPath) || REPORT_RELATIVE_PATH);
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();

  if (!fs.existsSync(evalPath)) {
    const report = buildQualityReportMarkdown({
      generatedAt,
      status: "SKIP",
      reason: `evaluation file missing: ${path.relative(cwd, evalPath)}`,
      evalPath: path.relative(cwd, evalPath),
      baselinePath: path.relative(cwd, baselinePath),
      policy: { highRatePolicy },
    });
    ensureDir(reportPath);
    fs.writeFileSync(reportPath, report, "utf-8");
    return {
      ok: true,
      status: "SKIP",
      reportPath,
      evalPath,
      baselinePath,
      report,
    };
  }

  const evalRaw = readJson(evalPath);

  if (updateBaseline) {
    const nextBaseline = buildBaselineFromEval(evalRaw, {
      updatedAt: generatedAt,
      sourceEval: path.relative(cwd, evalPath),
    });
    writeJson(baselinePath, nextBaseline);
  }

  if (!fs.existsSync(baselinePath)) {
    const report = buildQualityReportMarkdown({
      generatedAt,
      status: "FAIL",
      reason: `baseline file missing: ${path.relative(cwd, baselinePath)} (run --update-baseline)`,
      evalPath: path.relative(cwd, evalPath),
      baselinePath: path.relative(cwd, baselinePath),
      policy: { highRatePolicy },
      checks: [],
      baseline: { unknownRate: 0, correctionFlagRate: 0, highRate: 0, categoryRates: {} },
      current: normalizeEvalSnapshot(evalRaw),
    });
    ensureDir(reportPath);
    fs.writeFileSync(reportPath, report, "utf-8");
    return {
      ok: false,
      status: "FAIL",
      reportPath,
      evalPath,
      baselinePath,
      report,
      error: "baseline missing",
    };
  }

  const baselineRaw = readJson(baselinePath);
  const result = evaluateQualityGate(evalRaw, baselineRaw, { highRatePolicy });
  const report = buildQualityReportMarkdown({
    ...result,
    generatedAt,
    evalPath: path.relative(cwd, evalPath),
    baselinePath: path.relative(cwd, baselinePath),
  });
  ensureDir(reportPath);
  fs.writeFileSync(reportPath, report, "utf-8");

  return {
    ok: result.status !== "FAIL",
    ...result,
    reportPath,
    evalPath,
    baselinePath,
    report,
    baselineUpdated: updateBaseline,
  };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = runQualityGate(args);

  if (result.status === "SKIP") {
    console.log("[dart:rules:gate] skipped: rules_eval.json not found");
    console.log(`[dart:rules:gate] report=${path.relative(process.cwd(), result.reportPath)}`);
    return;
  }

  if (result.baselineUpdated) {
    console.log(`[dart:rules:gate] baseline updated: ${path.relative(process.cwd(), result.baselinePath)}`);
  }

  console.log(`[dart:rules:gate] status=${result.status} fail=${result.failCount ?? 0} warn=${result.warnCount ?? 0}`);
  console.log(`[dart:rules:gate] report=${path.relative(process.cwd(), result.reportPath)}`);
  if (result.status === "FAIL") {
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:gate] failed: ${message}`);
    process.exit(1);
  }
}
