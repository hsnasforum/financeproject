import { execFileSync } from "node:child_process";

const CORE_PATTERNS = [
  /^src\/lib\/planning\/v2\//,
  /^src\/lib\/planning\/core\/v2\//,
  /^src\/lib\/planning\/store\/runStore\.ts$/,
  /^src\/lib\/planning\/reports\/storage\.ts$/,
  /^src\/app\/planning\//,
  /^src\/app\/api\/planning\/v2\//,
  /^scripts\/planning_v2_(complete|regression|smoke|acceptance|static_guard|route_guard_scan)\.mjs$/,
];

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  let base = "";
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "base") base = value;
  }
  return { base };
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function parseChangedFiles(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function getChangedFiles(baseRef) {
  const files = new Set();

  if (baseRef) {
    for (const file of parseChangedFiles(runGit(["diff", "--name-only", `${baseRef}...HEAD`]))) {
      files.add(file);
    }
    return [...files].sort((a, b) => a.localeCompare(b));
  }

  for (const file of parseChangedFiles(runGit(["diff", "--name-only", "--cached"]))) {
    files.add(file);
  }
  for (const file of parseChangedFiles(runGit(["diff", "--name-only"]))) {
    files.add(file);
  }
  if (files.size < 1) {
    for (const file of parseChangedFiles(runGit(["show", "--name-only", "--pretty=format:", "HEAD"]))) {
      files.add(file);
    }
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

function isCoreFile(filePath) {
  return CORE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function hasV2CoreTag() {
  const commitMessage = asString(runGit(["log", "-1", "--pretty=%B"]));
  const ciTitle = asString(
    process.env.PR_TITLE
      || process.env.GITHUB_PR_TITLE
      || process.env.GITHUB_EVENT_PULL_REQUEST_TITLE,
  );
  return {
    commitMessage,
    ciTitle,
    matched: commitMessage.includes("[v2-core-change]") || ciTitle.includes("[v2-core-change]"),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedFiles = getChangedFiles(args.base);
  const coreChanged = changedFiles.filter((filePath) => isCoreFile(filePath));

  console.log("[planning:v2:freeze:guard] info");
  if (args.base) {
    console.log(`- diff base: ${args.base}...HEAD`);
  } else {
    console.log("- diff source: staged + working tree (fallback: HEAD)");
  }
  console.log(`- changed files: ${changedFiles.length}`);

  if (coreChanged.length < 1) {
    console.log("- v2 core change: none");
    console.log("[planning:v2:freeze:guard] PASS (informational)");
    process.exit(0);
  }

  console.log(`- v2 core change: detected (${coreChanged.length})`);
  for (const filePath of coreChanged) {
    console.log(`  - ${filePath}`);
  }
  console.log("- required gates:");
  console.log("  - pnpm planning:v2:complete");
  console.log("  - pnpm planning:v2:regress");
  console.warn("- v2 freeze 상태: core 변경이면 regress/complete 필수");

  const tagStatus = hasV2CoreTag();
  if (tagStatus.matched) {
    console.log("- tag check: [v2-core-change] found (commit/PR title)");
  } else {
    console.warn("- tag check: [v2-core-change] not found (commit message or PR title)");
    console.warn("  add tag for review visibility when v2 core changes.");
  }

  console.log("[planning:v2:freeze:guard] WARN (informational, exit=0)");
  process.exit(0);
}

main();
