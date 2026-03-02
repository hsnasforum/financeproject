#!/usr/bin/env node
import { spawn } from "node:child_process";

const GATES = [
  "test",
  "planning:v2:complete",
  "planning:v2:compat",
];

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

async function main() {
  for (const gate of GATES) {
    console.log(`[release:verify] run ${gate}`);
    const code = await runPnpm(gate);
    if (code !== 0) {
      console.error(`[release:verify] FAIL gate=${gate} exit=${code}`);
      process.exit(code);
    }
  }
  console.log("[release:verify] PASS");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[release:verify] FAIL\n${message}`);
  process.exit(1);
});

