#!/usr/bin/env node
import fs from "node:fs";

const ROUNDING_BASELINE_EXCLUDES = [
  "src/lib/planning/calc/**",
  // Existing UI/report rounding moved from src/app without changing calculation behavior.
  "src/lib/planning/reports/recommendationSignals.ts",
  "src/lib/planning/reports/reportViewModel.ts",
  "src/lib/planning/ui/planningOnboardingWizard.ts",
  "src/lib/planning/ui/profileFormModel.ts",
];

const GLOB_META = /[*?[\]{}!]/;

// Only "dir/**" and exact paths are supported so a mistyped exception fails loudly instead of widening.
function toExcludeMatcher(glob) {
  if (glob.endsWith("/**") && !GLOB_META.test(glob.slice(0, -3))) {
    const prefix = glob.slice(0, -2);
    return (filePath) => filePath.startsWith(prefix);
  }
  if (!GLOB_META.test(glob)) {
    return (filePath) => filePath === glob;
  }
  throw new Error(`지원하지 않는 제외 glob: ${glob}`);
}

// Same traversal as rg's defaults (hidden entries and symlinks skipped, NUL-containing files treated
// as binary) without needing an rg binary. .gitignore is not consulted, so ignored files are scanned too.
function collectFiles(root, isExcluded) {
  const files = [];
  const visit = (dir) => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const filePath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (entry.isFile() && !isExcluded(filePath)) {
        files.push(filePath);
      }
    }
  };
  visit(root);
  return files;
}

function scanFile(filePath, pattern) {
  const content = fs.readFileSync(filePath);
  if (content.includes(0)) return [];
  const matches = [];
  content
    .toString("utf8")
    .split("\n")
    .forEach((rawLine, index) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (pattern.test(line)) matches.push(`${filePath}:${index + 1}:${line}`);
    });
  return matches;
}

function runScan(label, { pattern, root, excludes }) {
  let matches;
  try {
    const matchers = excludes.map(toExcludeMatcher);
    const isExcluded = (filePath) => matchers.some((matcher) => matcher(filePath));
    matches = collectFiles(root, isExcluded).flatMap((filePath) => scanFile(filePath, pattern));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`스캔 실패 (${label}): ${message}`);
  }

  return {
    label,
    matched: matches.length > 0,
    output: matches.join("\n"),
  };
}

function printViolation(title, details) {
  console.error(`\n[planning:ssot:check] ${title}`);
  console.error(details);
}

function truncateOutput(text, maxLines = 120) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const hidden = lines.length - maxLines;
  return `${lines.slice(0, maxLines).join("\n")}\n... (${hidden} more lines omitted)`;
}

async function main() {
  const checks = [
    {
      title: "core/v2/debt/calc 직접 import 금지 (calc 외부)",
      pattern: /core\/v2\/debt\/calc/,
      root: "src",
      excludes: ["src/lib/planning/calc/**", "src/lib/planning/v2/debt/coreCalc.ts"],
    },
    {
      title: "lib/finlife/calculators 직접 import 금지 (calc 외부)",
      pattern: /lib\/finlife\/calculators/,
      root: "src",
      excludes: ["src/lib/planning/calc/**"],
    },
    {
      title: "src/lib/planning/** 에서 Math.round/Math.floor 직접 사용 금지 (baseline 예외 외부)",
      pattern: /Math\.(round|floor)\(/,
      root: "src/lib/planning",
      excludes: ROUNDING_BASELINE_EXCLUDES,
    },
  ];

  const violations = [];

  for (const check of checks) {
    const result = runScan(check.title, check);
    if (result.matched) {
      violations.push({
        title: check.title,
        output: result.output,
      });
    }
  }

  if (violations.length === 0) {
    console.log("[planning:ssot:check] PASS");
    return;
  }

  console.error(`[planning:ssot:check] FAIL violations=${violations.length}`);
  for (const violation of violations) {
    printViolation(violation.title, truncateOutput(violation.output));
  }
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[planning:ssot:check] FAIL\n${message}`);
  process.exit(1);
});
