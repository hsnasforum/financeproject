#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const trackedOnlyPaths = [
  "AGENTS.md",
  "multi_agent.md",
  ".codex/config.toml",
  ".codex/rules/default.rules",
  ".codex/skills/codex-agent-rules-maintenance/SKILL.md",
  ".codex/skills/codex-agent-rules-maintenance/agents/openai.yaml",
  ".codex/skills/dart-data-source-hardening/SKILL.md",
  ".codex/skills/finance-skill-routing/SKILL.md",
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
  "scripts/run_codex_multi_agent.sh",
  "work/README.md",
];

// 공통 계약을 한 곳에서 검사하고 각 역할은 그 계약을 참조한다.
const nativeRoles = ["manager", "analyzer", "planner", "developer", "reviewer", "tester", "researcher", "documenter"];
const cliRoles = ["lead", "planner", "researcher", "implementer", "reviewer", "validator", "documenter"];
const coverageChecks = [
  { path: "multi_agent.md", patterns: [/^## 위임과 소유권$/m, /^## 검증 게이트 단일 기준$/m, /^## Handoff와 기록$/m, /\/work/, /사용 skill/, /실행한 검증/, /미실행 검증/, /기준 workspace·revision/, /공유 자원 소유권/] },
  ...nativeRoles.map((role) => ({ path: `.codex/agents/${role}.toml`, patterns: [/AGENTS\.md/, /multi_agent\.md/, /Handoff/, /반환:/] })),
  { path: "scripts/prompts/multi-agent/common.md", patterns: [/AGENTS\.md/, /multi_agent\.md/, /Handoff/, /agents\.enabled=false/] },
  ...cliRoles.map((role) => ({ path: `scripts/prompts/multi-agent/${role}.md`, patterns: [/multi_agent\.md/, /Handoff/, /반환:/] })),
];

const roleProfiles = {
  manager: ["gpt-6.1-sol", "max", "read-only"],
  analyzer: ["gpt-6.1-sol", "max", "read-only"],
  researcher: ["gpt-6.1-sol", "max", "read-only"],
  tester: ["gpt-6.1-sol", "max", "workspace-write"],
  documenter: ["gpt-6.1-sol", "max", "workspace-write"],
  planner: ["gpt-6.1-sol", "max", "read-only"],
  developer: ["gpt-6.1-sol", "max", "workspace-write"],
  reviewer: ["gpt-6.1-sol", "max", "read-only"],
};

function assignment(key, value) {
  return new RegExp(`^${key} = "${value.replaceAll(".", "\\.")}"$`, "m");
}

const profileChecks = [
  { path: ".codex/config.toml", section: "", patterns: [assignment("model", "gpt-6-astra"), assignment("model_reasoning_effort", "ultra"), /^project_doc_max_bytes = 32768$/m] },
  { path: ".codex/config.toml", section: "agents", patterns: [/^enabled = true$/m, /^max_concurrent_threads_per_session = 6$/m, /^max_depth = 1$/m, /^job_max_runtime_seconds = 1800$/m, assignment("default_subagent_model", "gpt-6.1-sol"), assignment("default_subagent_reasoning_effort", "max")] },
  ...Object.entries(roleProfiles).map(([role, [model, effort, sandbox]]) => ({
    path: `.codex/agents/${role}.toml`,
    patterns: [assignment("model", model), assignment("model_reasoning_effort", effort), assignment("sandbox_mode", sandbox), assignment("approval_policy", "on-request")],
  })),
  { path: "scripts/run_codex_multi_agent.sh", patterns: [/CODEX_LEAD_MODEL:-gpt-6-astra/, /CODEX_DEMANDING_MODEL:-gpt-6\.1-sol/, /CODEX_READ_HEAVY_MODEL:-gpt-6\.1-sol/, /CODEX_LEAD_EFFORT:-ultra/, /CODEX_DEMANDING_EFFORT:-max/, /CODEX_READ_HEAVY_EFFORT:-max/, /agents\.enabled=false/, /model_reasoning_effort/] },
];

const skillDefinitionChecks = [
  {
    path: ".codex/skills/codex-agent-rules-maintenance/SKILL.md",
    patterns: [/^name: codex-agent-rules-maintenance$/m, /^description: .+$/m, /^When model or routing changes, align only the affected surfaces:$/m, /^Validate the changed surface, not the whole app:$/m],
  },
  {
    path: ".codex/skills/codex-agent-rules-maintenance/agents/openai.yaml",
    patterns: [/^interface:$/m, /^  display_name: .+$/m, /^  short_description: .+$/m, /^  default_prompt: .+$/m],
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

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/\/$/, "");
}

function parseConfiguredSkillPath(configuredPath) {
  const normalized = normalizePath(configuredPath);
  if (normalized.startsWith(".codex/skills/")) {
    return { configuredRoot: normalizePath(process.cwd()), localPath: normalized };
  }

  const marker = "/.codex/skills/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return null;
  return {
    configuredRoot: normalized.slice(0, markerIndex),
    localPath: normalized.slice(markerIndex + 1),
  };
}

function validateConfiguredSkills(configText) {
  const issues = [];
  const configuredSkills = [...configText.matchAll(/^path = "([^"]+\/SKILL\.md)"$/gm)]
    .map((match) => parseConfiguredSkillPath(match[1]))
    .filter(Boolean);
  const currentRoot = normalizePath(process.cwd());
  const repositoryRoots = new Set([currentRoot]);

  for (const skill of configuredSkills) {
    if (ensureTracked(skill.localPath)) {
      repositoryRoots.add(skill.configuredRoot);
    }
  }

  for (const skill of configuredSkills) {
    if (!repositoryRoots.has(skill.configuredRoot)) continue;
    if (!fs.existsSync(skill.localPath)) {
      issues.push(`configured repository skill is missing from current checkout: ${skill.localPath}`);
      continue;
    }
    if (!ensureTracked(skill.localPath)) {
      issues.push(`configured repository skill is untracked in current checkout: ${skill.localPath}`);
    }
  }

  return issues;
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

function gitOutput(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "";
  return result.stdout ?? "";
}

function collectChangedWorkNotes() {
  const changed = new Set();
  for (const args of [
    ["diff", "--name-only", "HEAD"],
    ["diff", "--name-only", "HEAD^", "HEAD"],
  ]) {
    for (const filePath of gitOutput(args).split(/\r?\n/)) {
      if (!WORK_NOTE_PATH_RE.test(filePath)) continue;
      changed.add(filePath);
    }
  }
  return [...changed].filter((filePath) => fs.existsSync(filePath) && ensureTracked(filePath));
}

function workNoteSortKey(filePath) {
  const match = WORK_NOTE_PATH_RE.exec(filePath);
  if (!match) return "";
  const [, monthDir, dayDir, year, monthFile, dayFile] = match;
  return [
    year,
    monthFile,
    dayFile,
    String(Number(monthDir)).padStart(2, "0"),
    String(Number(dayDir)).padStart(2, "0"),
    filePath,
  ].join("/");
}

function getLatestWorkNote({ trackedOnly = false } = {}) {
  const changedWorkNotes = collectChangedWorkNotes();
  const notes = changedWorkNotes.length > 0
    ? changedWorkNotes
    : (trackedOnly ? collectTrackedWorkNotes() : collectWorkNotes(WORK_DIR));
  if (notes.length < 1) return null;
  return notes
    .map((filePath) => ({
      filePath,
      sortKey: workNoteSortKey(filePath),
    }))
    .sort((left, right) => right.sortKey.localeCompare(left.sortKey) || left.filePath.localeCompare(right.filePath))[0]?.filePath ?? null;
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

const configText = fs.readFileSync(".codex/config.toml", "utf8");
issues.push(...validateConfiguredSkills(configText));

if (process.argv.includes("--configured-skills-only")) {
  if (issues.length > 0) {
    console.error(`[multi-agent:guard] FAIL issues=${issues.length}`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }
  console.log("[multi-agent:guard] PASS configured-skills");
  process.exit(0);
}

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

function profileText(text, section) {
  if (section === undefined) return text;
  let current = "";
  const selected = [];
  for (const line of text.split(/\r?\n/)) {
    const header = /^\[([^\[\]]+)\]$/.exec(line.trim());
    if (header) current = header[1];
    else if (/^\[/.test(line.trim())) current = null;
    else if (current === section) selected.push(line);
  }
  return selected.join("\n");
}

for (const check of profileChecks) {
  if (!fs.existsSync(check.path)) continue;
  const text = profileText(fs.readFileSync(check.path, "utf8"), check.section);
  for (const pattern of check.patterns) {
    if (!pattern.test(text)) {
      issues.push(`invalid active harness profile ${String(pattern)} -> ${check.path}`);
    }
  }
}

for (const check of skillDefinitionChecks) {
  if (!fs.existsSync(check.path)) continue;
  const text = fs.readFileSync(check.path, "utf8");
  for (const pattern of check.patterns) {
    if (!pattern.test(text)) {
      issues.push(`invalid skill definition ${String(pattern)} -> ${check.path}`);
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
