import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";
import { createIsolatedPlanningV2E2EOptions } from "./planning_v2_e2e_isolation.mjs";

const COMPLETE_STEPS = [
  "planning:v2:guard",
  "sec:check",
  "planning:v2:freeze:guard",
  "planning:v2:scan:guards",
  "planning:v2:report:test",
  "planning:v2:guide:test",
  "planning:v2:smoke",
  "planning:v2:e2e:fast",
];
const SELF_TEST_DOC_PATH = "docs/planning-v2-5min-selftest.md";
let redactTextImpl = fallbackRedactText;

function fallbackRedactText(text) {
  return String(text ?? "")
    .replace(/\b(Bearer\s+)[^\s"'`]+/gi, "$1***")
    .replace(/(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN|FINLIFE_API_KEY)\s*=\s*[^\s]+/gi, "$1=***")
    .replace(/\.data(?:[\\/][^\s"'`)\]}]+)+/g, "<DATA_PATH>")
    .replace(/\b\d{7,}\b/g, "<AMOUNT>");
}

async function loadRedactText() {
  try {
    const moduleRaw = await tsImport("../src/lib/planning/privacy/redact.ts", { parentURL: import.meta.url });
    const resolved = moduleRaw?.default && typeof moduleRaw.default === "object" ? moduleRaw.default : moduleRaw;
    if (typeof resolved?.redactText === "function") {
      redactTextImpl = (value) => resolved.redactText(String(value ?? ""));
    }
  } catch {
    redactTextImpl = fallbackRedactText;
  }
}

function runPnpmScript(script, cwd = process.cwd(), options = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(command, [script, ...(options.args ?? [])], {
      cwd,
      env: options.env ?? process.env,
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
    if (script === "planning:v2:e2e:fast") {
      const isolated = await createIsolatedPlanningV2E2EOptions(process.env, {
        defaultPort: 3226,
        preferredPort: process.env.PLANNING_FAST_E2E_PORT ?? process.env.PORT,
        scanFrom: process.env.PLANNING_FAST_E2E_SCAN_FROM,
        scanTo: process.env.PLANNING_FAST_E2E_SCAN_TO,
        sandboxPrefix: "finance-planning-fast-e2e-",
      });
      console.log(
        `[planning:v2:complete] isolated fast e2e port=${isolated.port} distDir=${isolated.distDir} reuseExistingServer=0 planningDataDir=${isolated.planningDataDir}`,
      );
      try {
        const code = await runPnpmScript(script, cwd, { env: isolated.env });
        if (code !== 0) {
          throw new Error(`${script} failed with code ${code}`);
        }
      } finally {
        await isolated.cleanup();
      }
      continue;
    }
    const code = await runPnpmScript(script, cwd);
    if (code !== 0) {
      throw new Error(`${script} failed with code ${code}`);
    }
  }
}

export async function runCompleteCli(options = {}) {
  await loadRedactText();
  await runComplete(options);
  console.log("[planning:v2:complete] PASS");
  console.log("[planning:v2:complete] Report Gate: planning:v2:report:test");
  console.log("[planning:v2:complete] Guide Gate: planning:v2:guide:test");
  console.log("[planning:v2:complete] UX Gate: planning:v2:e2e:fast");
  console.log(`[planning:v2:complete] User Gate (manual): 5-min self-test -> ${SELF_TEST_DOC_PATH}`);
}

async function main() {
  try {
    await runCompleteCli();
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[planning:v2:complete] FAIL\n${redactTextImpl(message)}`);
    process.exit(1);
  }
}

const directScriptPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (directScriptPath === import.meta.url) {
  void main();
}
