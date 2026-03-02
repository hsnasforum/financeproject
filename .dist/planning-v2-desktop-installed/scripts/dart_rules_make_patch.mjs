import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const SUGGESTIONS_RELATIVE_PATH = path.join("tmp", "dart", "rules_suggestions.json");
const OUTPUT_PATCH_RELATIVE_PATH = path.join("tmp", "dart", "rules_patch.json");
const DEFAULT_TOP_N = 5;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value) {
  return asString(value).toLocaleLowerCase();
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolvePath(cwd, filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJsonAtomic(filePath, value) {
  ensureDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function normalizeTopN(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TOP_N;
  return Math.max(1, Math.min(20, Math.round(parsed)));
}

function getCategoryIdSet(rules) {
  const out = new Set();
  const categories = Array.isArray(rules?.categories) ? rules.categories : [];
  for (const row of categories) {
    const id = asString(row?.id);
    if (!id) continue;
    out.add(normalizeKey(id));
  }
  return out;
}

function getCategoryPatternMap(rules) {
  const map = new Map();
  const categories = Array.isArray(rules?.categories) ? rules.categories : [];
  for (const row of categories) {
    const categoryId = asString(row?.id);
    if (!categoryId) continue;
    const bucket = new Set();
    const patterns = Array.isArray(row?.patterns) ? row.patterns : [];
    for (const pattern of patterns) {
      const key = normalizeKey(pattern);
      if (!key) continue;
      bucket.add(key);
    }
    map.set(normalizeKey(categoryId), bucket);
  }
  return map;
}

function pickToken(row) {
  if (typeof row === "string") return asString(row);
  if (!isRecord(row)) return "";
  return asString(row.token ?? row.pattern);
}

function normalizeSuggestionRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const token = pickToken(row);
    if (!token) continue;
    out.push(token);
  }
  return out;
}

export function buildPatchFromSuggestions(input) {
  const suggestions = input?.suggestions;
  const rules = input?.rules;
  const topN = normalizeTopN(input?.topN);
  const createdAt = asString(input?.createdAt) || new Date().toISOString();

  if (!isRecord(suggestions)) {
    throw new Error("invalid suggestions payload");
  }
  if (!isRecord(rules)) {
    throw new Error("invalid rules payload");
  }

  const byLabel = isRecord(suggestions?.byLabel) ? suggestions.byLabel : {};
  const categoryIds = getCategoryIdSet(rules);
  const categoryPatterns = getCategoryPatternMap(rules);
  const changes = [];

  for (const [rawCategoryId, rows] of Object.entries(byLabel).sort((a, b) => a[0].localeCompare(b[0]))) {
    const categoryId = asString(rawCategoryId);
    if (!categoryId) continue;
    const categoryKey = normalizeKey(categoryId);
    if (!categoryIds.has(categoryKey)) continue;

    const existing = new Set(categoryPatterns.get(categoryKey) ?? []);
    const picked = [];
    const seenNew = new Set();
    for (const token of normalizeSuggestionRows(rows)) {
      if (picked.length >= topN) break;
      const key = normalizeKey(token);
      if (!key) continue;
      if (existing.has(key) || seenNew.has(key)) continue;
      seenNew.add(key);
      picked.push(token);
    }

    if (picked.length > 0) {
      changes.push({
        categoryId,
        addPatterns: picked,
      });
    }
  }

  return {
    version: 1,
    createdAt,
    changes,
  };
}

function parseArgs(argv) {
  const out = { topN: DEFAULT_TOP_N };
  for (const arg of argv) {
    if (arg.startsWith("--topN=")) out.topN = normalizeTopN(arg.split("=")[1]);
    if (arg.startsWith("--suggestions=")) out.suggestionsPath = asString(arg.split("=")[1]);
    if (arg.startsWith("--rules=")) out.rulesPath = asString(arg.split("=")[1]);
    if (arg.startsWith("--output=")) out.outputPath = asString(arg.split("=")[1]);
  }
  return out;
}

export function runMakePatch(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const suggestionsPath = resolvePath(cwd, asString(input.suggestionsPath) || SUGGESTIONS_RELATIVE_PATH);
  const rulesPath = resolvePath(cwd, asString(input.rulesPath) || RULES_RELATIVE_PATH);
  const outputPath = resolvePath(cwd, asString(input.outputPath) || OUTPUT_PATCH_RELATIVE_PATH);
  const topN = normalizeTopN(input.topN);

  if (!fs.existsSync(suggestionsPath)) {
    throw new Error(`missing suggestions file: ${path.relative(cwd, suggestionsPath)}`);
  }
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`missing rules file: ${path.relative(cwd, rulesPath)}`);
  }

  const suggestions = readJson(suggestionsPath);
  const rules = readJson(rulesPath);
  const patch = buildPatchFromSuggestions({
    suggestions,
    rules,
    topN,
  });

  writeJsonAtomic(outputPath, patch);

  console.log(`[dart:rules:patch:make] changes=${patch.changes.length}`);
  console.log(`[dart:rules:patch:make] output=${path.relative(cwd, outputPath)}`);

  return {
    ok: true,
    patch,
    outputPath,
  };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  try {
    runMakePatch(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:patch:make] failed: ${message}`);
    process.exit(1);
  }
}
