import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { writeJsonAtomic, writeTextAtomic } from "./planning_v2_ops_common.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  let version = "";
  let out = "";
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "version") version = value;
    if (key === "out") out = value;
  }
  return { version, out };
}

function defaultVersionFromDate(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function maskSecrets(text) {
  const raw = asString(text);
  if (!raw) return "";
  return raw
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1***")
    .replace(/(ECOS_API_KEY|GITHUB_TOKEN|FINLIFE_API_KEY)\s*=\s*[^\s]+/gi, "$1=***")
    .replace(/(["']?(?:token|api[_-]?key|secret|password)["']?\s*[:=]\s*["'])[^"']+(["'])/gi, "$1***$2");
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
  const filePath = path.resolve(cwd, "package.json");
  const raw = await fs.readFile(filePath, "utf-8");
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

function runCommand(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const out = [];
    const err = [];
    const child = spawn(command, args, {
      cwd,
      env: process.env,
    });
    child.stdout.on("data", (chunk) => out.push(String(chunk)));
    child.stderr.on("data", (chunk) => err.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: Number.isFinite(code) ? code : 1,
        stdout: out.join(""),
        stderr: err.join(""),
      });
    });
  });
}

function renderLog(name, result) {
  const cmdLine = [result.command, ...result.args].join(" ");
  return [
    `# ${name}`,
    `command=${maskSecrets(cmdLine)}`,
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

async function ensureReleaseNotes(cwd, pkgScripts, version) {
  const releaseNotesRel = `docs/releases/planning-v2-${version}.md`;
  const releaseNotesAbs = path.resolve(cwd, releaseNotesRel);
  try {
    await fs.access(releaseNotesAbs);
    return releaseNotesRel;
  } catch {
    if (!hasScript(pkgScripts, "planning:v2:release:notes")) {
      throw new Error(`release notes missing and script not found: ${releaseNotesRel}`);
    }
    const result = await runPnpm("planning:v2:release:notes", ["--", `--version=${version}`], cwd);
    if (result.exitCode !== 0) {
      throw new Error(`planning:v2:release:notes failed (exit=${result.exitCode})`);
    }
    return releaseNotesRel;
  }
}

async function copyFileSafe(srcAbs, dstAbs) {
  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  await fs.copyFile(srcAbs, dstAbs);
}

async function buildBundleTree(cwd, version, releaseNotesRel, paths, checks, finalCheckRel, outPathAbs) {
  const releaseRootAbs = path.resolve(cwd, ".data/planning/release");
  const stageRootAbs = path.resolve(releaseRootAbs, `_bundle-staging-${Date.now()}`);
  const bundleDirName = `planning-v2-evidence-${version}`;
  const bundleRootAbs = path.resolve(stageRootAbs, bundleDirName);
  await fs.mkdir(bundleRootAbs, { recursive: true });

  const includeRelPaths = [
    "docs/planning-v2-onepage.md",
    "docs/planning-v2-user.md",
    "docs/planning-v2-ops.md",
    "docs/planning-v2-architecture.md",
    "docs/planning-v2-release-checklist.md",
    "docs/planning-v2-done-definition.md",
    releaseNotesRel,
    ".env.local.example",
    "scripts/planning_v2_seed_demo.mjs",
    paths.completeLogRel,
    paths.acceptanceLogRel,
    finalCheckRel,
  ];

  for (const relPath of includeRelPaths) {
    const srcAbs = path.resolve(cwd, relPath);
    const dstAbs = path.resolve(bundleRootAbs, relPath);
    await copyFileSafe(srcAbs, dstAbs);
  }

  const pkg = await readPackageJson(cwd);
  const scriptEntries = Object.entries(pkg.scripts ?? {})
    .filter(([key]) => key.startsWith("planning:v2:") || key === "planning:assumptions:sync")
    .sort(([a], [b]) => a.localeCompare(b));
  const configSnapshot = {
    generatedAt: new Date().toISOString(),
    version,
    planningScripts: Object.fromEntries(scriptEntries),
    featureFlags: {
      defaults: {
        debugEnabled: false,
        ecosEnabled: true,
        monteCarloEnabled: true,
        includeProductsEnabled: false,
      },
      envKeys: [
        "PLANNING_DEBUG_ENABLED",
        "ECOS_ENABLED",
        "PLANNING_MONTE_CARLO_ENABLED",
        "PLANNING_INCLUDE_PRODUCTS_ENABLED",
      ],
    },
    checks,
  };

  const configSnapshotRel = "bundle/config-snapshot.json";
  await writeJsonAtomic(path.resolve(bundleRootAbs, configSnapshotRel), configSnapshot);

  const manifest = {
    version: 1,
    bundleVersion: version,
    createdAt: new Date().toISOString(),
    output: path.relative(cwd, outPathAbs).replaceAll("\\", "/"),
    includedFiles: includeRelPaths,
    configSnapshot: configSnapshotRel,
  };
  await writeJsonAtomic(path.resolve(bundleRootAbs, "bundle/manifest.json"), manifest);

  await fs.mkdir(path.dirname(outPathAbs), { recursive: true });
  const tarResult = await runCommand("tar", ["-czf", outPathAbs, "-C", stageRootAbs, bundleDirName], cwd);
  if (tarResult.exitCode !== 0) {
    throw new Error(`tar archive failed: ${tailText(maskSecrets(`${tarResult.stdout}\n${tarResult.stderr}`), 40)}`);
  }
  await fs.rm(stageRootAbs, { recursive: true, force: true });
}

async function main() {
  const cwd = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const version = asString(args.version) || defaultVersionFromDate();
  const outRel = asString(args.out) || `.data/planning/release/planning-v2-evidence-${version}.tar.gz`;
  const outPathAbs = path.resolve(cwd, outRel);

  const pkg = await readPackageJson(cwd);
  const scripts = pkg.scripts ?? {};
  const releaseNotesRel = await ensureReleaseNotes(cwd, scripts, version);

  const releaseRootAbs = path.resolve(cwd, ".data/planning/release");
  const logsDirAbs = path.resolve(releaseRootAbs, "logs");
  await fs.mkdir(logsDirAbs, { recursive: true });

  const completeLogAbs = path.resolve(logsDirAbs, "complete.log");
  const acceptanceLogAbs = path.resolve(logsDirAbs, "acceptance.log");
  const completeLogRel = path.relative(cwd, completeLogAbs).replaceAll("\\", "/");
  const acceptanceLogRel = path.relative(cwd, acceptanceLogAbs).replaceAll("\\", "/");

  const checks = {
    complete: { ran: false, ok: null, log: completeLogRel, note: "" },
    acceptance: { ran: false, ok: null, log: acceptanceLogRel, note: "" },
  };

  if (hasScript(scripts, "planning:v2:complete")) {
    const completeResult = await runPnpm("planning:v2:complete", [], cwd);
    checks.complete = {
      ran: true,
      ok: completeResult.exitCode === 0,
      log: completeLogRel,
      note: completeResult.exitCode === 0 ? "" : `exit=${completeResult.exitCode}`,
    };
    await writeTextAtomic(completeLogAbs, renderLog("planning:v2:complete", completeResult));
  } else {
    checks.complete.note = "script_not_found";
    await writeTextAtomic(completeLogAbs, "# planning:v2:complete\nstatus=SKIPPED\nreason=script_not_found\n");
  }

  const baseUrl = asString(process.env.PLANNING_BASE_URL);
  if (!hasScript(scripts, "planning:v2:acceptance")) {
    checks.acceptance.note = "script_not_found";
    await writeTextAtomic(acceptanceLogAbs, "# planning:v2:acceptance\nstatus=SKIPPED\nreason=script_not_found\n");
  } else if (!baseUrl) {
    checks.acceptance.note = "requires_running_server";
    await writeTextAtomic(acceptanceLogAbs, "# planning:v2:acceptance\nstatus=SKIPPED\nreason=PLANNING_BASE_URL_missing\n");
  } else {
    const acceptanceResult = await runPnpm("planning:v2:acceptance", [], cwd, { PLANNING_BASE_URL: baseUrl });
    checks.acceptance = {
      ran: true,
      ok: acceptanceResult.exitCode === 0,
      log: acceptanceLogRel,
      note: acceptanceResult.exitCode === 0 ? "" : `exit=${acceptanceResult.exitCode}`,
    };
    await writeTextAtomic(acceptanceLogAbs, renderLog("planning:v2:acceptance", acceptanceResult));
  }

  const finalCheck = {
    version,
    createdAt: new Date().toISOString(),
    checks: {
      complete: {
        ran: checks.complete.ran,
        ok: checks.complete.ok,
        log: checks.complete.log,
        ...(checks.complete.note ? { note: checks.complete.note } : {}),
      },
      acceptance: {
        ran: checks.acceptance.ran,
        ok: checks.acceptance.ok,
        log: checks.acceptance.log,
        ...(checks.acceptance.note ? { note: checks.acceptance.note } : {}),
      },
    },
  };
  const finalCheckAbs = path.resolve(releaseRootAbs, "FINAL_CHECK.json");
  await writeJsonAtomic(finalCheckAbs, finalCheck);
  const finalCheckRel = path.relative(cwd, finalCheckAbs).replaceAll("\\", "/");

  await buildBundleTree(
    cwd,
    version,
    releaseNotesRel,
    {
      completeLogRel,
      acceptanceLogRel,
    },
    checks,
    finalCheckRel,
    outPathAbs,
  );

  const outRelPath = path.relative(cwd, outPathAbs).replaceAll("\\", "/");
  console.log(`[planning:v2:release:evidence] releaseNotes=${releaseNotesRel}`);
  console.log(`[planning:v2:release:evidence] finalCheck=${finalCheckRel}`);
  console.log(`[planning:v2:release:evidence] bundle=${outRelPath}`);

  if (checks.complete.ok !== true) {
    throw new Error("planning:v2:complete failed or was skipped; evidence bundle created with failure status");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[planning:v2:release:evidence] FAIL\n${maskSecrets(message)}`);
  process.exit(1);
});

