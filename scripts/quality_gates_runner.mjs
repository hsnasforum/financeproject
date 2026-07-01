#!/usr/bin/env node
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { requireQualityGate } from "./quality_gates.mjs";
import { runPnpm } from "./pnpm_runner.mjs";

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? "inherit",
      shell: options.shell ?? (process.platform === "win32"),
      env: options.env ?? process.env,
      cwd: options.cwd ?? process.cwd(),
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

export async function runQualityGateById(id, options = {}) {
  const gate = requireQualityGate(id);
  const extraArgs = options.args ?? [];
  if (Array.isArray(gate.command)) {
    const [command, ...args] = gate.command;
    return runCommand(command, [...args, ...extraArgs], {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio,
    });
  }
  if (gate.script) {
    const result = await runPnpm([gate.script, ...(gate.args ?? []), ...extraArgs], {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      shell: process.platform === "win32",
    });
    return result.code;
  }
  throw new Error(`Quality gate has no runnable command: ${gate.id}`);
}

async function main() {
  const [gateId, ...args] = process.argv.slice(2);
  if (!gateId) {
    console.error("Usage: node scripts/quality_gates_runner.mjs <gate-id> [...args]");
    process.exit(1);
  }
  const code = await runQualityGateById(gateId, { args });
  process.exit(code);
}

const directScriptPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (directScriptPath === import.meta.url) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[quality-gates] FAIL\n${message}`);
    process.exit(1);
  });
}
