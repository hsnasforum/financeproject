import { spawn } from "node:child_process";

const COMPLETE_STEPS = [
  "planning:v2:guard",
  "planning:v2:scan:guards",
  "planning:v2:smoke",
];

function runPnpmScript(script, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, [script], {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export async function runComplete(options = {}) {
  const cwd = options.cwd || process.cwd();
  for (const script of COMPLETE_STEPS) {
    console.log(`[planning:v2:complete] run ${script}`);
    const code = await runPnpmScript(script, cwd);
    if (code !== 0) {
      throw new Error(`${script} failed with code ${code}`);
    }
  }
}

async function main() {
  try {
    await runComplete();
    console.log("[planning:v2:complete] PASS");
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:v2:complete] FAIL\n${message}`);
    process.exit(1);
  }
}

main();

