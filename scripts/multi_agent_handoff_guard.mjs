#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const trackedOnlyPaths = [
  ".codex/config.toml",
  ".codex/rules/default.rules",
  ".codex/skills/dart-data-source-hardening/SKILL.md",
  ".codex/skills/planning-gate-selector/SKILL.md",
  ".codex/skills/route-ssot-check/SKILL.md",
  ".codex/skills/work-log-closeout/SKILL.md",
  ".codex/agents/analyzer.toml",
  ".codex/agents/developer.toml",
  ".codex/agents/documenter.toml",
  ".codex/agents/manager.toml",
  ".codex/agents/planner.toml",
  ".codex/agents/researcher.toml",
  ".codex/agents/reviewer.toml",
  ".codex/agents/tester.toml",
  "scripts/prompts/multi-agent/common.md",
  "scripts/prompts/multi-agent/documenter.md",
  "scripts/prompts/multi-agent/implementer.md",
  "scripts/prompts/multi-agent/lead.md",
  "scripts/prompts/multi-agent/planner.md",
  "scripts/prompts/multi-agent/researcher.md",
  "scripts/prompts/multi-agent/reviewer.md",
  "scripts/prompts/multi-agent/validator.md",
];

const coverageChecks = [
  {
    path: ".codex/agents/analyzer.toml",
    patterns: [/\/work/, /사용(?:한)? skill/, /실행한 확인/, /미실행 검증 후보/],
  },
  {
    path: ".codex/agents/manager.toml",
    patterns: [/\/work/, /사용(?:한)? skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: ".codex/agents/developer.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: ".codex/agents/documenter.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: ".codex/agents/planner.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: ".codex/agents/researcher.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 확인/, /미실행 내부 검증/],
  },
  {
    path: ".codex/agents/reviewer.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 (검증|확인)/, /미실행 검증/],
  },
  {
    path: ".codex/agents/tester.toml",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/common.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/lead.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/implementer.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/documenter.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/planner.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/researcher.md",
    patterns: [/\/work/, /사용 skill/, /실행한 확인/, /미실행 내부 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/reviewer.md",
    patterns: [/\/work/, /사용 skill/, /실행한 (검증|확인)/, /미실행 검증/],
  },
  {
    path: "scripts/prompts/multi-agent/validator.md",
    patterns: [/\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/],
  },
];

function ensureTracked(filePath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

const issues = [];

for (const filePath of trackedOnlyPaths) {
  if (!fs.existsSync(filePath)) {
    issues.push(`missing file: ${filePath}`);
    continue;
  }
  if (!ensureTracked(filePath)) {
    issues.push(`untracked file: ${filePath}`);
  }
}

for (const check of coverageChecks) {
  if (!fs.existsSync(check.path)) continue;
  const text = fs.readFileSync(check.path, "utf8");
  for (const pattern of check.patterns) {
    if (!pattern.test(text)) {
      issues.push(`missing handoff coverage ${String(pattern)} -> ${check.path}`);
    }
  }
}

if (issues.length > 0) {
  console.error(`[multi-agent:guard] FAIL issues=${issues.length}`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `[multi-agent:guard] PASS tracked=${trackedOnlyPaths.length} coverage=${coverageChecks.length}`,
);
