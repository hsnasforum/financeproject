import { spawn } from "node:child_process";

const launcher = spawn(process.execPath, [
  "scripts/planning_v2_desktop_launch.mjs",
  "--runtime",
  "prod",
  ...process.argv.slice(2),
], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

function forward(signal) {
  if (launcher.exitCode !== null || launcher.signalCode !== null) return;
  launcher.kill(signal);
}

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
launcher.once("error", (error) => {
  process.stderr.write(`[start:local] launcher failed ${error.message}\n`);
  process.exit(1);
});
launcher.once("exit", (code, signal) => {
  if (signal) {
    process.exit(128);
    return;
  }
  process.exit(code ?? 1);
});
