import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIGEST_RELATIVE_PATH = path.join("tmp", "dart", "disclosure_digest.json");
const ALERTS_RELATIVE_PATH = path.join("tmp", "dart", "disclosure_alerts.json");
const OUTPUT_RELATIVE_PATH = path.join("tmp", "dart", "disclosure_corpus.json");

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function toDateMillis(value) {
  const text = asString(value);
  if (!text) return 0;
  if (/^\d{8}$/.test(text)) {
    const year = Number(text.slice(0, 4));
    const month = Number(text.slice(4, 6)) - 1;
    const day = Number(text.slice(6, 8));
    const parsed = Date.UTC(year, month, day);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCorpusItem(row, fallback = {}) {
  if (!isRecord(row)) return null;

  const corpCode = asString(row.corpCode ?? row.corp_code ?? fallback.corpCode);
  const corpName = asString(row.corpName ?? row.corp_name ?? fallback.corpName);
  const rceptDt = asString(
    row.rceptDt
      ?? row.rcept_dt
      ?? row.receiptDate
      ?? row.date
      ?? row.endDate
      ?? fallback.rceptDt,
  );
  const reportNm = asString(
    row.reportNm
      ?? row.report_nm
      ?? row.reportName
      ?? row.title
      ?? row.representativeTitle
      ?? fallback.reportNm,
  );
  const rceptNo = asString(
    row.rceptNo
      ?? row.rcept_no
      ?? row.receiptNo
      ?? row.receipt_no
      ?? row.representativeReceiptNo
      ?? fallback.rceptNo,
  );

  if (!corpCode || !corpName || !rceptDt || !reportNm) return null;

  const item = {
    corpCode,
    corpName,
    rceptDt,
    reportNm,
  };

  if (rceptNo) {
    return {
      ...item,
      rceptNo,
    };
  }

  return item;
}

function addMaybe(items, row, fallback = {}) {
  const next = toCorpusItem(row, fallback);
  if (!next) return;
  items.push(next);
}

function collectFromDigest(raw, items) {
  if (!isRecord(raw)) return;

  const companies = Array.isArray(raw.companies) ? raw.companies : [];
  for (const company of companies) {
    if (!isRecord(company)) continue;
    const corpCode = asString(company.corpCode ?? company.corp_code);
    const corpName = asString(company.corpName ?? company.corp_name);
    const companyFallback = { corpCode, corpName };

    for (const bucket of ["newItems", "latestItems"]) {
      const rows = Array.isArray(company[bucket]) ? company[bucket] : [];
      for (const row of rows) {
        addMaybe(items, row, companyFallback);
      }
    }

    const clusters = Array.isArray(company.clusters) ? company.clusters : [];
    for (const cluster of clusters) {
      if (!isRecord(cluster)) continue;
      const clusterFallback = {
        ...companyFallback,
        rceptDt: asString(cluster.endDate),
        reportNm: asString(cluster.representativeTitle),
        rceptNo: asString(cluster.representativeReceiptNo),
      };
      addMaybe(items, cluster.representative, clusterFallback);

      const clusterItems = Array.isArray(cluster.items) ? cluster.items : [];
      for (const row of clusterItems) {
        addMaybe(items, row, clusterFallback);
      }
    }
  }

  const topHighlights = Array.isArray(raw.topHighlights) ? raw.topHighlights : [];
  for (const cluster of topHighlights) {
    if (!isRecord(cluster)) continue;
    const clusterFallback = {
      corpCode: asString(cluster.corpCode ?? cluster.corp_code),
      corpName: asString(cluster.corpName ?? cluster.corp_name),
      rceptDt: asString(cluster.endDate),
      reportNm: asString(cluster.representativeTitle),
      rceptNo: asString(cluster.representativeReceiptNo),
    };
    addMaybe(items, cluster.representative, clusterFallback);
    const clusterItems = Array.isArray(cluster.items) ? cluster.items : [];
    for (const row of clusterItems) {
      addMaybe(items, row, clusterFallback);
    }
  }
}

function collectFromAlerts(raw, items) {
  if (!isRecord(raw)) return;
  for (const bucket of ["newHigh", "newMid", "updatedHigh", "updatedMid"]) {
    const rows = Array.isArray(raw[bucket]) ? raw[bucket] : [];
    for (const row of rows) {
      addMaybe(items, row);
    }
  }
}

function compareCorpusItems(a, b) {
  const dateDiff = toDateMillis(b.rceptDt) - toDateMillis(a.rceptDt);
  if (dateDiff !== 0) return dateDiff;

  const dateTextDiff = asString(b.rceptDt).localeCompare(asString(a.rceptDt));
  if (dateTextDiff !== 0) return dateTextDiff;

  const noDiff = asString(b.rceptNo).localeCompare(asString(a.rceptNo));
  if (noDiff !== 0) return noDiff;

  const corpDiff = asString(a.corpCode).localeCompare(asString(b.corpCode));
  if (corpDiff !== 0) return corpDiff;

  return asString(a.reportNm).localeCompare(asString(b.reportNm));
}

function dedupeAndSort(items) {
  const bestByKey = new Map();

  for (const item of items) {
    const key = item.rceptNo
      ? `r:${item.rceptNo}`
      : `k:${item.corpCode}|${item.corpName}|${item.rceptDt}|${item.reportNm}`;
    const previous = bestByKey.get(key);
    if (!previous || compareCorpusItems(item, previous) < 0) {
      bestByKey.set(key, item);
    }
  }

  return [...bestByKey.values()].sort(compareCorpusItems);
}

export function collectDisclosureCorpus(input) {
  const items = [];
  collectFromDigest(input.digest, items);
  collectFromAlerts(input.alerts, items);
  return dedupeAndSort(items);
}

export function run() {
  const cwd = process.cwd();
  const digestPath = path.join(cwd, DIGEST_RELATIVE_PATH);
  const alertsPath = path.join(cwd, ALERTS_RELATIVE_PATH);
  const outputPath = path.join(cwd, OUTPUT_RELATIVE_PATH);

  const hasDigest = fs.existsSync(digestPath);
  const hasAlerts = fs.existsSync(alertsPath);

  if (!hasDigest && !hasAlerts) {
    console.log("[dart:rules:collect] no input files found; skipped");
    console.log(`[dart:rules:collect] expected: ${DIGEST_RELATIVE_PATH}`);
    console.log(`[dart:rules:collect] expected: ${ALERTS_RELATIVE_PATH}`);
    return { ok: true, skipped: true, count: 0 };
  }

  const digest = hasDigest ? readJson(digestPath) : null;
  const alerts = hasAlerts ? readJson(alertsPath) : null;
  const items = collectDisclosureCorpus({ digest, alerts });

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      digest: hasDigest,
      alerts: hasAlerts,
    },
    count: items.length,
    items,
  };

  ensureDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(`[dart:rules:collect] items=${items.length}`);
  console.log(`[dart:rules:collect] output=${OUTPUT_RELATIVE_PATH}`);
  return { ok: true, skipped: false, count: items.length };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:collect] failed: ${message}`);
    process.exit(1);
  }
}
