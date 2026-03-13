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
  "work/README.md",
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

const WORK_DIR = "work";
const WORK_ROOT_README = `${WORK_DIR}/README.md`;
const WORK_NOTE_PATH_RE = /^work\/(\d{1,2})\/(\d{1,2})\/(\d{4})-(\d{2})-(\d{2})-[^/]+\.md$/;
const latestWorkNoteChecks = [
  { label: "title", patterns: [/^# \d{4}-\d{2}-\d{2}(?:\s|$)/m] },
  { label: "changed files", patterns: [/^## (변경 파일|수정 대상 파일)(?:\s|$)/m] },
  { label: "skill usage", patterns: [/^## 사용 skill(?:\s|$)/m] },
  { label: "verification", patterns: [/^## (검증|실행한 검증)(?:\s|$)/m] },
  { label: "residual risk", patterns: [/^## 남은 리스크(?:\s|$)/m] },
  { label: "next round", patterns: [/^## 다음 라운드(?: 우선순위| 메모)?(?:\s|$)/m, /^## 다음 작업(?:\s|$)/m] },
];

function ensureTracked(filePath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  return result.status === 0;
}

function collectLegacyFlatWorkNotes() {
  if (!fs.existsSync(WORK_DIR)) return [];
  return fs.readdirSync(WORK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `${WORK_DIR}/${entry.name}`)
    .filter((filePath) => filePath !== WORK_ROOT_README)
    .filter((filePath) => /^work\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(filePath));
}

function collectWorkNotes(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const notes = [];
  for (const entry of entries) {
    const nextPath = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (nextPath === `${WORK_DIR}/local`) continue;
      notes.push(...collectWorkNotes(nextPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!nextPath.endsWith(".md")) continue;
    if (nextPath === WORK_ROOT_README) continue;
    notes.push(nextPath);
  }
  return notes;
}

function collectTrackedWorkNotes() {
  return collectWorkNotes(WORK_DIR).filter((filePath) => ensureTracked(filePath));
}

function getLatestWorkNote({ trackedOnly = false } = {}) {
  const notes = trackedOnly ? collectTrackedWorkNotes() : collectWorkNotes(WORK_DIR);
  if (notes.length < 1) return null;
  return notes
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath))[0]?.filePath ?? null;
}

function validateLatestWorkNote(filePath) {
  const issues = [];
  const pathMatch = WORK_NOTE_PATH_RE.exec(filePath);
  if (!pathMatch) {
    issues.push(`latest /work note path must follow work/<month>/<day>/YYYY-MM-DD-<slug>.md: ${filePath}`);
    return issues;
  }

  const [, monthDir, dayDir, year, monthFile, dayFile] = pathMatch;
  if (Number(monthDir) !== Number(monthFile) || Number(dayDir) !== Number(dayFile)) {
    issues.push(`latest /work note folder/date mismatch: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const check of latestWorkNoteChecks) {
    if (!check.patterns.some((pattern) => pattern.test(text))) {
      issues.push(`latest /work note missing ${check.label}: ${filePath}`);
    }
  }

  if (!new RegExp(`^# ${year}-${monthFile}-${dayFile}(?:\\s|$)`, "m").test(text)) {
    issues.push(`latest /work note title/date mismatch: ${filePath}`);
  }

  return issues;
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

for (const filePath of collectLegacyFlatWorkNotes()) {
  issues.push(`legacy flat /work note must be moved under month/day folders: ${filePath}`);
}

const latestWorkNote = getLatestWorkNote();
if (latestWorkNote) {
  issues.push(...validateLatestWorkNote(latestWorkNote));
}
const latestTrackedWorkNote = getLatestWorkNote({ trackedOnly: true });
const latestWorkNoteTracking = latestWorkNote
  ? (ensureTracked(latestWorkNote) ? "tracked" : "untracked")
  : "none";

if (issues.length > 0) {
  console.error(`[multi-agent:guard] FAIL issues=${issues.length}`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  `[multi-agent:guard] PASS tracked=${trackedOnlyPaths.length} coverage=${coverageChecks.length} latestWorkNote=${latestWorkNote ?? "none"} latestWorkNoteTracking=${latestWorkNoteTracking} latestTrackedWorkNote=${latestTrackedWorkNote ?? "none"}`,
);
