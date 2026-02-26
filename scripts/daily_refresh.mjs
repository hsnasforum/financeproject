import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function parseArgs(argv) {
  const options = {
    strict: false,
    skipDoctor: false,
  };

  for (const arg of argv) {
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--skip-doctor") {
      options.skipDoctor = true;
      continue;
    }
  }
  return options;
}

function readPackageScripts(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    if (!parsed.scripts || typeof parsed.scripts !== "object" || Array.isArray(parsed.scripts)) return {};
    return parsed.scripts;
  } catch {
    return {};
  }
}

function runPnpmScript(scriptName, cwd) {
  return new Promise((resolve) => {
    const child = spawn(PNPM_BIN, [scriptName], {
      cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (error) => {
      console.error(`[daily:refresh] failed to start "${scriptName}": ${String(error)}`);
      resolve(1);
    });
    child.on("close", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const scripts = readPackageScripts(cwd);

  const steps = [];
  if (typeof scripts["warm:if-stale"] === "string" && scripts["warm:if-stale"].trim()) {
    steps.push({ name: "warm:if-stale", required: false });
  } else {
    console.log("[daily:refresh] skip warm:if-stale (script not found)");
  }

  if (typeof scripts["dart:watch"] === "string" && scripts["dart:watch"].trim()) {
    steps.push({ name: "dart:watch", required: true });
  } else {
    steps.push({ name: "dart:watch", required: true, missing: true });
  }

  if (!options.skipDoctor) {
    if (typeof scripts["data:doctor"] === "string" && scripts["data:doctor"].trim()) {
      steps.push({ name: "data:doctor", required: false });
    } else {
      console.log("[daily:refresh] skip data:doctor (script not found)");
    }
  } else {
    console.log("[daily:refresh] skip data:doctor (--skip-doctor)");
  }

  if (!process.env.OPENDART_API_KEY) {
    console.log("[daily:refresh] OPENDART_API_KEY is missing; dart:watch may skip network call (expected).");
  }

  const failures = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const prefix = `[daily:refresh] [${index + 1}/${steps.length}]`;

    if (step.missing) {
      const message = `${prefix} missing required script "${step.name}"`;
      console.error(message);
      failures.push({ step: step.name, code: 1, message });
      continue;
    }

    console.log(`${prefix} start ${step.name}`);
    const code = await runPnpmScript(step.name, cwd);
    if (code === 0) {
      console.log(`${prefix} done ${step.name}`);
      continue;
    }
    const message = `${prefix} failed ${step.name} (exit ${code})`;
    console.error(message);
    failures.push({ step: step.name, code, message });
  }

  console.log(`[daily:refresh] summary: steps=${steps.length}, failed=${failures.length}, strict=${options.strict ? "Y" : "N"}`);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`- ${failure.step}: exit ${failure.code}`);
    }
  }

  if (options.strict && failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(`[daily:refresh] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
