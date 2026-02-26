import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const dataDir = path.join(cwd, ".data");
const reportPath = path.join(cwd, "docs", "data-freshness-report.md");

const SOURCE_RULES = [
  { source: "finlife", pattern: /^finlife_.*_snapshot\.json$/i, maxAgeDays: 3 },
  { source: "benefits", pattern: /^benefits_.*\.json$/i, maxAgeDays: 7 },
  { source: "gov24", pattern: /^gov24_.*\.json$/i, maxAgeDays: 7 },
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function findGeneratedAt(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.meta?.generatedAt === "string") return value.meta.generatedAt;
  if (typeof value.generatedAt === "string") return value.generatedAt;
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
  lines.push("## Summary");
  lines.push("");
  lines.push(`- total: ${input.rows.length}`);
  lines.push(`- fresh: ${input.summary.fresh}`);
  lines.push(`- stale: ${input.summary.stale}`);
  lines.push(`- missingTimestamp: ${input.summary.missingTimestamp}`);
  lines.push(`- invalidTimestamp: ${input.summary.invalidTimestamp}`);
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const now = new Date();

  const fileNames = listSnapshots();
  if (fileNames.length === 0) {
    throw new Error("No .json snapshots found under .data/");
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
      status = "stale";
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
    missingTimestamp: rows.filter((row) => row.status === "missing_generated_at").length,
    invalidTimestamp: rows.filter((row) => row.status === "invalid_generated_at").length,
  };

  const report = buildReportMarkdown({
    generatedAt: now.toISOString(),
    strict,
    rows,
    summary,
  });

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, report, "utf-8");

  console.log("[freshness:report] generated docs/data-freshness-report.md");
  console.log(
    `[freshness:report] total=${rows.length} fresh=${summary.fresh} stale=${summary.stale} missing=${summary.missingTimestamp} invalid=${summary.invalidTimestamp}`,
  );

  if (summary.missingTimestamp > 0) {
    console.warn("[freshness:report] some snapshots do not expose meta.generatedAt or generatedAt");
  }
  if (summary.invalidTimestamp > 0) {
    console.warn("[freshness:report] some snapshots have invalid generatedAt timestamp");
  }
  if (strict && summary.stale > 0) {
    console.error("[freshness:report] stale snapshots exceed maxAgeDays in strict mode");
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
