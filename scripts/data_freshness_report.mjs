import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const dataDir = path.join(cwd, ".data");
const reportPath = path.join(cwd, "docs", "data-freshness-report.md");

const SOURCE_RULES = [
  { source: "finlife", pattern: /^finlife_.*_snapshot\.json$/i, maxAgeDays: 3 },
  { source: "benefits", pattern: /^benefits_.*\.json$/i, maxAgeDays: 7 },
  { source: "gov24", pattern: /^gov24_.*\.json$/i, maxAgeDays: 7 },
  { source: "exchange", pattern: /^exchange_snapshot\.json$/i, maxAgeDays: 1 },
];
const AUXILIARY_FILE_PATTERNS = [
  /_partial\.json$/i,
  /_checkpoint\.json$/i,
];

function resolveSourceRule(fileName) {
  for (const rule of SOURCE_RULES) {
    if (rule.pattern.test(fileName)) return rule;
  }
  return {
    source: "other",
    pattern: /.*/,
    maxAgeDays: 7,
  };
}

function listSnapshots() {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
}

function isAuxiliaryFile(fileName) {
  return AUXILIARY_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function parseNow(args) {
  const option = args.find((arg) => arg.startsWith("--now="));
  if (!option) return new Date();
  const configuredNow = option.slice("--now=".length).trim();
  const configuredNowMs = Date.parse(configuredNow);
  if (!configuredNow || !Number.isFinite(configuredNowMs)) {
    throw new Error("--now requires a valid ISO date-time");
  }
  return new Date(configuredNowMs);
}

function parseExceptions(args, now) {
  const option = args.find((arg) => arg.startsWith("--exceptions="));
  if (!option) return new Map();
  const configuredPath = option.slice("--exceptions=".length).trim();
  if (!configuredPath) throw new Error("--exceptions requires a JSON file path");
  const absolutePath = path.resolve(cwd, configuredPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`freshness exceptions file not found: ${configuredPath}`);
  }
  const parsed = readJson(absolutePath);
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.exceptions)) {
    throw new Error("freshness exceptions must use schemaVersion=1 and an exceptions array");
  }
  const out = new Map();
  for (const entry of parsed.exceptions) {
    const file = typeof entry?.file === "string" ? entry.file.trim() : "";
    const reason = typeof entry?.reason === "string" ? entry.reason.trim() : "";
    const mitigation = typeof entry?.mitigation === "string" ? entry.mitigation.trim() : "";
    const expiresAt = typeof entry?.expiresAt === "string" ? entry.expiresAt.trim() : "";
    const expiresAtMs = Date.parse(expiresAt);
    if (!file || path.basename(file) !== file || !reason || !mitigation || !Number.isFinite(expiresAtMs)) {
      throw new Error(`invalid freshness exception entry: ${file || "<missing file>"}`);
    }
    if (expiresAtMs <= now.getTime()) throw new Error(`expired freshness exception: ${file}`);
    if (out.has(file)) throw new Error(`duplicate freshness exception: ${file}`);
    out.set(file, { file, reason, mitigation, expiresAt });
  }
  return out;
}

function findGeneratedAt(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.meta?.generatedAt === "string") return value.meta.generatedAt;
  if (typeof value.generatedAt === "string") return value.generatedAt;
  if (typeof value.meta?.syncedAt === "string") return value.meta.syncedAt;
  if (typeof value.status?.lastUpdatedAt === "string") return value.status.lastUpdatedAt;
  if (typeof value.status?.generatedAt === "string") return value.status.generatedAt;
  return null;
}

