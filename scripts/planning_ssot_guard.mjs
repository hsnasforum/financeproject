#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const ROUNDING_BASELINE_EXCLUDES = [
  "!src/lib/planning/calc/**",
  "!src/lib/planning/assumptions/mapSnapshotToAssumptionsV2.ts",
  "!src/lib/planning/assumptions/overrides.ts",
  "!src/lib/planning/candidates/buildCandidatesEvidence.ts",
  "!src/lib/planning/catalog/copyTemplates.ts",
  "!src/lib/planning/engine/stageDecision.ts",
  "!src/lib/planning/i18n/format.ts",
  "!src/lib/planning/normalizeRates.ts",
  "!src/lib/planning/ops/shouldSyncSnapshot.ts",
  "!src/lib/planning/reports/standaloneHtmlReport.ts",
  "!src/lib/planning/retention/cleanup.ts",
  "!src/lib/planning/share/mask.ts",
  "!src/lib/planning/store/runActionStore.ts",
  "!src/lib/planning/store/trash.ts",
];

function runRg(label, args) {
  const result = spawnSync("rg", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`rg 실행 실패 (${label}): ${result.error.message}`);
  }

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (result.status === 0 && stdout) {
    return {
      label,
      matched: true,
      output: stdout,
      stderr,
    };
  }
  if (result.status === 1) {
    return {
      label,
      matched: false,
      output: "",
      stderr,
    };
  }
  throw new Error(`rg 실패 (${label}) exit=${result.status}\n${stderr}`);
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
      args: [
        "-n",
        "core/v2/debt/calc",
        "src",
        "--glob",
        "!src/lib/planning/calc/**",
        "--glob",
        "!src/lib/planning/v2/debt/coreCalc.ts",
      ],
    },
    {
      title: "lib/finlife/calculators 직접 import 금지 (calc 외부)",
      args: [
        "-n",
        "lib/finlife/calculators",
        "src",
        "--glob",
        "!src/lib/planning/calc/**",
      ],
    },
    {
      title: "src/lib/planning/** 에서 Math.round/Math.floor 직접 사용 금지 (baseline 예외 외부)",
      args: [
        "-n",
        "Math\\.(round|floor)\\(",
        "src/lib/planning",
        ...ROUNDING_BASELINE_EXCLUDES.flatMap((glob) => ["--glob", glob]),
      ],
    },
  ];

  const violations = [];

  for (const check of checks) {
    const result = runRg(check.title, check.args);
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
