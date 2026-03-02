import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const DEFAULT_LABELS_RELATIVE_PATH = path.join("data", "dart", "labels.sample.csv");
const OUTPUT_JSON_RELATIVE_PATH = path.join("tmp", "dart", "rules_labeled_eval.json");
const OUTPUT_MD_RELATIVE_PATH = path.join("docs", "dart-rules-labeled-report.md");
const DEFAULT_TOP_N = 20;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolvePath(cwd, filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function safeRatio(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function formatPercent(rate) {
  return `${(safeRatio(rate, 1) * 100).toFixed(2)}%`;
}

function parseCsvLine(line) {
  const out = [];
  let token = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    const next = line[index + 1];
    if (ch === "\"") {
      if (quoted && next === "\"") {
        token += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(token);
      token = "";
      continue;
    }
    token += ch;
  }

  out.push(token);
  return out;
}

export function parseLabeledCsv(text) {
  const source = asString(text).replace(/^\uFEFF/, "");
  if (!source) return [];

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => asString(header));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const required = ["corpCode", "rceptDt", "reportNm", "label"];
  for (const key of required) {
    if (!headerIndex.has(key)) {
      throw new Error(`missing csv column: ${key}`);
    }
  }

  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    const raw = parseCsvLine(lines[index]);
    const row = {
      corpCode: asString(raw[headerIndex.get("corpCode")]),
      rceptDt: asString(raw[headerIndex.get("rceptDt")]),
      reportNm: asString(raw[headerIndex.get("reportNm")]),
      label: asString(raw[headerIndex.get("label")]),
      line: index + 1,
    };
    if (!row.corpCode || !row.rceptDt || !row.reportNm || !row.label) continue;
    rows.push(row);
  }
  return rows;
}

function sortLabelEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

export function evaluateLabeledRows({
  rows,
  rules,
  normalizeTitle,
  classify,
  topN = DEFAULT_TOP_N,
}) {
  const labelSet = new Set((Array.isArray(rules?.categories) ? rules.categories : []).map((row) => asString(row.id)).filter(Boolean));
  const labelCounts = {};
  const labelCorrectCounts = {};
  const confusion = {};
  const invalidLabels = [];
  const misclassified = [];

  let correct = 0;
  for (const row of rows) {
    const normalized = normalizeTitle(row.reportNm, rules);
    const normalizedTitle = asString(normalized?.normalized);
    const classified = classify({ reportName: normalizedTitle || row.reportNm }, rules);
    const predictedCategoryId = asString(classified?.categoryId) || "other";
    const expectedLabel = asString(row.label);

    labelCounts[expectedLabel] = (labelCounts[expectedLabel] ?? 0) + 1;
    confusion[expectedLabel] = confusion[expectedLabel] ?? {};
    confusion[expectedLabel][predictedCategoryId] = (confusion[expectedLabel][predictedCategoryId] ?? 0) + 1;

    if (!labelSet.has(expectedLabel)) {
      invalidLabels.push({
        line: row.line,
        label: expectedLabel,
        reportNm: row.reportNm,
      });
    }

    if (expectedLabel === predictedCategoryId) {
      labelCorrectCounts[expectedLabel] = (labelCorrectCounts[expectedLabel] ?? 0) + 1;
      correct += 1;
    } else {
      misclassified.push({
        corpCode: row.corpCode,
        rceptDt: row.rceptDt,
        reportNm: row.reportNm,
        label: expectedLabel,
        predictedCategoryId,
        score: toNumber(classified?.score, 0),
        level: asString(classified?.level) || "low",
        reason: asString(classified?.reason),
      });
    }
  }

  const total = rows.length;
  const accuracy = safeRatio(correct, total);
  const perLabel = {};
  for (const [label, count] of sortLabelEntries(Object.entries(labelCounts))) {
    const matched = labelCorrectCounts[label] ?? 0;
    perLabel[label] = {
      total: count,
      correct: matched,
      accuracy: safeRatio(matched, count),
    };
  }

  const confusionPairs = [];
  for (const [actual, predictedMap] of Object.entries(confusion)) {
    for (const [predicted, count] of Object.entries(predictedMap)) {
      if (actual === predicted) continue;
      confusionPairs.push({ actual, predicted, count });
    }
  }

  confusionPairs.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    const actualDiff = a.actual.localeCompare(b.actual);
    if (actualDiff !== 0) return actualDiff;
    return a.predicted.localeCompare(b.predicted);
  });

  misclassified.sort((a, b) => {
    const dateDiff = b.rceptDt.localeCompare(a.rceptDt);
    if (dateDiff !== 0) return dateDiff;
    const labelDiff = a.label.localeCompare(b.label);
    if (labelDiff !== 0) return labelDiff;
    return a.reportNm.localeCompare(b.reportNm);
  });

  return {
    total,
    correct,
    accuracy,
    labelCounts,
    perLabel,
    confusionMatrix: confusion,
    confusionTop: confusionPairs.slice(0, topN),
    misclassifiedTop: misclassified.slice(0, topN),
    misclassifiedCount: misclassified.length,
    invalidLabels,
  };
}