function toAgeDays(isoText, now) {
  const parsed = new Date(isoText);
  if (Number.isNaN(parsed.getTime())) return null;
  return (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function formatAge(ageDays) {
  if (ageDays === null) return "-";
  return ageDays.toFixed(2);
}

function buildReportMarkdown(input) {
  const lines = [];
  lines.push("# Data Freshness Report");
  lines.push("");
  lines.push(`- Generated at: ${input.generatedAt}`);
  lines.push(`- Mode: ${input.strict ? "strict" : "warn"}`);
  lines.push("");
  lines.push("## Source Thresholds");
  lines.push("");
  lines.push("| Source | maxAgeDays |");
  lines.push("| --- | ---: |");
  for (const rule of SOURCE_RULES) {
    lines.push(`| ${rule.source} | ${rule.maxAgeDays} |`);
  }
  lines.push("");
  lines.push("## Snapshot Status");
  lines.push("");
  lines.push("| File | Source | generatedAt | ageDays | maxAgeDays | Status |");
  lines.push("| --- | --- | --- | ---: | ---: | --- |");
  for (const row of input.rows) {
    lines.push(
      `| ${row.fileName} | ${row.source} | ${row.generatedAt ?? "-"} | ${formatAge(row.ageDays)} | ${row.maxAgeDays} | ${row.status} |`,
    );
  }
  lines.push("");
  if (input.appliedExceptions.length > 0) {
    lines.push("## Time-limited Exceptions");
    lines.push("");
    lines.push("| File | Expires at | Reason | Mitigation |");
    lines.push("| --- | --- | --- | --- |");
    for (const entry of input.appliedExceptions) {
      lines.push(`| ${entry.file} | ${entry.expiresAt} | ${entry.reason} | ${entry.mitigation} |`);
    }
    lines.push("");
  }
  if (input.ignoredFiles.length > 0) {
    lines.push("## Ignored Auxiliary Files");
    lines.push("");
    lines.push("| File | Reason |");
    lines.push("| --- | --- |");
    for (const fileName of input.ignoredFiles) {
      lines.push(`| ${fileName} | auxiliary snapshot (excluded from freshness gate) |`);
    }
    lines.push("");
  }
  lines.push("## Summary");
  lines.push("");
  lines.push(`- total: ${input.rows.length}`);
  lines.push(`- fresh: ${input.summary.fresh}`);
  lines.push(`- stale: ${input.summary.stale}`);
  lines.push(`- staleException: ${input.summary.staleException}`);
  lines.push(`- missingTimestamp: ${input.summary.missingTimestamp}`);
  lines.push(`- invalidTimestamp: ${input.summary.invalidTimestamp}`);
  lines.push(`- ignoredAuxiliary: ${input.ignoredFiles.length}`);
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const now = parseNow(args);
  const exceptions = parseExceptions(args, now);

  const allFileNames = listSnapshots();
  if (allFileNames.length === 0) {
    throw new Error("No .json snapshots found under .data/");
  }
  const ignoredFiles = allFileNames.filter((fileName) => isAuxiliaryFile(fileName));
  const fileNames = allFileNames.filter((fileName) => !isAuxiliaryFile(fileName));
  if (fileNames.length === 0) {
    throw new Error("No tracked .json snapshots found under .data/ (only auxiliary files found)");
  }

  const rows = [];
  for (const fileName of fileNames) {
    const rule = resolveSourceRule(fileName);
    const parsed = readJson(path.join(dataDir, fileName));
    const generatedAt = findGeneratedAt(parsed);
    const ageDays = generatedAt ? toAgeDays(generatedAt, now) : null;

    let status = "fresh";
    if (!generatedAt) {
      status = "missing_generated_at";
    } else if (ageDays === null) {
      status = "invalid_generated_at";
    } else if (ageDays > rule.maxAgeDays) {
      status = exceptions.has(fileName) ? "stale_exception" : "stale";
    }

    rows.push({
      fileName,
      source: rule.source,
      generatedAt,
      ageDays,
      maxAgeDays: rule.maxAgeDays,
      status,
    });
  }

  const summary = {
    fresh: rows.filter((row) => row.status === "fresh").length,
    stale: rows.filter((row) => row.status === "stale").length,
    staleException: rows.filter((row) => row.status === "stale_exception").length,
    missingTimestamp: rows.filter((row) => row.status === "missing_generated_at").length,
    invalidTimestamp: rows.filter((row) => row.status === "invalid_generated_at").length,
  };
  const appliedExceptions = rows
    .filter((row) => row.status === "stale_exception")
    .map((row) => exceptions.get(row.fileName));
  const unusedExceptions = [...exceptions.keys()].filter((fileName) => !appliedExceptions.some((entry) => entry.file === fileName));
  if (unusedExceptions.length > 0) {
    throw new Error(`unused freshness exceptions: ${unusedExceptions.join(", ")}`);
  }

  const report = buildReportMarkdown({
    generatedAt: now.toISOString(),
    strict,
    rows,
    summary,
    ignoredFiles,
    appliedExceptions,
  });

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, report, "utf-8");

  console.log("[freshness:report] generated docs/data-freshness-report.md");
  console.log(
    `[freshness:report] total=${rows.length} fresh=${summary.fresh} stale=${summary.stale} exceptions=${summary.staleException} missing=${summary.missingTimestamp} invalid=${summary.invalidTimestamp}`,
  );

  const blockingIssueCount = summary.stale + summary.missingTimestamp + summary.invalidTimestamp;

  if (summary.missingTimestamp > 0) {
    console.warn("[freshness:report] some snapshots do not expose meta.generatedAt or generatedAt");
  }
  if (summary.invalidTimestamp > 0) {
    console.warn("[freshness:report] some snapshots have invalid generatedAt timestamp");
  }
  if (strict && blockingIssueCount > 0) {
    console.error("[freshness:report] snapshot freshness issues found in strict mode");
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[freshness:report] failed: ${message}`);
  process.exit(1);
}
