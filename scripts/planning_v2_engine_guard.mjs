import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const checks = [
  {
    name: "legacy top-level direct access",
    pattern: "(response|payload|result|data)\\.(stage|financialStatus|stageDecision)",
  },
  {
    name: "legacy top-level destructuring",
    pattern: "const\\s*\\{\\s*(stage|financialStatus|stageDecision)\\s*\\}\\s*=\\s*(response|payload|result|data)",
  },
];

const baseArgs = [
  "src",
  "--glob",
  "!**/*.test.*",
  "--glob",
  "!src/lib/planning/api/contracts.ts",
];

function asTrimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function listFiles(rootDir) {
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
  const files = listFiles("src");
  const lines = [];

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(process.cwd(), filePath));
    if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx") || relativePath.endsWith(".test.js") || relativePath.endsWith(".test.jsx")) {
      continue;
    }
    if (relativePath === "src/lib/planning/api/contracts.ts") {
      continue;
    }

    let source = "";
    try {
      source = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

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
  const run = spawnSync("rg", [check.pattern, ...baseArgs], {
    encoding: "utf8",
  });

  if (run.error) {
    if (run.error.code === "ENOENT") {
      const fallbackMatches = runNodeFallback(check.pattern);
      if (fallbackMatches.length > 0) {
        console.error(`[planning:v2:engine:guard] ${check.name} matches found (node fallback):`);
        console.error(fallbackMatches.join("\n"));
        process.exit(1);
      }
      continue;
    }

    console.error(`[planning:v2:engine:guard] rg execution failed for ${check.name}`);
    console.error(run.error.message);
    process.exit(2);
  }

  if (run.status === 0) {
    console.error(`[planning:v2:engine:guard] ${check.name} matches found:`);
    const stdout = asTrimmedText(run.stdout);
    if (stdout) console.error(stdout);
    process.exit(1);
  }

  if (run.status === 1) {
    continue;
  }

  console.error(`[planning:v2:engine:guard] rg failed for ${check.name}`);
  const stderr = asTrimmedText(run.stderr);
  if (stderr) console.error(stderr);
  process.exit(2);
}

console.log("[planning:v2:engine:guard] no legacy top-level engine field access found");
