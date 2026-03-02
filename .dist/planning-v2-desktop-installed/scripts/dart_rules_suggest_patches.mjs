import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { parseLabeledCsv, runLabeledEval } from "./dart_rules_eval_labeled.mjs";

const RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const LABELS_RELATIVE_PATH = path.join("data", "dart", "labels.sample.csv");
const LABELED_EVAL_RELATIVE_PATH = path.join("tmp", "dart", "rules_labeled_eval.json");
const OUTPUT_JSON_RELATIVE_PATH = path.join("tmp", "dart", "rules_suggestions.json");
const OUTPUT_MD_RELATIVE_PATH = path.join("docs", "dart-rules-suggestions.md");
const DEFAULT_TOP_N = 20;
const EXAMPLE_LIMIT = 3;

const STOPWORDS = new Set([
  "정정",
  "첨부",
  "제출",
  "공시",
  "공시서류",
  "보고서",
  "사업보고서",
  "반기보고서",
  "분기보고서",
  "기재정정",
  "첨부정정",
  "추가정정",
  "제출정정",
  "사항",
  "신고서",
  "보고",
  "정기",
  "수시",
]);

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function resolvePath(cwd, filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => asString(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isStopword(token) {
  if (!token) return true;
  if (STOPWORDS.has(token)) return true;
  if (/^\d+$/.test(token)) return true;
  if (token.length < 2) return true;
  return false;
}

export function filterTokens(tokens) {
  return uniqueSorted(tokens).filter((token) => !isStopword(token));
}

export function createTokenExtractor({ rules, normalizeTitle, tokenizeTitle }) {
  return (reportNm) => {
    const source = asString(reportNm);
    const normalized = normalizeTitle(source, rules);
    const title = asString(normalized?.normalized) || source;
    const tokens = Array.isArray(tokenizeTitle(title)) ? tokenizeTitle(title) : [];
    return filterTokens(tokens);
  };
}

export function normalizeCases(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const label = asString(row.label);
    const predictedCategoryId = asString(row.predictedCategoryId ?? row.predicted);
    const reportNm = asString(row.reportNm ?? row.reportName ?? row.title);
    if (!label || !predictedCategoryId || !reportNm) continue;
    if (predictedCategoryId === label) continue;
    out.push({
      label,
      predictedCategoryId,
      reportNm,
    });
  }
  return out;
}

export function buildSuggestionsFromCases(cases, extractTokens, topN = DEFAULT_TOP_N) {
  const byLabelToken = new Map();
  let unknownToLabel = 0;
  let mismatchToLabel = 0;

  const safeCases = normalizeCases(cases);
  for (const row of safeCases) {
    const label = row.label;
    const predicted = row.predictedCategoryId;
    const isUnknown = predicted === "other";
    if (isUnknown) unknownToLabel += 1;
    else mismatchToLabel += 1;

    const labelBucket = byLabelToken.get(label) ?? new Map();
    const tokens = filterTokens(extractTokens(row.reportNm));
    for (const token of tokens) {
      const existing = labelBucket.get(token) ?? {
        token,
        count: 0,
        unknownCount: 0,
        mismatchCount: 0,
        examples: [],
      };
      existing.count += 1;
      if (isUnknown) existing.unknownCount += 1;
      else existing.mismatchCount += 1;
      if (existing.examples.length < EXAMPLE_LIMIT && !existing.examples.includes(row.reportNm)) {
        existing.examples.push(row.reportNm);
      }
      labelBucket.set(token, existing);
    }
    byLabelToken.set(label, labelBucket);
  }

  const byLabel = {};
  const labels = [...byLabelToken.keys()].sort((a, b) => a.localeCompare(b));
  for (const label of labels) {
    const rows = [...(byLabelToken.get(label)?.values() ?? [])]
      .sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count;
        if (a.unknownCount !== b.unknownCount) return b.unknownCount - a.unknownCount;
        if (a.mismatchCount !== b.mismatchCount) return b.mismatchCount - a.mismatchCount;
        return a.token.localeCompare(b.token);
      })
      .slice(0, topN)
      .map((row) => ({
        token: row.token,
        count: row.count,
        unknownCount: row.unknownCount,
        mismatchCount: row.mismatchCount,
        examples: row.examples,
      }));
    byLabel[label] = rows;
  }

  return {
    summary: {
      totalCases: safeCases.length,
      unknownToLabel,
      mismatchToLabel,
      labels: labels.length,
    },
    byLabel,
  };
}

function buildCasesFromLabeledRows(rows, { rules, normalizeTitle, classify }) {
  const out = [];
  for (const row of rows) {
    const label = asString(row.label);
    const reportNm = asString(row.reportNm);
    if (!label || !reportNm) continue;
    const normalized = normalizeTitle(reportNm, rules);
    const classified = classify({ reportName: asString(normalized.normalized) || reportNm }, rules);
    const predictedCategoryId = asString(classified?.categoryId);
    if (!predictedCategoryId || predictedCategoryId === label) continue;
    out.push({
      label,
      predictedCategoryId,
      reportNm,
    });
  }
  return out;
}

