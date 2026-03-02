#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const WARNING_MESSAGE_ALLOWED = new Set([
  "src/lib/planning/catalog/copyTemplates.ts",
  // Legacy fallbacks kept for compatibility; new additions are blocked.
  "src/components/PlanningReportsClient.tsx",
  "src/components/PlanningWorkspaceClient.tsx",
  "src/lib/planning/v2/resultDto.ts",
  "src/lib/planning/v2/report/aggregateWarnings.ts",
  "src/lib/planning/v2/resultGuide.ts",
  "src/lib/planning/core/v2/report.ts",
]);

const WARNING_SOURCE_ALLOWED_PREFIXES = [
  "src/lib/planning/catalog/",
  "src/lib/planning/core/v2/",
  "src/lib/planning/v2/insights/",
  "src/lib/planning/v2/warningsCatalog.ko.ts",
  "src/lib/planning/server/v2/warningsCatalog.ko.ts",
];

const CALC_SSOT_ALLOWED_PREFIXES = [
  "src/lib/planning/calc/",
];

const WARNING_STRING_PATTERNS = [
  /경고가 감지되었습니다\./g,
  /알 수 없는 경고\(/g,
];

const CALC_DUPLICATION_PATTERNS = [
  /monthlyIncomeKrw\s*-\s*monthlyExpensesKrw\s*-\s*monthlyDebtPaymentKrw/g,
  /monthlyDebtPaymentKrw\s*\/\s*monthlyIncomeKrw/g,
  /emergencyFundKrw\s*\/\s*monthlyExpensesKrw/g,
  /grossInterestKrw\s*=\s*principalKrw\s*\*/g,
];

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function lineFromIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function isCodeFile(filePath) {
  return EXTENSIONS.has(path.extname(filePath));
}

async function walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(absolute));
      continue;
    }
    if (entry.isFile() && isCodeFile(absolute)) out.push(absolute);
  }
  return out;
}

function isAllowedByPrefix(filePath, prefixes) {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

function collectRegexHits(content, pattern) {
  const hits = [];
  for (const match of content.matchAll(pattern)) {
    hits.push({ index: match.index ?? 0, text: match[0] });
  }
  return hits;
}

async function main() {
  const files = await walk(SRC_DIR);
  const issues = [];

  for (const absPath of files) {
    const filePath = rel(absPath);
    const content = await fs.readFile(absPath, "utf8");

    const importsWarningSource = content.includes("warningGlossary.ko")
      || content.includes("warningsCatalog.ko")
      || content.includes("WARNING_GLOSSARY_KO")
      || content.includes("REASON_CODE_MESSAGES_KO");
    if (importsWarningSource && !isAllowedByPrefix(filePath, WARNING_SOURCE_ALLOWED_PREFIXES)) {
      issues.push({
        code: "WARNING_SOURCE_OUTSIDE_CATALOG",
        filePath,
        line: 1,
        message: "warning source direct usage is restricted to catalog/core modules",
      });
    }

    if (!WARNING_MESSAGE_ALLOWED.has(filePath)) {
      for (const pattern of WARNING_STRING_PATTERNS) {
        for (const hit of collectRegexHits(content, pattern)) {
          issues.push({
            code: "HARDCODED_WARNING_COPY",
            filePath,
            line: lineFromIndex(content, hit.index),
            message: `hardcoded warning string detected (${hit.text})`,
          });
        }
      }
    }

    if (!isAllowedByPrefix(filePath, CALC_SSOT_ALLOWED_PREFIXES)) {
      for (const pattern of CALC_DUPLICATION_PATTERNS) {
        for (const hit of collectRegexHits(content, pattern)) {
          issues.push({
            code: "CALC_DUPLICATION_OUTSIDE_SSOT",
            filePath,
            line: lineFromIndex(content, hit.index),
            message: `calc formula pattern duplicated outside src/lib/planning/calc (${hit.text})`,
          });
        }
      }
    }
  }

  if (issues.length < 1) {
    console.log("[planning:v2:ssot:guard] PASS");
    return;
  }

  console.error(`[planning:v2:ssot:guard] FAIL issues=${issues.length}`);
  for (const issue of issues.slice(0, 200)) {
    console.error(`- [${issue.code}] ${issue.filePath}:${issue.line} ${issue.message}`);
  }
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[planning:v2:ssot:guard] FAIL\n${message}`);
  process.exit(1);
});
