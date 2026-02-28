import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const CORPUS_RELATIVE_PATH = path.join("tmp", "dart", "disclosure_corpus.json");
const OUTPUT_JSON_RELATIVE_PATH = path.join("tmp", "dart", "rules_eval.json");
const OUTPUT_MD_RELATIVE_PATH = path.join("docs", "dart-rules-eval-report.md");
const TITLE_TOP_N = 20;

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

function formatPercent(numerator, denominator) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function normalizeCorpusRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items;
  return [];
}

function toCorpusItem(row) {
  if (!isRecord(row)) return null;
  const corpCode = asString(row.corpCode ?? row.corp_code);
  const corpName = asString(row.corpName ?? row.corp_name);
  const rceptDt = asString(row.rceptDt ?? row.rcept_dt ?? row.receiptDate ?? row.date);
  const reportNm = asString(row.reportNm ?? row.report_nm ?? row.reportName ?? row.title);
  const rceptNo = asString(row.rceptNo ?? row.rcept_no ?? row.receiptNo ?? row.receipt_no);
  if (!corpCode || !corpName || !rceptDt || !reportNm) return null;

  return rceptNo
    ? { corpCode, corpName, rceptDt, reportNm, rceptNo }
    : { corpCode, corpName, rceptDt, reportNm };
}