export function buildSuggestionsMarkdown(payload) {
  const lines = [];
  lines.push("# DART 룰 패턴 추천 리포트");
  lines.push("");
  lines.push(`- 생성시각: ${payload.generatedAt}`);
  lines.push(`- sourceEval: ${payload.source.evalPath}`);
  lines.push(`- reEvaluated: ${payload.source.reEvaluated ? "yes" : "no"}`);
  lines.push(`- caseCount: ${payload.summary.totalCases}`);
  lines.push(`- unknown->label: ${payload.summary.unknownToLabel}`);
  lines.push(`- predicted!=label: ${payload.summary.mismatchToLabel}`);
  lines.push("");

  const labels = Object.keys(payload.byLabel ?? {}).sort((a, b) => a.localeCompare(b));
  if (labels.length < 1) {
    lines.push("## 제안 없음");
    lines.push("");
    lines.push("- 오분류/unknown 케이스가 없습니다.");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  lines.push("## Label별 토큰 추천");
  lines.push("");
  for (const label of labels) {
    lines.push(`### ${label}`);
    const rows = Array.isArray(payload.byLabel[label]) ? payload.byLabel[label] : [];
    if (rows.length < 1) {
      lines.push("- 없음");
      lines.push("");
      continue;
    }
    for (const row of rows) {
      lines.push(`- ${row.token} | count=${row.count} (unknown=${row.unknownCount}, mismatch=${row.mismatchCount})`);
      if (Array.isArray(row.examples) && row.examples.length > 0) {
        lines.push(`  - 예: ${row.examples.join(" / ")}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

async function loadClassifierHelpers() {
  const classifierMod = await tsImport("../src/lib/dart/disclosureClassifier.ts", { parentURL: import.meta.url });
  const normalizeMod = await tsImport("../src/lib/dart/disclosureNormalize.ts", { parentURL: import.meta.url });
  const classifierSource = classifierMod?.default ?? classifierMod;
  const normalizeSource = normalizeMod?.default ?? normalizeMod;
  const loadRules = classifierSource?.loadRules;
  const classify = classifierSource?.classify;
  const normalizeTitle = normalizeSource?.normalizeTitle;
  const tokenizeTitle = normalizeSource?.tokenizeTitle;
  if (typeof loadRules !== "function" || typeof classify !== "function") {
    throw new Error("classifier helpers are not available");
  }
  if (typeof normalizeTitle !== "function" || typeof tokenizeTitle !== "function") {
    throw new Error("normalize/tokenize helpers are not available");
  }
  return { loadRules, classify, normalizeTitle, tokenizeTitle };
}

function parseArgs(argv) {
  const out = {
    topN: DEFAULT_TOP_N,
  };
  for (const arg of argv) {
    if (!arg.startsWith("--topN=")) continue;
    const parsed = Number(arg.split("=")[1]);
    if (Number.isFinite(parsed) && parsed > 0) out.topN = Math.min(100, Math.round(parsed));
  }
  return out;
}

export async function runSuggestPatches(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const topN = Number.isFinite(input.topN) ? Math.max(1, Math.min(100, Math.round(input.topN))) : DEFAULT_TOP_N;
  const evalPath = resolvePath(cwd, asString(input.evalPath) || LABELED_EVAL_RELATIVE_PATH);
  const labelsPath = resolvePath(cwd, asString(input.labelsPath) || LABELS_RELATIVE_PATH);
  const rulesPath = resolvePath(cwd, asString(input.rulesPath) || RULES_RELATIVE_PATH);
  const outputJsonPath = resolvePath(cwd, asString(input.outputJsonPath) || OUTPUT_JSON_RELATIVE_PATH);
  const outputMdPath = resolvePath(cwd, asString(input.outputMdPath) || OUTPUT_MD_RELATIVE_PATH);
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();

  const { loadRules, classify, normalizeTitle, tokenizeTitle } = await loadClassifierHelpers();
  const rules = loadRules(rulesPath);
  const extractTokens = createTokenExtractor({ rules, normalizeTitle, tokenizeTitle });

  let reEvaluated = false;
  if (!fs.existsSync(evalPath)) {
    if (!fs.existsSync(labelsPath)) {
      console.log(`[dart:rules:suggest] skipped: missing ${path.relative(cwd, labelsPath)}`);
      return { ok: true, skipped: true };
    }
    await runLabeledEval({
      cwd,
      labelsPath,
      rulesPath,
      outputJsonPath: evalPath,
      outputMdPath: resolvePath(cwd, path.join("docs", "dart-rules-labeled-report.md")),
    });
    reEvaluated = true;
  }

  let cases = [];
  if (fs.existsSync(evalPath)) {
    const evalRaw = readJson(evalPath);
    const fromEval = normalizeCases(evalRaw?.misclassified ?? evalRaw?.misclassifiedTop ?? []);
    if (fromEval.length > 0) {
      cases = fromEval;
    }
  }

  if (cases.length < 1 && fs.existsSync(labelsPath)) {
    const rows = parseLabeledCsv(fs.readFileSync(labelsPath, "utf-8"));
    cases = buildCasesFromLabeledRows(rows, { rules, normalizeTitle, classify });
    reEvaluated = true;
  }

  const built = buildSuggestionsFromCases(cases, extractTokens, topN);
  const payload = {
    version: 1,
    generatedAt,
    source: {
      evalPath: path.relative(cwd, evalPath),
      labelsPath: path.relative(cwd, labelsPath),
      rulesPath: path.relative(cwd, rulesPath),
      reEvaluated,
    },
    ...built,
  };

  const markdown = buildSuggestionsMarkdown(payload);
  ensureDir(outputJsonPath);
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  ensureDir(outputMdPath);
  fs.writeFileSync(outputMdPath, markdown, "utf-8");

  console.log(`[dart:rules:suggest] cases=${payload.summary.totalCases} labels=${payload.summary.labels}`);
  console.log(`[dart:rules:suggest] output=${path.relative(cwd, outputJsonPath)}`);
  console.log(`[dart:rules:suggest] report=${path.relative(cwd, outputMdPath)}`);
  return {
    ok: true,
    skipped: false,
    payload,
  };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  runSuggestPatches(args).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:suggest] failed: ${message}`);
    process.exit(1);
  });
}
