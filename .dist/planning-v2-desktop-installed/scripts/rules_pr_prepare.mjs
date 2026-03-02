import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const COMMIT_MESSAGE = "chore(dart-rules): tune rules/labels";
const PATCH_RELATIVE_PATH = path.join("tmp", "dart", "rules_pr.patch");
const RULES_FILE = "config/dart-disclosure-rules.json";
const LABELS_FILE = "data/dart/labels.csv";
const TMP_PATCH_FILE = "tmp/dart/rules_patch.json";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScope(value) {
  const scope = asString(value).toLowerCase();
  if (scope === "rules" || scope === "labels" || scope === "both") return scope;
  return "both";
}

function normalizePathLike(value) {
  return asString(value).replace(/\\/g, "/");
}

function normalizeIncludeTmpPatch(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const token = asString(value);
  if (token === "1" || token.toLowerCase() === "true") return true;
  return false;
}

function parseLines(input) {
  return asString(input)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function makeBranchName(now = new Date()) {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `ops/rules-tune-${year}${month}${day}-${hour}${minute}`;
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: Number.isFinite(result.status) ? result.status : 1,
    stdout: asString(result.stdout),
    stderr: asString(result.stderr),
  };
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function collectChangedFiles(cwd) {
  const out = new Set();
  const commands = [
    ["diff", "--name-only"],
    ["diff", "--name-only", "--cached"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  for (const args of commands) {
    const res = runGit(args, cwd);
    if (!res.ok) {
      throw new Error(`git ${args.join(" ")} failed: ${res.stderr || res.stdout || `exit ${res.status}`}`);
    }
    for (const file of parseLines(res.stdout)) {
      const normalized = normalizePathLike(file);
      if (normalized) out.add(normalized);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function isWhitelistedPath(filePath, options = {}) {
  const scope = normalizeScope(options.scope);
  const includeTmpPatch = normalizeIncludeTmpPatch(options.includeTmpPatch);
  const normalized = normalizePathLike(filePath);
  if (!normalized) return false;

  const allowRules = scope === "rules" || scope === "both";
  const allowLabels = scope === "labels" || scope === "both";

  if (allowRules && normalized === RULES_FILE) return true;
  if (allowLabels && normalized === LABELS_FILE) return true;
  if (normalized.startsWith("docs/dart-rules-") && normalized.endsWith(".md")) return true;
  if (includeTmpPatch && normalized === TMP_PATCH_FILE) return true;
  return false;
}

export function filterWhitelistedPaths(paths, options = {}) {
  const rows = Array.isArray(paths) ? paths : [];
  return rows
    .map((entry) => normalizePathLike(entry))
    .filter((entry) => isWhitelistedPath(entry, options));
}

function getStagedWhitelisted(cwd, paths) {
  if (paths.length < 1) return [];
  const res = runGit(["diff", "--cached", "--name-only", "--", ...paths], cwd);
  if (!res.ok) {
    throw new Error(`git diff --cached failed: ${res.stderr || res.stdout || `exit ${res.status}`}`);
  }
  return parseLines(res.stdout).map((line) => normalizePathLike(line));
}

function toPrepareError(message, details = {}) {
  return {
    ok: false,
    ...details,
    error: {
      code: "PREPARE_FAILED",
      message,
    },
  };
}

export function parsePrepareArgs(argv = []) {
  const out = {
    scope: "both",
    includeTmpPatch: false,
  };
  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      out.scope = normalizeScope(arg.split("=")[1]);
      continue;
    }
    if (arg.startsWith("--includeTmpPatch=")) {
      out.includeTmpPatch = normalizeIncludeTmpPatch(arg.split("=")[1]);
    }
  }
  return out;
}

export function runRulesPrPrepare(input = {}) {
  const cwd = asString(input.cwd) || process.cwd();
  const scope = normalizeScope(input.scope);
  const includeTmpPatch = normalizeIncludeTmpPatch(input.includeTmpPatch);
  const branchName = asString(input.branchName) || makeBranchName(new Date());
  const patchPath = path.join(cwd, PATCH_RELATIVE_PATH);

  const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!repoCheck.ok || repoCheck.stdout !== "true") {
    return toPrepareError("git repository가 아닙니다.", { tookMs: 0 });
  }

  const checkout = runGit(["checkout", "-b", branchName], cwd);
  if (!checkout.ok) {
    return toPrepareError(`브랜치 생성 실패: ${checkout.stderr || checkout.stdout || `exit ${checkout.status}`}`);
  }

  let changedFiles = [];
  try {
    changedFiles = collectChangedFiles(cwd);
  } catch (error) {
    return toPrepareError(error instanceof Error ? error.message : "변경 파일 수집에 실패했습니다.");
  }

  const targetFiles = filterWhitelistedPaths(changedFiles, { scope, includeTmpPatch });
  if (targetFiles.length < 1) {
    return {
      ok: true,
      skipped: true,
      branchName,
      message: "whitelist에 해당하는 변경 파일이 없습니다.",
      stagedFiles: [],
      patchPath: null,
    };
  }

  const addResult = runGit(["add", "-A", "--", ...targetFiles], cwd);
  if (!addResult.ok) {
    return toPrepareError(`git add 실패: ${addResult.stderr || addResult.stdout || `exit ${addResult.status}`}`);
  }

  let stagedFiles = [];
  try {
    stagedFiles = getStagedWhitelisted(cwd, targetFiles);
  } catch (error) {
    return toPrepareError(error instanceof Error ? error.message : "staged 파일 확인에 실패했습니다.");
  }
  if (stagedFiles.length < 1) {
    return {
      ok: true,
      skipped: true,
      branchName,
      message: "staged된 whitelist 파일이 없습니다.",
      stagedFiles: [],
      patchPath: null,
    };
  }

  const commitResult = runGit(["commit", "-m", COMMIT_MESSAGE, "--", ...stagedFiles], cwd);
  if (!commitResult.ok) {
    const summary = [commitResult.stderr, commitResult.stdout].filter(Boolean).join(" | ");
    return toPrepareError(`git commit 실패: ${summary || `exit ${commitResult.status}`}`);
  }

  const shaResult = runGit(["rev-parse", "--short", "HEAD"], cwd);
  if (!shaResult.ok || !shaResult.stdout) {
    return toPrepareError(`커밋 SHA 확인 실패: ${shaResult.stderr || shaResult.stdout || `exit ${shaResult.status}`}`);
  }
  const commitSha = shaResult.stdout;

  const patchDiffResult = runGit(["diff", "HEAD~1..HEAD"], cwd);
  if (!patchDiffResult.ok) {
    return toPrepareError(`patch 생성 실패: ${patchDiffResult.stderr || patchDiffResult.stdout || `exit ${patchDiffResult.status}`}`);
  }
  ensureDirFor(patchPath);
  fs.writeFileSync(patchPath, `${patchDiffResult.stdout}\n`, "utf-8");

  const relativePatchPath = path.relative(cwd, patchPath).replace(/\\/g, "/");
  const pushCommand = `git push -u origin ${branchName}`;
  const lines = [
    `[rules:pr:prepare] branch=${branchName}`,
    `[rules:pr:prepare] commit=${commitSha}`,
    `[rules:pr:prepare] patch=${relativePatchPath}`,
    `[rules:pr:prepare] next=${pushCommand}`,
  ];
  for (const line of lines) {
    console.log(line);
  }

  return {
    ok: true,
    skipped: false,
    branchName,
    commitSha,
    stagedFiles,
    patchPath: relativePatchPath,
    pushCommand,
  };
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  const args = parsePrepareArgs(process.argv.slice(2));
  const result = runRulesPrPrepare(args);
  if (!result.ok) {
    console.error(`[rules:pr:prepare] failed: ${result.error.message}`);
    process.exit(1);
  }
  if (result.skipped) {
    console.log(`[rules:pr:prepare] skipped: ${result.message}`);
  }
}
