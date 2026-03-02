#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const REQUIRED_GATES = [
  "test",
  "planning:v2:complete",
];
const OPTIONAL_GATES = [
  "planning:v2:compat",
  "planning:v2:regress",
];
const ADVISORY_GATES = [
  "planning:ssot:check",
];

const cwd = process.cwd();
const packageJsonPath = path.join(cwd, "package.json");

function runPnpm(scriptName) {
  return new Promise((resolve) => {
    const child = spawn("pnpm", [scriptName], {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

async function getAvailableScripts() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  return pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object"
    ? new Set(Object.keys(pkg.scripts))
    : new Set();
}

async function main() {
  const availableScripts = await getAvailableScripts();
  for (const gate of REQUIRED_GATES) {
    if (!availableScripts.has(gate)) {
      console.error(`[release:verify] FAIL missing required script: ${gate}`);
      process.exit(1);
    }
    console.log(`[release:verify] run ${gate}`);
    const code = await runPnpm(gate);
    if (code !== 0) {
      console.error(`[release:verify] FAIL gate=${gate} exit=${code}`);
      process.exit(code);
    }
  }
  for (const gate of OPTIONAL_GATES) {
    if (!availableScripts.has(gate)) {
      console.log(`[release:verify] skip ${gate} (script not found)`);
      continue;
    }
    console.log(`[release:verify] run ${gate}`);
    const code = await runPnpm(gate);
    if (code !== 0) {
      console.error(`[release:verify] FAIL gate=${gate} exit=${code}`);
      process.exit(code);
    }
  }
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
