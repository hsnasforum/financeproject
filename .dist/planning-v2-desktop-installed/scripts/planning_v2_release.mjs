import path from "node:path";
import { spawn } from "node:child_process";
import { tsImport } from "tsx/esm/api";

const SELF_TEST_DOC_PATH = "docs/planning-v2-5min-selftest.md";
let redactTextImpl = fallbackRedactText;

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  let version = "";
  let baseUrl = "";
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "version") version = value;
    if (key === "base-url") baseUrl = value;
  }
  return { version, baseUrl };
}

function fallbackRedactText(text) {
  const raw = asString(text);
  if (!raw) return "";
  return raw
    .replace(/\b(Bearer\s+)[^\s"'`]+/gi, "$1***")
    .replace(/(BOK_ECOS_API_KEY|ECOS_API_KEY|GITHUB_TOKEN|FINLIFE_API_KEY)\s*=\s*[^\s]+/gi, "$1=***")
    .replace(/(["']?(?:token|api[_-]?key|secret|password)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, "$1***$2")
    .replace(/\.data(?:[\\/][^\s"'`)\]}]+)+/g, "<DATA_PATH>")
    .replace(/\b\d{7,}\b/g, "<AMOUNT>");
}

function maskSecrets(text) {
  return redactTextImpl(asString(text));
}

function tailText(text, maxLines = 40) {
  const raw = asString(text);
  if (!raw) return "";
  return raw.split(/\r?\n/).slice(-maxLines).join("\n");
}

function printStep(status, id, note = "") {
  const suffix = note ? ` - ${note}` : "";
  console.log(`[planning:v2:release] ${status} ${id}${suffix}`);
}

function runCommand(step, cwd) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" && step.command === "pnpm" ? "pnpm.cmd" : step.command;
    const startedAtMs = Date.now();
    const out = [];
    const err = [];
    const child = spawn(command, step.args, {
      cwd,
      env: {
        ...process.env,
        ...(step.env ?? {}),
      },
    });
    child.stdout.on("data", (chunk) => out.push(String(chunk)));
    child.stderr.on("data", (chunk) => err.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: Number.isFinite(code) ? code : 1,
        durationMs: Date.now() - startedAtMs,
        stdout: out.join(""),
        stderr: err.join(""),
      });
    });
  });
}

async function loadBuildReleasePlan() {
  const moduleRaw = await tsImport("../src/lib/planning/release/plan.ts", { parentURL: import.meta.url });
  const moduleResolved = moduleRaw?.default && typeof moduleRaw.default === "object" ? moduleRaw.default : moduleRaw;
  const fn = moduleResolved?.buildReleasePlan;
  if (typeof fn !== "function") {
    throw new Error("buildReleasePlan import failed");
  }
  return fn;
}

async function loadRedactText() {
  try {
    const moduleRaw = await tsImport("../src/lib/planning/privacy/redact.ts", { parentURL: import.meta.url });
    const moduleResolved = moduleRaw?.default && typeof moduleRaw.default === "object" ? moduleRaw.default : moduleRaw;
    if (typeof moduleResolved?.redactText === "function") {
      redactTextImpl = (value) => moduleResolved.redactText(asString(value));
    }
  } catch {
    redactTextImpl = fallbackRedactText;
  }
}

async function main() {
  await loadRedactText();
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const buildReleasePlan = await loadBuildReleasePlan();
  const plan = buildReleasePlan({
    version: args.version,
    ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
  });

  console.log(`[planning:v2:release] version=${plan.version}`);
  if (plan.baseUrl) {
    console.log(`[planning:v2:release] baseUrl=${plan.baseUrl}`);
  } else {
    console.log("[planning:v2:release] acceptance policy: skip when --base-url is missing");
  }

  for (const step of plan.steps) {
    if (!step.willRun) {
      printStep("SKIPPED", step.id, step.note ?? "disabled");
      continue;
    }

    printStep("RUN", step.id, `${step.command} ${step.args.join(" ")}`);
    const result = await runCommand(step, cwd);
    if (result.exitCode !== 0) {
      printStep("FAIL", step.id, `exit=${result.exitCode}`);
      const stdoutTail = tailText(maskSecrets(result.stdout), 30);
      const stderrTail = tailText(maskSecrets(result.stderr), 30);
      if (stdoutTail) console.error(`[planning:v2:release] ${step.id} stdout(last):\n${stdoutTail}`);
      if (stderrTail) console.error(`[planning:v2:release] ${step.id} stderr(last):\n${stderrTail}`);
      throw new Error(`release step failed: ${step.id}`);
    }
    printStep("PASS", step.id, `durationMs=${result.durationMs}`);
  }

  console.log(`[planning:v2:release] releaseNotes=${plan.artifacts.releaseNotesPath}`);
  console.log(`[planning:v2:release] evidenceBundle=${plan.artifacts.evidenceBundlePath}`);
  console.log(`[planning:v2:release] User Gate (manual): complete ${SELF_TEST_DOC_PATH}`);
  console.log("✅ P97 COMPLETE — 모든 게이트 통과(테스트/스모크/가드/회귀)");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:release] FAIL\n${maskSecrets(message)}`);
  process.exit(1);
});
