import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const DAILY_REFRESH_RESULT_SCHEMA_VERSION = 1;

export const DAILY_REFRESH_STEP_NAMES = [
  "warm:if-stale",
  "finlife:sync:if-stale",
  "datago:sync",
  "gov24:sync:if-stale",
  "news:refresh",
  "indicators:refresh",
  "dart:watch",
  "data:doctor",
  "cleanup",
];

export const DAILY_REFRESH_APPROVED_PR_PATHS = [
  ".data/benefits_snapshot.json",
  ".data/exchange_snapshot.json",
  ".data/finlife_credit-loan_snapshot.json",
  ".data/finlife_deposit_snapshot.json",
  ".data/finlife_mortgage-loan_snapshot.json",
  ".data/finlife_pension_snapshot.json",
  ".data/finlife_rent-house-loan_snapshot.json",
  ".data/finlife_saving_snapshot.json",
  "docs/dart-daily-brief.md",
  "docs/dart-disclosure-alerts.md",
  "docs/dart-disclosure-digest.md",
  "docs/data-freshness-report.md",
  "docs/schema-drift-report.md",
];

export const DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES = [
  "benefits_snapshot.json",
  "exchange_snapshot.json",
  "finlife_credit-loan_snapshot.json",
  "finlife_deposit_snapshot.json",
  "finlife_mortgage-loan_snapshot.json",
  "finlife_pension_snapshot.json",
  "finlife_rent-house-loan_snapshot.json",
  "finlife_saving_snapshot.json",
];

export const DAILY_REFRESH_DIAGNOSTIC_ARTIFACT_PATHS = [
  "tmp/daily_refresh_result.json",
  "tmp/daily_refresh.log",
  "tmp/daily_refresh_evidence.json",
  "tmp/dart/disclosure_state.json",
  "tmp/dart/disclosure_digest.json",
  "tmp/dart/disclosure_alerts.json",
  "tmp/dart/daily_brief.json",
  ".data/benefits_snapshot.json",
  ".data/benefits_snapshot_partial.json",
  ".data/exchange_snapshot.json",
  ".data/finlife_credit-loan_snapshot.json",
  ".data/finlife_deposit_snapshot.json",
  ".data/finlife_mortgage-loan_snapshot.json",
  ".data/finlife_pension_snapshot.json",
  ".data/finlife_rent-house-loan_snapshot.json",
  ".data/finlife_saving_snapshot.json",
  "docs/dart-daily-brief.md",
  "docs/dart-disclosure-alerts.md",
  "docs/dart-disclosure-digest.md",
  "docs/data-freshness-report.md",
  "docs/schema-drift-report.md",
];

const STEP_STATUSES = new Set(["ok", "skipped", "failed"]);

const DAILY_REFRESH_ENV_REQUIREMENTS = [
  { label: "FINLIFE_API_KEY", anyOf: ["FINLIFE_API_KEY"] },
  { label: "FINLIFE_TOPFIN_GRP_LIST", anyOf: ["FINLIFE_TOPFIN_GRP_LIST"] },
  { label: "KDB_DATAGO_SERVICE_KEY or DATAGO_SERVICE_KEY", anyOf: ["KDB_DATAGO_SERVICE_KEY", "DATAGO_SERVICE_KEY"] },
  { label: "BOK_ECOS_API_KEY or ECOS_API_KEY", anyOf: ["BOK_ECOS_API_KEY", "ECOS_API_KEY"] },
  { label: "EXIM_EXCHANGE_API_KEY", anyOf: ["EXIM_EXCHANGE_API_KEY"] },
  { label: "EXIM_EXCHANGE_API_URL", anyOf: ["EXIM_EXCHANGE_API_URL"] },
  { label: "MOIS_BENEFITS_API_KEY", anyOf: ["MOIS_BENEFITS_API_KEY"] },
  { label: "MOIS_BENEFITS_API_URL", anyOf: ["MOIS_BENEFITS_API_URL"] },
  { label: "OPENDART_API_KEY", anyOf: ["OPENDART_API_KEY"] },
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`invalid ${field}`);
  }
  return value;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function validateDailyRefreshEnvironment(env = process.env) {
  const missing = DAILY_REFRESH_ENV_REQUIREMENTS
    .filter((requirement) => !requirement.anyOf.some((key) => String(env[key] ?? "").trim()))
    .map((requirement) => requirement.label);
  if (missing.length > 0) {
    throw new Error(`daily refresh required env missing: ${missing.join(", ")}`);
  }

  let exchangeUrl;
  try {
    exchangeUrl = new URL(String(env.EXIM_EXCHANGE_API_URL).trim());
  } catch {
    throw new Error("daily refresh EXIM_EXCHANGE_API_URL is invalid");
  }
  if (exchangeUrl.protocol !== "https:") {
    throw new Error("daily refresh EXIM_EXCHANGE_API_URL must use https");
  }

  let benefitsUrl;
  try {
    benefitsUrl = new URL(String(env.MOIS_BENEFITS_API_URL).trim());
  } catch {
    throw new Error("daily refresh MOIS_BENEFITS_API_URL is invalid");
  }
  if (benefitsUrl.protocol !== "https:") {
    throw new Error("daily refresh MOIS_BENEFITS_API_URL must use https");
  }

  return {
    ok: true,
    requirements: DAILY_REFRESH_ENV_REQUIREMENTS.map((requirement) => requirement.label),
  };
}

