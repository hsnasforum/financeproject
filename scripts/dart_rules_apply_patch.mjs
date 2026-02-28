import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RULES_RELATIVE_PATH = path.join("config", "dart-disclosure-rules.json");
const PATCH_RELATIVE_PATH = path.join("tmp", "dart", "rules_patch.json");
const DIFF_RELATIVE_PATH = path.join("docs", "dart-rules-patch-diff.md");

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

function writeTextAtomic(filePath, text) {
  ensureDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, text, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniquePatterns(values) {
  const out = [];
  const seen = new Set();
  const rows = Array.isArray(values) ? values : [];
  for (const row of rows) {
    const pattern = asString(row);
    if (!pattern) continue;
    const key = normalizeKey(pattern);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(pattern);
  }
  return out;
}

function toUtcTimestamp(date) {
  const value = date instanceof Date ? date : new Date();
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  const millis = String(value.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${millis}`;
}

export function createBackupPath(cwd = process.cwd(), now = new Date()) {
  const timestamp = toUtcTimestamp(now);
  return path.join(cwd, "tmp", "dart", `rules_before_patch_${timestamp}.json`);
}

function normalizePatch(rawPatch) {
  if (!isRecord(rawPatch)) throw new Error("invalid patch payload");
  const changes = Array.isArray(rawPatch.changes) ? rawPatch.changes : [];
  const normalized = [];
  for (const row of changes) {
    if (!isRecord(row)) continue;
    const categoryId = asString(row.categoryId);
    if (!categoryId) continue;
    const addPatterns = uniquePatterns(row.addPatterns);
    if (addPatterns.length < 1) continue;
    normalized.push({ categoryId, addPatterns });
  }
  return {
    version: rawPatch.version ?? 1,
    createdAt: asString(rawPatch.createdAt) || new Date().toISOString(),
    changes: normalized,
  };
}

export function applyPatchToRules(rules, rawPatch) {
  if (!isRecord(rules)) throw new Error("invalid rules payload");
  const patch = normalizePatch(rawPatch);
  const categories = Array.isArray(rules.categories) ? rules.categories : null;
  if (!categories) throw new Error("rules.categories is missing");

  const nextRules = JSON.parse(JSON.stringify(rules));
  const nextCategories = Array.isArray(nextRules.categories) ? nextRules.categories : [];
  const categoryMap = new Map();
  for (const category of nextCategories) {
    const id = asString(category?.id);
    if (!id) continue;
    categoryMap.set(normalizeKey(id), category);
  }

  const summaryChanges = [];
  let totalAdded = 0;
  for (const change of patch.changes) {
    const categoryId = asString(change.categoryId);
    const category = categoryMap.get(normalizeKey(categoryId));
    if (!category) {
      throw new Error(`patch category not found in rules: ${categoryId}`);
    }

    const currentPatterns = uniquePatterns(category.patterns);
    const existing = new Set(currentPatterns.map((row) => normalizeKey(row)));
    const added = [];
    for (const pattern of uniquePatterns(change.addPatterns)) {
      const key = normalizeKey(pattern);
      if (!key || existing.has(key)) continue;
      existing.add(key);
      currentPatterns.push(pattern);
      added.push(pattern);
    }

    category.patterns = currentPatterns;
    totalAdded += added.length;
    summaryChanges.push({
      categoryId,
      beforeCount: currentPatterns.length - added.length,
      afterCount: currentPatterns.length,
      addPatterns: added,
      addedCount: added.length,
    });
  }

  return {
    nextRules,
    patch,
    summary: {
      categoryChanges: summaryChanges,
      totalAdded,
    },
  };
}

export function buildPatchDiffMarkdown(input = {}) {
  const generatedAt = asString(input.generatedAt) || new Date().toISOString();
  const rulesPath = asString(input.rulesPath) || RULES_RELATIVE_PATH;
  const patchPath = asString(input.patchPath) || PATCH_RELATIVE_PATH;
  const summary = isRecord(input.summary) ? input.summary : {};
  const totalAdded = Number.isFinite(summary.totalAdded) ? summary.totalAdded : 0;
  const categoryChanges = Array.isArray(summary.categoryChanges) ? summary.categoryChanges : [];

  const lines = [];
  lines.push("# DART Rules Patch Diff (Dry Run)");
  lines.push("");
  lines.push(`- generatedAt: ${generatedAt}`);
  lines.push(`- rulesPath: ${rulesPath}`);
  lines.push(`- patchPath: ${patchPath}`);
  lines.push(`- totalAdded: ${totalAdded}`);
  lines.push("");

  if (categoryChanges.length < 1) {
    lines.push("## Changes");
    lines.push("");
    lines.push("- no changes");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  for (const row of categoryChanges) {
    const categoryId = asString(row?.categoryId) || "unknown";
    const beforeCount = Number.isFinite(row?.beforeCount) ? row.beforeCount : 0;
    const afterCount = Number.isFinite(row?.afterCount) ? row.afterCount : beforeCount;
    const addPatterns = Array.isArray(row?.addPatterns) ? row.addPatterns : [];
    lines.push(`## ${categoryId}`);
    lines.push("");
    lines.push(`- patterns: ${beforeCount} -> ${afterCount}`);
    if (addPatterns.length < 1) {
      lines.push("- add: none");
    } else {
      for (const pattern of addPatterns) {
        lines.push(`- + ${pattern}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function runGate(cwd) {
  const commands = [
    ["dart:rules:eval:all"],
    ["dart:rules:gate"],
  ];
  for (const args of commands) {
    const result = spawnSync("pnpm", args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      const code = Number.isFinite(result.status) ? result.status : 1;
      throw new Error(`gate command failed: pnpm ${args.join(" ")} (exit ${code})`);
    }
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    runGate: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    if (arg === "--run-gate") out.runGate = true;
    if (arg.startsWith("--rules=")) out.rulesPath = asString(arg.split("=")[1]);
    if (arg.startsWith("--patch=")) out.patchPath = asString(arg.split("=")[1]);
    if (arg.startsWith("--diff=")) out.diffPath = asString(arg.split("=")[1]);
  }
  return out;
}

export function runApplyPatch(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const dryRun = Boolean(input.dryRun);
  const runGateAfterApply = Boolean(input.runGate);

  const rulesPath = resolvePath(cwd, asString(input.rulesPath) || RULES_RELATIVE_PATH);
  const patchPath = resolvePath(cwd, asString(input.patchPath) || PATCH_RELATIVE_PATH);
  const diffPath = resolvePath(cwd, asString(input.diffPath) || DIFF_RELATIVE_PATH);

  if (!fs.existsSync(rulesPath)) {
    throw new Error(`missing rules file: ${path.relative(cwd, rulesPath)}`);
  }
  if (!fs.existsSync(patchPath)) {
    throw new Error(`missing patch file: ${path.relative(cwd, patchPath)}`);
  }

  const rawRulesText = fs.readFileSync(rulesPath, "utf-8");
  const rules = JSON.parse(rawRulesText);
  const patch = readJson(patchPath);
  const applied = applyPatchToRules(rules, patch);

  const diffMarkdown = buildPatchDiffMarkdown({
    generatedAt: new Date().toISOString(),
    rulesPath: path.relative(cwd, rulesPath),
    patchPath: path.relative(cwd, patchPath),
    summary: applied.summary,
  });
  writeTextAtomic(diffPath, diffMarkdown);

  if (dryRun) {
    console.log(`[dart:rules:patch:dry] totalAdded=${applied.summary.totalAdded}`);
    console.log(`[dart:rules:patch:dry] diff=${path.relative(cwd, diffPath)}`);
    return {
      ok: true,
      dryRun: true,
      diffPath,
      summary: applied.summary,
    };
  }

  const backupPath = createBackupPath(cwd, new Date());
  writeTextAtomic(backupPath, rawRulesText.endsWith("\n") ? rawRulesText : `${rawRulesText}\n`);
  writeJsonAtomic(rulesPath, applied.nextRules);

  if (runGateAfterApply) {
    runGate(cwd);
  }

  console.log(`[dart:rules:patch:apply] totalAdded=${applied.summary.totalAdded}`);
  console.log(`[dart:rules:patch:apply] backup=${path.relative(cwd, backupPath)}`);
  console.log(`[dart:rules:patch:apply] rules=${path.relative(cwd, rulesPath)}`);
  if (runGateAfterApply) {
    console.log("[dart:rules:patch:apply] gate=completed");
  }

  return {
    ok: true,
    dryRun: false,
    backupPath,
    rulesPath,
    diffPath,
    summary: applied.summary,
  };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  try {
    runApplyPatch(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[dart:rules:patch:apply] failed: ${message}`);
    process.exit(1);
  }
}