export function buildLabeledReportMarkdown(result, meta = {}) {
  const lines = [];
  lines.push("# DART 룰 라벨 평가 리포트");
  lines.push("");
  lines.push(`- 생성시각: ${asString(meta.generatedAt) || new Date().toISOString()}`);
  lines.push(`- rulesPath: ${asString(meta.rulesPath) || RULES_RELATIVE_PATH}`);
  lines.push(`- labelsPath: ${asString(meta.labelsPath) || DEFAULT_LABELS_RELATIVE_PATH}`);
  lines.push(`- 샘플 수: ${result.total}`);
  lines.push(`- 정확도: ${formatPercent(result.accuracy)}`);
  lines.push("");

  lines.push("## Label별 정확도");
  lines.push("");
  const labelEntries = Object.entries(result.perLabel).sort((a, b) => {
    const totalDiff = toNumber(b[1]?.total) - toNumber(a[1]?.total);
    if (totalDiff !== 0) return totalDiff;
    return a[0].localeCompare(b[0]);
  });
  if (labelEntries.length === 0) {
    lines.push("- 없음");
  } else {
    for (const [label, stat] of labelEntries) {
      lines.push(`- ${label}: ${stat.correct}/${stat.total} (${formatPercent(stat.accuracy)})`);
    }
  }
  lines.push("");

  lines.push("## 혼동 Top");
  lines.push("");
  if (!Array.isArray(result.confusionTop) || result.confusionTop.length === 0) {
    lines.push("- 없음");
  } else {
    for (const row of result.confusionTop) {
      lines.push(`- ${row.actual} -> ${row.predicted}: ${row.count}`);
    }
  }
  lines.push("");

  lines.push(`## 오분류 Top ${DEFAULT_TOP_N}`);
  lines.push("");
  if (!Array.isArray(result.misclassifiedTop) || result.misclassifiedTop.length === 0) {
    lines.push("- 없음");
  } else {
    for (const row of result.misclassifiedTop) {
      lines.push(`- ${row.rceptDt} | ${row.label} -> ${row.predictedCategoryId} | ${row.reportNm}`);
    }
  }

  if (Array.isArray(result.invalidLabels) && result.invalidLabels.length > 0) {
    lines.push("");
    lines.push("## Invalid Label");
    lines.push("");
    for (const row of result.invalidLabels.slice(0, DEFAULT_TOP_N)) {
      lines.push(`- line ${row.line}: ${row.label} | ${row.reportNm}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function loadHelpers() {
  const classifierMod = await tsImport("../src/lib/dart/disclosureClassifier.ts", { parentURL: import.meta.url });
  const normalizeMod = await tsImport("../src/lib/dart/disclosureNormalize.ts", { parentURL: import.meta.url });

  const classifierSource = classifierMod?.default ?? classifierMod;
  const normalizeSource = normalizeMod?.default ?? normalizeMod;

  const loadRules = classifierSource?.loadRules;
  const classify = classifierSource?.classify;
  const normalizeTitle = normalizeSource?.normalizeTitle;

  if (typeof loadRules !== "function" || typeof classify !== "function") {
    throw new Error("classifier helpers are not available");
  }
  if (typeof normalizeTitle !== "function") {
    throw new Error("normalize helper is not available");
  }

  return { loadRules, classify, normalizeTitle };
}

function parseArgs(argv) {
  const out = {
    labels: DEFAULT_LABELS_RELATIVE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--labels") {
      out.labels = asString(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--labels=")) {
      out.labels = asString(arg.split("=")[1]);
    }
  }

  return out;
}

export async function runLabeledEval(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const labelsPath = resolvePath(cwd, asString(input.labelsPath) || DEFAULT_LABELS_RELATIVE_PATH);
  const rulesPath = resolvePath(cwd, asString(input.rulesPath) || RULES_RELATIVE_PATH);
  const outputJsonPath = resolvePath(cwd, asString(input.outputJsonPath) || OUTPUT_JSON_RELATIVE_PATH);
  const outputMdPath = resolvePath(cwd, asString(input.outputMdPath) || OUTPUT_MD_RELATIVE_PATH);
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();

  if (!fs.existsSync(labelsPath)) {
    console.log(`[dart:rules:eval:labeled] labels file not found: ${path.relative(cwd, labelsPath)}`);
    return {
      ok: true,
      skipped: true,
      reason: "labels missing",
      labelsPath,
    };
  }

  const { loadRules, classify, normalizeTitle } = await loadHelpers();
  const rules = loadRules(rulesPath);
  const csvText = fs.readFileSync(labelsPath, "utf-8");
  const rows = parseLabeledCsv(csvText);
  const result = evaluateLabeledRows({
    rows,
    rules,
    normalizeTitle,
    classify,
    topN: toNumber(input.topN, DEFAULT_TOP_N),
  });

  const output = {
    version: 1,
    generatedAt,
    labelsPath: path.relative(cwd, labelsPath),
    rulesPath: path.relative(cwd, rulesPath),
    ...result,
  };

  const markdown = buildLabeledReportMarkdown(output, {
    generatedAt,
    labelsPath: path.relative(cwd, labelsPath),
    rulesPath: path.relative(cwd, rulesPath),
  });

  ensureDir(outputJsonPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  ensureDir(outputMdPath);
  fs.writeFileSync(outputMdPath, markdown, "utf-8");

  console.log(`[dart:rules:eval:labeled] rows=${output.total} accuracy=${formatPercent(output.accuracy)}`);
  console.log(`[dart:rules:eval:labeled] output=${path.relative(cwd, outputJsonPath)}`);
  console.log(`[dart:rules:eval:labeled] report=${path.relative(cwd, outputMdPath)}`);

  return {
    ok: true,
    skipped: false,
    output,
    outputJsonPath,
    outputMdPath,
  };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  runLabeledEval({
    labelsPath: args.labels,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:eval:labeled] failed: ${message}`);
    process.exit(1);
  });
}