export function resolveDailyRefreshOutcome({ generatedAt, strict, plan, records }) {
  let failedCount = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.status !== "failed") continue;
    const step = plan[index];
    const tolerated = !strict && step?.tolerateFailureInNonStrict === true;
    if (!tolerated) failedCount += 1;
  }

  const summary = {
    schemaVersion: DAILY_REFRESH_RESULT_SCHEMA_VERSION,
    mode: strict ? "strict" : "best-effort",
    generatedAt,
    steps: records,
    ok: failedCount === 0,
  };

  return {
    summary,
    failedCount,
    exitCode: strict && failedCount > 0 ? 1 : 0,
  };
}

export function validateDailyRefreshResult(value, options = {}) {
  if (!isRecord(value)) throw new Error("daily refresh result must be an object");
  if (value.schemaVersion !== DAILY_REFRESH_RESULT_SCHEMA_VERSION) {
    throw new Error("unsupported daily refresh result schemaVersion");
  }
  if (value.mode !== "strict" && value.mode !== "best-effort") {
    throw new Error("invalid daily refresh result mode");
  }
  if (!isIsoTimestamp(value.generatedAt)) {
    throw new Error("invalid daily refresh result generatedAt");
  }
  if (typeof value.ok !== "boolean") {
    throw new Error("invalid daily refresh result ok");
  }
  if (!Array.isArray(value.steps)) {
    throw new Error("invalid daily refresh result steps");
  }
  if (value.steps.length !== DAILY_REFRESH_STEP_NAMES.length) {
    throw new Error("daily refresh result step count mismatch");
  }

  const normalizedSteps = value.steps.map((step, index) => {
    if (!isRecord(step)) throw new Error(`invalid daily refresh step at index ${index}`);
    const expectedName = DAILY_REFRESH_STEP_NAMES[index];
    if (step.name !== expectedName) {
      throw new Error(`daily refresh step order mismatch at index ${index}`);
    }
    if (!STEP_STATUSES.has(step.status)) {
      throw new Error(`invalid daily refresh step status: ${expectedName}`);
    }
    requireNonNegativeInteger(step.tookMs, `daily refresh step tookMs: ${expectedName}`);
    if (typeof step.stdoutTail !== "string" || step.stdoutTail.length > 2_000) {
      throw new Error(`invalid daily refresh step stdoutTail: ${expectedName}`);
    }
    if (typeof step.stderrTail !== "string" || step.stderrTail.length > 2_000) {
      throw new Error(`invalid daily refresh step stderrTail: ${expectedName}`);
    }
    return {
      name: step.name,
      status: step.status,
      tookMs: step.tookMs,
      stdoutTail: step.stdoutTail,
      stderrTail: step.stderrTail,
    };
  });

  if (value.mode === "strict") {
    const expectedOk = normalizedSteps.every((step) => step.status !== "failed");
    if (value.ok !== expectedOk) {
      throw new Error("strict daily refresh result ok mismatch");
    }
  }
  if (options.requireStrict && value.mode !== "strict") {
    throw new Error("daily refresh result is not strict");
  }
  if (options.requireOk && value.ok !== true) {
    throw new Error("daily refresh result is not ok");
  }

  return {
    schemaVersion: value.schemaVersion,
    mode: value.mode,
    generatedAt: value.generatedAt,
    steps: normalizedSteps,
    ok: value.ok,
  };
}

function readSummaryInteger(text, field) {
  const pattern = new RegExp(`^- ${field}:\\s*(\\d+)\\s*$`, "m");
  const matched = pattern.exec(text);
  if (!matched) throw new Error(`freshness report missing ${field}`);
  return requireNonNegativeInteger(Number(matched[1]), `freshness ${field}`);
}

