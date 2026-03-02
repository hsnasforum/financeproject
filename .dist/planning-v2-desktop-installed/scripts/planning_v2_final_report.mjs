import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { tsImport } from "tsx/esm/api";
import { writeTextAtomic } from "./planning_v2_ops_common.mjs";

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

function defaultVersionFromDate(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
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

function tailText(text, maxLines = 80) {
  const raw = asString(text);
  if (!raw) return "";
  return raw.split(/\r?\n/).slice(-maxLines).join("\n");
}

function hasScript(scripts, scriptName) {
  return typeof scripts?.[scriptName] === "string" && scripts[scriptName].trim().length > 0;
}

async function readPackageJson(cwd) {
  const raw = await fs.readFile(path.resolve(cwd, "package.json"), "utf-8");
  return JSON.parse(raw);
}

function runPnpm(scriptName, extraArgs = [], cwd = process.cwd(), extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const args = [scriptName, ...extraArgs];
    const out = [];
    const err = [];
    const startedAtMs = Date.now();
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
    });
    child.stdout.on("data", (chunk) => out.push(String(chunk)));
    child.stderr.on("data", (chunk) => err.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        command,
        args,
        exitCode: Number.isFinite(code) ? code : 1,
        durationMs: Date.now() - startedAtMs,
        stdout: out.join(""),
        stderr: err.join(""),
      });
    });
  });
}

function renderLog(stepName, result) {
  const commandLine = [result.command, ...result.args].join(" ");
  return [
    `# ${stepName}`,
    `command=${maskSecrets(commandLine)}`,
    `exitCode=${result.exitCode}`,
    `durationMs=${result.durationMs}`,
    "",
    "[stdout:last]",
    tailText(maskSecrets(result.stdout), 80),
    "",
    "[stderr:last]",
    tailText(maskSecrets(result.stderr), 80),
    "",
  ].join("\n");
}

async function readTextIfExists(cwd, relativePath) {
  try {
    return await fs.readFile(path.resolve(cwd, relativePath), "utf-8");
  } catch {
    return "";
  }
}

function sectionBullets(md, heading) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+/.test(line)) {
      inSection = line === `## ${heading}`;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("- ")) out.push(line.slice(2).trim());
  }
  return out;
}

function compactBullets(values, maxCount) {
  return values.map((item) => asString(item)).filter((item) => item.length > 0).slice(0, maxCount);
}

async function loadTemplateBuilder() {
  const rawModule = await tsImport("../src/lib/planning/release/finalReportTemplate.ts", { parentURL: import.meta.url });
  const resolved = rawModule?.default && typeof rawModule.default === "object" ? rawModule.default : rawModule;
  const fn = resolved?.buildFinalReportMarkdown;
  if (typeof fn !== "function") throw new Error("buildFinalReportMarkdown import failed");
  return fn;
}

async function loadRedactText() {
  try {
    const moduleRaw = await tsImport("../src/lib/planning/privacy/redact.ts", { parentURL: import.meta.url });
    const resolved = moduleRaw?.default && typeof moduleRaw.default === "object" ? moduleRaw.default : moduleRaw;
    if (typeof resolved?.redactText === "function") {
      redactTextImpl = (value) => resolved.redactText(asString(value));
    }
  } catch {
    redactTextImpl = fallbackRedactText;
  }
}

async function runGateWithLog(cwd, version, stepId, scriptName, extraEnv = {}) {
  const result = await runPnpm(scriptName, [], cwd, extraEnv);
  const logsDirAbs = path.resolve(cwd, ".data/planning/release/logs");
  await fs.mkdir(logsDirAbs, { recursive: true });
  const logFileName = `final-report-${version}-${stepId}.log`;
  const logAbs = path.resolve(logsDirAbs, logFileName);
  await writeTextAtomic(logAbs, renderLog(scriptName, result));
  return {
    result,
    logPath: path.relative(cwd, logAbs).replaceAll("\\", "/"),
  };
}

function printGate(status, stepId, note = "") {
  console.log(`[planning:v2:final-report] ${status} ${stepId}${note ? ` - ${note}` : ""}`);
}

