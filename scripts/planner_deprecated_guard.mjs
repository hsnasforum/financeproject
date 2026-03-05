import fs from "node:fs";
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

for (const check of checks) {
  const run = spawnSync("rg", [check.pattern, "src", "tests"], {
    encoding: "utf8",
  });

  if (run.status === 0) {
    console.error(`[planner:deprecated:guard] ${check.name} matches found:`);
    if (run.stdout.trim()) console.error(run.stdout.trim());
    process.exit(1);
  }

  if (run.status === 1) continue;

  console.error(`[planner:deprecated:guard] rg failed for ${check.name}`);
  if (run.stderr.trim()) console.error(run.stderr.trim());
  process.exit(2);
}

console.log("[planner:deprecated:guard] deprecated planner module references not found");