export function parseDailyRefreshFreshnessReport(text, options = {}) {
  const generatedAt = /^- Generated at:\s*(\S+)\s*$/m.exec(text)?.[1];
  const mode = /^- Mode:\s*(strict|warn)\s*$/m.exec(text)?.[1];
  if (!isIsoTimestamp(generatedAt)) throw new Error("freshness report generatedAt is invalid");
  if (!mode) throw new Error("freshness report mode is invalid");

  const total = readSummaryInteger(text, "total");
  const fresh = readSummaryInteger(text, "fresh");
  const stale = readSummaryInteger(text, "stale");
  const missingTimestamp = readSummaryInteger(text, "missingTimestamp");
  const invalidTimestamp = readSummaryInteger(text, "invalidTimestamp");
  const ignoredAuxiliary = readSummaryInteger(text, "ignoredAuxiliary");
  const canonicalSet = new Set(DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES);
  const snapshots = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length !== 6 || !canonicalSet.has(cells[0])) continue;
    if (snapshots.some((row) => row.file === cells[0])) {
      throw new Error(`freshness report duplicate snapshot row: ${cells[0]}`);
    }
    snapshots.push({
      file: cells[0],
      source: cells[1],
      generatedAt: cells[2],
      status: cells[5],
    });
  }

  if (total !== fresh + stale + missingTimestamp + invalidTimestamp) {
    throw new Error("freshness report summary count mismatch");
  }
  if (total !== DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES.length) {
    throw new Error("freshness report canonical snapshot count mismatch");
  }
  if (snapshots.length !== DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES.length) {
    throw new Error("freshness report canonical snapshot rows are incomplete");
  }
  for (const expectedFile of DAILY_REFRESH_CANONICAL_SNAPSHOT_FILES) {
    const snapshot = snapshots.find((row) => row.file === expectedFile);
    if (!snapshot || !isIsoTimestamp(snapshot.generatedAt)) {
      throw new Error(`freshness report snapshot timestamp is invalid: ${expectedFile}`);
    }
    if (options.requireFresh && snapshot.status !== "fresh") {
      throw new Error(`freshness report snapshot is not fresh: ${expectedFile}`);
    }
  }
  if (options.requireStrict && mode !== "strict") {
    throw new Error("freshness report is not strict");
  }
  if (options.requireFresh && (stale > 0 || missingTimestamp > 0 || invalidTimestamp > 0)) {
    throw new Error("freshness report contains blocking issues");
  }

  return {
    generatedAt,
    mode,
    total,
    fresh,
    stale,
    missingTimestamp,
    invalidTimestamp,
    ignoredAuxiliary,
    snapshots,
  };
}

function resolveApprovedFile(cwd, relativePath) {
  const root = path.resolve(cwd);
  const absolutePath = path.resolve(root, relativePath);
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`approved artifact path escapes repository: ${relativePath}`);
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`approved artifact is missing: ${relativePath}`);
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    const cursorStat = fs.lstatSync(cursor);
    if (cursorStat.isSymbolicLink()) {
      throw new Error(`approved artifact path contains symlink: ${relativePath}`);
    }
  }
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`approved artifact is not a regular file: ${relativePath}`);
  }
  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(absolutePath);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`approved artifact real path escapes repository: ${relativePath}`);
  }
  return { absolutePath, stat };
}

export function collectDailyRefreshArtifactEvidence(
  cwd,
  approvedPaths = DAILY_REFRESH_APPROVED_PR_PATHS,
) {
  return approvedPaths.map((relativePath) => {
    const { absolutePath, stat } = resolveApprovedFile(cwd, relativePath);
    const content = fs.readFileSync(absolutePath);
    return {
      path: relativePath,
      bytes: content.byteLength,
      modifiedAt: stat.mtime.toISOString(),
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
    };
  });
}

function runGitPathList(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "buffer",
  });
  if (result.status !== 0) {
    throw new Error("daily refresh git inventory failed");
  }
  return result.stdout
    .toString("utf-8")
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/\\/g, "/"));
}

export function validateDailyRefreshGitChanges(
  cwd,
  approvedPaths = DAILY_REFRESH_APPROVED_PR_PATHS,
) {
  const approved = new Set(approvedPaths);
  const trackedApproved = new Set(runGitPathList(cwd, [
    "ls-files",
    "-z",
    "--",
    ...approvedPaths,
  ]));
  for (const relativePath of approvedPaths) {
    if (!trackedApproved.has(relativePath)) {
      throw new Error(`approved artifact is not tracked: ${relativePath}`);
    }
  }

  const changed = new Set([
    ...runGitPathList(cwd, ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"]),
    ...runGitPathList(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  for (const relativePath of changed) {
    if (!approved.has(relativePath)) {
      throw new Error(`daily refresh changed unapproved path: ${relativePath}`);
    }
  }
  return [...changed].sort((left, right) => left.localeCompare(right));
}

export function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf-8").digest("hex");
}
