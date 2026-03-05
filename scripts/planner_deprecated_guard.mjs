import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const removedFiles = [
  "src/lib/planner/metrics.ts",
  "src/lib/planner/rules.ts",
];

for (const filePath of removedFiles) {
  if (fs.existsSync(filePath)) {
    console.error(`[planner:deprecated:guard] removed file restored unexpectedly: ${filePath}`);
    process.exit(1);
  }
}

const checks = [
  {
    name: "deprecated planner module imports",
    pattern: "lib/planner/(metrics|rules)",
  },
];

function asTrimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      out.push(fullPath);
    }
  }

  return out;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function runNodeFallback(pattern) {
  const regex = new RegExp(pattern);
  const files = [...listFiles("src"), ...listFiles("tests")];
  const lines = [];

  for (const filePath of files) {
    let source = "";
    try {
      source = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const relativePath = toPosix(path.relative(process.cwd(), filePath));
    const rows = source.split("\n");
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] ?? "";
      if (!regex.test(row)) continue;
      lines.push(`${relativePath}:${index + 1}:${row}`);
    }
  }

  return lines;
}

for (const check of checks) {
  const run = spawnSync("rg", [check.pattern, "src", "tests"], {
    encoding: "utf8",
  });

  if (run.error) {
    if (run.error.code === "ENOENT") {
      const fallbackMatches = runNodeFallback(check.pattern);
      if (fallbackMatches.length > 0) {
        console.error(`[planner:deprecated:guard] ${check.name} matches found (node fallback):`);
        console.error(fallbackMatches.join("\n"));
        process.exit(1);
      }
      continue;
    }

    console.error(`[planner:deprecated:guard] rg execution failed for ${check.name}`);
    console.error(run.error.message);
    process.exit(2);
  }

  if (run.status === 0) {
    console.error(`[planner:deprecated:guard] ${check.name} matches found:`);
    const stdout = asTrimmedText(run.stdout);
    if (stdout) console.error(stdout);
    process.exit(1);
  }

  if (run.status === 1) continue;

  console.error(`[planner:deprecated:guard] rg failed for ${check.name}`);
  const stderr = asTrimmedText(run.stderr);
  if (stderr) console.error(stderr);
  process.exit(2);
}

console.log("[planner:deprecated:guard] deprecated planner module references not found");