function sortCountMapEntries(map) {
  return [...map.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function toRateObject(counts, total) {
  const rates = {};
  for (const [key, value] of Object.entries(counts)) {
    rates[key] = total > 0 ? Number((value / total).toFixed(6)) : 0;
  }
  return rates;
}

function hasCorrectionFlag(title) {
  return /(기재정정|첨부정정|정정)/.test(title);
}

function hasAttachmentFlag(title) {
  return /첨부/.test(title);
}

function hasSubmissionFlag(title) {
  return /(공시\s*서류\s*제출|공시서류제출)/.test(title);
}

export function evaluateDisclosureRules({
  corpusItems,
  rules,
  normalizeTitle,
  tokenizeTitle,
  classify,
}) {
  const rows = [];
  for (const row of normalizeCorpusRows(corpusItems)) {
    const item = toCorpusItem(row);
    if (item) rows.push(item);
  }

  const categoryCounts = {};
  const levelCounts = { high: 0, mid: 0, low: 0 };
  const flagCounts = {
    correction: 0,
    attachment: 0,
    submission: 0,
  };
  const titleFreqByCategory = new Map();

  let unknownCount = 0;
  let tokenTotal = 0;

  for (const row of rows) {
    const normalizedResult = normalizeTitle(row.reportNm, rules);
    const normalizedTitle = asString(normalizedResult?.normalized);
    const tokens = tokenizeTitle(normalizedTitle);
    tokenTotal += tokens.length;

    const classification = classify({ reportName: normalizedTitle || row.reportNm }, rules);
    const categoryId = asString(classification?.categoryId) || "other";
    const level = asString(classification?.level).toLowerCase();

    if (level === "high" || level === "mid" || level === "low") {
      levelCounts[level] += 1;
    } else {
      levelCounts.low += 1;
    }

    categoryCounts[categoryId] = (categoryCounts[categoryId] ?? 0) + 1;

    const rawTitle = row.reportNm;
    if (hasCorrectionFlag(rawTitle)) flagCounts.correction += 1;
    if (hasAttachmentFlag(rawTitle)) flagCounts.attachment += 1;
    if (hasSubmissionFlag(rawTitle)) flagCounts.submission += 1;

    const unknown = !normalizedTitle || categoryId === "other";
    if (unknown) unknownCount += 1;

    const bucket = titleFreqByCategory.get(categoryId) ?? new Map();
    const titleKey = normalizedTitle || rawTitle;
    bucket.set(titleKey, (bucket.get(titleKey) ?? 0) + 1);
    titleFreqByCategory.set(categoryId, bucket);
  }

  const total = rows.length;
  const topTitlesByCategory = {};
  const categoryIds = Object.keys(categoryCounts).sort((a, b) => a.localeCompare(b));
  for (const categoryId of categoryIds) {
    const titleMap = titleFreqByCategory.get(categoryId) ?? new Map();
    topTitlesByCategory[categoryId] = sortCountMapEntries(titleMap)
      .slice(0, TITLE_TOP_N)
      .map(([title, count]) => ({ title, count }));
  }

  const categoryRates = toRateObject(categoryCounts, total);
  const levelRates = {
    ...toRateObject(levelCounts, total),
    unknown: total > 0 ? Number((unknownCount / total).toFixed(6)) : 0,
  };
  const flagRates = {
    correction: total > 0 ? Number((flagCounts.correction / total).toFixed(6)) : 0,
    attachment: total > 0 ? Number((flagCounts.attachment / total).toFixed(6)) : 0,
    submission: total > 0 ? Number((flagCounts.submission / total).toFixed(6)) : 0,
  };

  return {
    total,
    categoryCounts,
    categoryRates,
    levelCounts,
    levelRates,
    unknownCount,
    unknownRate: levelRates.unknown,
    flagCounts,
    flagRates,
    tokenStats: {
      totalTokens: tokenTotal,
      avgTokens: total > 0 ? Number((tokenTotal / total).toFixed(3)) : 0,
    },
    topTitlesByCategory,
  };
}

export function buildEvalReportMarkdown(result, meta = {}) {
  const lines = [];
  const generatedAt = asString(meta.generatedAt) || new Date().toISOString();
  lines.push("# DART 분류 룰 평가 리포트");
  lines.push("");
  lines.push(`- 생성시각: ${generatedAt}`);
  lines.push(`- Rules: ${asString(meta.rulesPath) || RULES_RELATIVE_PATH}`);
  lines.push(`- Corpus: ${asString(meta.corpusPath) || CORPUS_RELATIVE_PATH}`);
  lines.push(`- 표본 수: ${result.total}`);
  lines.push("");

  lines.push("## 분류 비율");
  lines.push("");
  const categoryEntries = Object.entries(result.categoryCounts)
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
  if (categoryEntries.length === 0) {
    lines.push("- category: 없음");
  } else {
    for (const [categoryId, count] of categoryEntries) {
      lines.push(`- category/${categoryId}: ${count} (${formatPercent(count, result.total)})`);
    }
  }
  lines.push(`- level/high: ${result.levelCounts.high} (${formatPercent(result.levelCounts.high, result.total)})`);
  lines.push(`- level/mid: ${result.levelCounts.mid} (${formatPercent(result.levelCounts.mid, result.total)})`);
  lines.push(`- level/low: ${result.levelCounts.low} (${formatPercent(result.levelCounts.low, result.total)})`);
  lines.push(`- level/unknown: ${result.unknownCount} (${formatPercent(result.unknownCount, result.total)})`);
  lines.push("");

  lines.push("## 플래그 비율");
  lines.push("");
  lines.push(`- 정정: ${result.flagCounts.correction} (${formatPercent(result.flagCounts.correction, result.total)})`);
  lines.push(`- 첨부: ${result.flagCounts.attachment} (${formatPercent(result.flagCounts.attachment, result.total)})`);
  lines.push(`- 공시서류제출: ${result.flagCounts.submission} (${formatPercent(result.flagCounts.submission, result.total)})`);
  lines.push("");

  lines.push("## 카테고리별 대표 제목 Top 20");
  lines.push("");
  const categories = Object.keys(result.topTitlesByCategory).sort((a, b) => a.localeCompare(b));
  if (categories.length === 0) {
    lines.push("- 없음");
  } else {
    for (const categoryId of categories) {
      lines.push(`### ${categoryId}`);
      const rows = result.topTitlesByCategory[categoryId] ?? [];
      if (rows.length === 0) {
        lines.push("- 없음");
      } else {
        for (const row of rows.slice(0, TITLE_TOP_N)) {
          lines.push(`- ${row.count} | ${row.title}`);
        }
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function loadClassifierHelpers() {
  const classifierMod = await tsImport("../src/lib/dart/disclosureClassifier.ts", { parentURL: import.meta.url });
  const normalizeMod = await tsImport("../src/lib/dart/disclosureNormalize.ts", { parentURL: import.meta.url });

  const classifierSource = isRecord(classifierMod?.default) ? classifierMod.default : classifierMod;
  const normalizeSource = isRecord(normalizeMod?.default) ? normalizeMod.default : normalizeMod;

  const loadRules = classifierSource?.loadRules;
  const classify = classifierSource?.classify;
  const normalizeTitle = normalizeSource?.normalizeTitle;
  const tokenizeTitle = normalizeSource?.tokenizeTitle;

  if (typeof loadRules !== "function" || typeof classify !== "function") {
    throw new Error("disclosure classifier helpers are not available");
  }
  if (typeof normalizeTitle !== "function" || typeof tokenizeTitle !== "function") {
    throw new Error("disclosure normalize helpers are not available");
  }

  return { loadRules, classify, normalizeTitle, tokenizeTitle };
}

export async function run() {
  const cwd = process.cwd();
  const rulesPath = path.join(cwd, RULES_RELATIVE_PATH);
  const corpusPath = path.join(cwd, CORPUS_RELATIVE_PATH);
  const outputJsonPath = path.join(cwd, OUTPUT_JSON_RELATIVE_PATH);
  const outputMdPath = path.join(cwd, OUTPUT_MD_RELATIVE_PATH);
  const generatedAt = new Date().toISOString();

  const { loadRules, classify, normalizeTitle, tokenizeTitle } = await loadClassifierHelpers();
  const rules = loadRules(rulesPath);

  let corpusRaw = { items: [] };
  if (!fs.existsSync(corpusPath)) {
    console.log(`[dart:rules:eval] corpus not found (${CORPUS_RELATIVE_PATH}); evaluating empty corpus`);
  } else {
    corpusRaw = JSON.parse(fs.readFileSync(corpusPath, "utf-8"));
  }

  const summary = evaluateDisclosureRules({
    corpusItems: corpusRaw,
    rules,
    normalizeTitle,
    tokenizeTitle,
    classify,
  });

  const output = {
    version: 1,
    generatedAt,
    rulesPath: RULES_RELATIVE_PATH,
    corpusPath: CORPUS_RELATIVE_PATH,
    ...summary,
  };

  const markdown = buildEvalReportMarkdown(output, {
    generatedAt,
    rulesPath: RULES_RELATIVE_PATH,
    corpusPath: CORPUS_RELATIVE_PATH,
  });

  ensureDir(outputJsonPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  ensureDir(outputMdPath);
  fs.writeFileSync(outputMdPath, markdown, "utf-8");

  console.log(`[dart:rules:eval] total=${summary.total} unknownRate=${(summary.unknownRate * 100).toFixed(1)}%`);
  console.log(`[dart:rules:eval] output=${OUTPUT_JSON_RELATIVE_PATH}`);
  console.log(`[dart:rules:eval] report=${OUTPUT_MD_RELATIVE_PATH}`);
  return output;
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:eval] failed: ${message}`);
    process.exit(1);
  });
}
