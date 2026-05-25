import { spawnSync } from "node:child_process";

function printUsage() {
  console.log("Usage: pnpm worktree:scope -- <path> [more paths...]");
  console.log("");
  console.log("Shows which current worktree changes are inside the given scope and which are not.");
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "git command failed";
    throw new Error(stderr);
  }

  return result.stdout.trimEnd();
}

function parseStatusLines(output) {
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function printSection(title, lines) {
  console.log(title);
  if (lines.length === 0) {
    console.log("- 없음");
    return;
  }

  for (const line of lines) {
    console.log(`- ${line}`);
  }
}

function formatArgs(args) {
  return args.map((arg) => JSON.stringify(arg)).join(" ");
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const allLines = parseStatusLines(runGit(["status", "--short", "--untracked-files=all"]));
  const scopedLines = parseStatusLines(runGit(["status", "--short", "--untracked-files=all", "--", ...args]));
  const scopedSet = new Set(scopedLines);
  const unrelatedLines = allLines.filter((line) => !scopedSet.has(line));

  console.log("Scoped worktree status");
  console.log("");
  console.log("대상 경로");
  for (const arg of args) {
    console.log(`- ${arg}`);
  }
  console.log("");
  console.log(`전체 변경: ${allLines.length}`);
  console.log(`범위 내 변경: ${scopedLines.length}`);
  console.log(`범위 밖 변경: ${unrelatedLines.length}`);
  console.log("");

  printSection("범위 내 변경", scopedLines);
  console.log("");
  printSection("범위 밖 변경", unrelatedLines);
  console.log("");
  console.log(`권장 확인: git diff --check -- ${formatArgs(args)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`worktree:scope failed: ${message}`);
  process.exit(1);
}
