#!/usr/bin/env node
import { runPnpm } from "./pnpm_runner.mjs";

const result = await runPnpm(["audit"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
  cwd: process.cwd(),
});

process.exit(typeof result.code === "number" ? result.code : 1);
