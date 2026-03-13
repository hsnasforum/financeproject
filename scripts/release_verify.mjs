#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { runCompleteCli } from "./planning_v2_complete.mjs";

const PREFLIGHT_REQUIRED_GATES = [
  "cleanup:next-artifacts",
];
const EARLY_REQUIRED_GATES = [
  "planning:v2:complete",
  "multi-agent:guard",
];
const OPTIONAL_GATES = [
  "planning:v2:compat",
  "planning:v2:regress",
];
const LATE_REQUIRED_GATES = [
  "test",
];
const ADVISORY_GATES = [
  "planning:ssot:check",
];

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, "package.json");

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: options.shell ?? (process.platform === "win32"),
      env: options.env ?? process.env,
      cwd: options.cwd ?? cwd,
    });
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

function runPnpm(scriptName, args = []) {
  return runCommand("pnpm", [scriptName, ...args]);
}

async function runGate(gate) {
  if (gate === "cleanup:next-artifacts") {
    return runPnpm(gate, ["--", "--build-preflight"]);
  }
  if (gate === "planning:v2:complete") {
    try {
      await runCompleteCli();
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[release:verify] complete gate failed\n${message}`);
      return 1;
    }
  }
  if (gate === "planning:v2:compat") {
    return runCommand("node", ["--import", "tsx", "scripts/planning_v2_compat.mjs", "--skip-complete"], { shell: false });
  }
  if (gate === "planning:v2:regress") {
    return runCommand("node", ["--import", "tsx", "scripts/planning_v2_regression.mjs"], { shell: false });
  }
  return runPnpm(gate);
}

async function getAvailableScripts() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  return pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object"
    ? new Set(Object.keys(pkg.scripts))
    : new Set();
}

async function runRequiredGates(gates, availableScripts) {
  for (const gate of gates) {
    if (!availableScripts.has(gate)) {
      console.error(`[release:verify] FAIL missing required script: ${gate}`);
      process.exit(1);
    }
    console.log(`[release:verify] run ${gate}`);
    const code = await runGate(gate);
    if (code !== 0) {
      console.error(`[release:verify] FAIL gate=${gate} exit=${code}`);
      process.exit(code);
    }
  }
}

async function main() {
  const availableScripts = await getAvailableScripts();
  await runRequiredGates(PREFLIGHT_REQUIRED_GATES, availableScripts);
  await runRequiredGates(EARLY_REQUIRED_GATES, availableScripts);

  for (const gate of OPTIONAL_GATES) {
    if (!availableScripts.has(gate)) {
      console.log(`[release:verify] skip ${gate} (script not found)`);
      continue;
    }
    console.log(`[release:verify] run ${gate}`);
    const code = await runGate(gate);
    if (code !== 0) {
      console.error(`[release:verify] FAIL gate=${gate} exit=${code}`);
      process.exit(code);
    }
  }

  await runRequiredGates(LATE_REQUIRED_GATES, availableScripts);

  for (const gate of ADVISORY_GATES) {
    if (!availableScripts.has(gate)) {
      console.log(`[release:verify] skip ${gate} (script not found)`);
      continue;
    }
    console.log(`[release:verify] run advisory ${gate}`);
    const code = await runPnpm(gate);
    if (code !== 0) {
      console.warn(`[release:verify] WARN advisory failed gate=${gate} exit=${code}`);
    }
  }
  console.log("[release:verify] PASS");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[release:verify] FAIL\n${message}`);
  process.exit(1);
});
