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

for (const check of checks) {
  const run = spawnSync("rg", [check.pattern, ...baseArgs], {
    encoding: "utf8",
  });

  if (run.status === 0) {
    console.error(`[planning:v2:engine:guard] ${check.name} matches found:`);
    if (run.stdout.trim()) console.error(run.stdout.trim());
    process.exit(1);
  }

  if (run.status === 1) {
    continue;
  }

  console.error(`[planning:v2:engine:guard] rg failed for ${check.name}`);
  if (run.stderr.trim()) console.error(run.stderr.trim());
  process.exit(2);
}

console.log("[planning:v2:engine:guard] no legacy top-level engine field access found");
