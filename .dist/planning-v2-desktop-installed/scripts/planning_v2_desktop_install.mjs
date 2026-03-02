import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    from: ".dist/planning-v2-desktop",
    to: path.join(os.homedir(), "planning-v2-desktop"),
    skipInstall: false,
  };
  for (const token of argv) {
    if (token === "--skip-install") {
      out.skipInstall = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "from") out.from = asString(value) || out.from;
    if (key === "to") out.to = asString(value) || out.to;
  }
  return out;
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed (${code ?? "unknown"})`));
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const fromDir = path.resolve(cwd, args.from);
  const toDir = path.resolve(cwd, args.to);

  await fs.access(fromDir);
  await fs.rm(toDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(toDir), { recursive: true });
  await fs.cp(fromDir, toDir, { recursive: true, force: true });

  if (!args.skipInstall) {
    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    await runCommand(pnpmCmd, ["install", "--frozen-lockfile"], toDir);
  }

  process.stdout.write(`[planning:v2:desktop:install] installed=${toDir}\n`);
  process.stdout.write(`[planning:v2:desktop:install] run=${process.platform === "win32" ? "run.cmd" : "./run.sh"}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[planning:v2:desktop:install] failed\n${message}\n`);
  process.exit(1);
});