async function main() {
  await loadRedactText();
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const version = asString(args.version) || defaultVersionFromDate();
  const baseUrl = asString(args.baseUrl);
  const pkg = await readPackageJson(cwd);
  const scripts = pkg.scripts ?? {};
  const gates = [];
  let hasFailure = false;

  if (!hasScript(scripts, "planning:v2:complete")) {
    throw new Error("required script missing: planning:v2:complete");
  }
  const complete = await runGateWithLog(cwd, version, "complete", "planning:v2:complete");
  if (complete.result.exitCode !== 0) {
    gates.push({
      id: "complete",
      status: "FAIL",
      command: "pnpm planning:v2:complete",
      logPath: complete.logPath,
      note: `exit=${complete.result.exitCode}`,
    });
    hasFailure = true;
  } else {
    gates.push({
      id: "complete",
      status: "PASS",
      command: "pnpm planning:v2:complete",
      logPath: complete.logPath,
    });
  }
  printGate(gates[gates.length - 1].status, "complete", gates[gates.length - 1].note ?? "");

  if (hasScript(scripts, "planning:v2:regress")) {
    const regress = await runGateWithLog(cwd, version, "regress", "planning:v2:regress");
    if (regress.result.exitCode !== 0) {
      gates.push({
        id: "regress",
        status: "FAIL",
        command: "pnpm planning:v2:regress",
        logPath: regress.logPath,
        note: `exit=${regress.result.exitCode}`,
      });
      hasFailure = true;
    } else {
      gates.push({
        id: "regress",
        status: "PASS",
        command: "pnpm planning:v2:regress",
        logPath: regress.logPath,
      });
    }
    printGate(gates[gates.length - 1].status, "regress", gates[gates.length - 1].note ?? "");
  }

  if (baseUrl && hasScript(scripts, "planning:v2:acceptance")) {
    const acceptance = await runGateWithLog(cwd, version, "acceptance", "planning:v2:acceptance", {
      PLANNING_BASE_URL: baseUrl,
    });
    if (acceptance.result.exitCode !== 0) {
      gates.push({
        id: "acceptance",
        status: "FAIL",
        command: `PLANNING_BASE_URL=${baseUrl} pnpm planning:v2:acceptance`,
        logPath: acceptance.logPath,
        note: `exit=${acceptance.result.exitCode}`,
      });
      hasFailure = true;
    } else {
      gates.push({
        id: "acceptance",
        status: "PASS",
        command: `PLANNING_BASE_URL=${baseUrl} pnpm planning:v2:acceptance`,
        logPath: acceptance.logPath,
      });
    }
    printGate(gates[gates.length - 1].status, "acceptance", gates[gates.length - 1].note ?? "");
  } else {
    const skippedLogRel = `.data/planning/release/logs/final-report-${version}-acceptance.log`;
    await writeTextAtomic(
      path.resolve(cwd, skippedLogRel),
      "# planning:v2:acceptance\nstatus=SKIPPED\nreason=base-url-not-provided-or-script-missing\n",
    );
    gates.push({
      id: "acceptance",
      status: "SKIPPED",
      command: "pnpm planning:v2:acceptance",
      logPath: skippedLogRel,
      note: baseUrl ? "script_not_found" : "base-url-not-provided",
    });
    printGate("SKIPPED", "acceptance", baseUrl ? "script_not_found" : "base-url-not-provided");
  }

  const buildFinalReportMarkdown = await loadTemplateBuilder();

  const doneMd = await readTextIfExists(cwd, "docs/planning-v2-done-definition.md");
  const onepageMd = await readTextIfExists(cwd, "docs/planning-v2-onepage.md");

  const doneHighlights = compactBullets([
    ...sectionBullets(doneMd, "기능 Done (사용자)"),
    ...sectionBullets(doneMd, "운영 Done (OPS)"),
    ...sectionBullets(doneMd, "품질 Done (게이트)"),
  ], 10);
  const userScope = compactBullets(sectionBullets(onepageMd, "사용자 흐름 (5줄)"), 5);
  const opsScope = compactBullets(sectionBullets(onepageMd, "운영 흐름 (5줄)"), 5);

  const releaseNotesRel = `docs/releases/planning-v2-${version}.md`;
  const releaseNotesExists = await readTextIfExists(cwd, releaseNotesRel);
  const docsIncluded = [
    "docs/planning-v2-onepage.md",
    "docs/planning-v2-user.md",
    "docs/planning-v2-ops.md",
    "docs/planning-v2-architecture.md",
    "docs/planning-v2-done-definition.md",
    "docs/planning-v2-release-checklist.md",
    SELF_TEST_DOC_PATH,
  ];

  const markdown = buildFinalReportMarkdown({
    version,
    createdAt: new Date().toISOString(),
    doneHighlights,
    userScope,
    opsScope,
    gates,
    docsIncluded,
    ...(releaseNotesExists ? { releaseNotesPath: releaseNotesRel } : {}),
    knownLimitations: [
      "확률/시나리오 결과는 가정 기반 계산이며 미래를 보장하지 않습니다.",
      "acceptance는 로컬 서버 실행(PLANNING_BASE_URL) 환경에서만 검증됩니다.",
      "snapshot 품질과 신선도에 따라 결과가 달라질 수 있습니다.",
      "includeProducts는 서버 플래그/키 상태에 따라 비활성화될 수 있습니다.",
      "개인용 로컬 전제를 기준으로 local-only 정책을 따릅니다.",
    ],
    nextCandidates: [
      "회귀 코퍼스에 사용자 페르소나별 장기/단기 혼합 시나리오 확장",
      "운영 대시보드에서 게이트 추이(주간 PASS/FAIL) 시각화",
      "스냅샷 소스 품질 점수(파싱 성공률) 기록",
      "actions/debt 문구의 가독성 A/B 점검",
      "release evidence 번들 무결성 체크섬 자동 포함",
    ],
  });

  const outRel = `docs/releases/planning-v2-final-report-${version}.md`;
  const outAbs = path.resolve(cwd, outRel);
  await fs.mkdir(path.dirname(outAbs), { recursive: true });
  await writeTextAtomic(outAbs, `${markdown.trimEnd()}\n`);
  console.log(`[planning:v2:final-report] report=${outRel}`);

  if (hasFailure) {
    throw new Error("one or more required gates failed");
  }

  console.log(`[planning:v2:final-report] User Gate (manual): complete ${SELF_TEST_DOC_PATH}`);
  console.log("✅ P97 COMPLETE — 모든 게이트 통과(테스트/스모크/가드/회귀)");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:final-report] FAIL\n${maskSecrets(message)}`);
  process.exit(1);
});
