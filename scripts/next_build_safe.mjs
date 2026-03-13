import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  hasRepoNextDevProcess,
  logPruneSummary,
  pruneRootIsolatedBuildArtifacts,
  pruneRootTransientNextArtifacts,
  pruneStandaloneDataArtifactsForBuildPreflight,
  pruneStandaloneShadowNextArtifacts,
} from "./next_artifact_prune.mjs";
import { sanitizeInheritedColorEnv } from "./runtime_color_env.mjs";

const fallbackDistDir = (process.env.BUILD_FALLBACK_DIST_DIR ?? ".next-build").trim() || ".next-build";
const buildHeartbeatMs = Number.parseInt(process.env.NEXT_BUILD_HEARTBEAT_MS ?? "", 10) || 20_000;

function hasRepoNextProcess(projectRoot, matcher) {
  try {
    const result = spawnSync("ps", ["-eo", "args="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0) return false;
    return String(result.stdout ?? "")
      .split(/\r?\n/)
      .some((line) => line.includes(projectRoot) && matcher(line));
  } catch {
    return false;
  }
}

function hasRepoNextBuildProcess(projectRoot) {
  return hasRepoNextProcess(projectRoot, (line) => line.includes("next/dist/bin/next build"));
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const projectRoot = process.cwd();
const defaultLockPath = path.join(projectRoot, ".next", "lock");
const isolatedBuildInfoPath = path.join(projectRoot, ".next-build-info.json");
const rootTsconfigPath = path.join(projectRoot, "tsconfig.json");
const env = sanitizeInheritedColorEnv(process.env);
let isolatedServerDir = "";
let effectiveDistDir = ".next";
let generatedTsconfigPath = "";
let rootTsconfigBackup = "";
let keepSharedDevBuildPackage = false;

function clearIsolatedBuildInfo() {
  try {
    fs.rmSync(isolatedBuildInfoPath, { force: true });
  } catch {
    // ignore stale metadata cleanup failures
  }
}

function clearGeneratedTsconfig() {
  if (!generatedTsconfigPath) return;
  try {
    fs.rmSync(generatedTsconfigPath, { force: true });
  } catch {
    // ignore generated config cleanup failures
  }
}

function backupRootTsconfig() {
  if (rootTsconfigBackup) return;
  try {
    rootTsconfigBackup = fs.readFileSync(rootTsconfigPath, "utf8");
  } catch {
    rootTsconfigBackup = "";
  }
}

function restoreRootTsconfig() {
  if (!rootTsconfigBackup) return;
  try {
    fs.writeFileSync(rootTsconfigPath, rootTsconfigBackup);
  } catch {
    // ignore root tsconfig restore failures
  }
}

function writeIsolatedBuildInfo(distDir) {
  if (!distDir || distDir === ".next") {
    clearIsolatedBuildInfo();
    return;
  }

  try {
    fs.writeFileSync(
      isolatedBuildInfoPath,
      `${JSON.stringify({ distDir, updatedAt: new Date().toISOString() })}\n`,
      "utf8",
    );
  } catch {
    // ignore metadata write failures; the build output is still the source of truth
  }
}

function removeDistDir(distDir) {
  fs.rmSync(path.join(projectRoot, distDir), {
    recursive: true,
    force: true,
    maxRetries: 6,
    retryDelay: 250,
  });
}

function resolveIsolatedDistDir(baseDistDir) {
  try {
    removeDistDir(baseDistDir);
    return baseDistDir;
  } catch (error) {
    const cleanupError = error instanceof Error ? error.message : String(error);
    const rotatedDistDir = `${baseDistDir}-${process.pid}`;
    removeDistDir(rotatedDistDir);
    console.warn(
      `[next_build_safe] ${baseDistDir} 정리 실패(${cleanupError})로 ${rotatedDistDir} 로 우회합니다.`,
    );
    return rotatedDistDir;
  }
}

function resolveConcurrentBuildDistDir(baseDistDir) {
  return resolveIsolatedDistDir(`${baseDistDir}-${process.pid}`);
}

function createGeneratedTsconfigPath(distDir) {
  const safeDistDir = distDir.replace(/[\/]+/g, "-");
  return path.join(projectRoot, `${safeDistDir}-tsconfig.json`);
}

function readRootTsconfig() {
  const raw = fs.readFileSync(rootTsconfigPath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function isGeneratedTypesInclude(entry) {
  return typeof entry === "string" && entry.startsWith(".next") && entry.includes("/types/**/*.ts");
}

function ensureIsolatedTsconfig(distDir) {
  const parsed = readRootTsconfig();
  const baseInclude = Array.isArray(parsed.include) ? parsed.include.filter((entry) => !isGeneratedTypesInclude(entry)) : [];
  const nextTsconfig = {
    ...parsed,
    include: [
      ...baseInclude,
      `${distDir}/types/**/*.ts`,
      `${distDir}/dev/types/**/*.ts`,
    ],
  };

  generatedTsconfigPath = createGeneratedTsconfigPath(distDir);
  fs.writeFileSync(generatedTsconfigPath, `${JSON.stringify(nextTsconfig, null, 2)}\n`, "utf8");
  return path.relative(projectRoot, generatedTsconfigPath);
}

function ensureScaffoldFile(filePath, contents, sourcePath = "") {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (sourcePath && fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, filePath);
    return;
  }

  fs.writeFileSync(filePath, contents);
}

function ensureSharedDevBuildPackageScaffold() {
  const sharedDevDir = path.join(projectRoot, ".next", "dev");
  if (!fs.existsSync(sharedDevDir)) return;

  ensureScaffoldFile(
    path.join(sharedDevDir, "build", "package.json"),
    '{\n  "type": "commonjs"\n}\n',
    path.join(sharedDevDir, "package.json"),
  );
}

function ensureIsolatedBuildScaffold(distDir) {
  if (!distDir) return;

  const serverDir = path.join(distDir, "server");
  const typesDir = path.join(distDir, "types");

  ensureScaffoldFile(
    path.join(serverDir, "pages-manifest.json"),
    '{\n  "/404": "pages/404.html",\n  "/500": "pages/500.html"\n}\n',
    path.join(projectRoot, ".next", "server", "pages-manifest.json"),
  );
  ensureScaffoldFile(
    path.join(serverDir, "interception-route-rewrite-manifest.js"),
    'self.__INTERCEPTION_ROUTE_REWRITE_MANIFEST="[]";\n',
    path.join(projectRoot, ".next", "server", "interception-route-rewrite-manifest.js"),
  );
  ensureScaffoldFile(
    path.join(typesDir, "routes.d.ts"),
    [
      "// This file is generated automatically by Next.js",
      "// Do not edit this file manually",
      "",
      "type AppRoutes = never",
      "type AppRouteHandlerRoutes = never",
      "type PageRoutes = never",
      "type LayoutRoutes = never",
      "type RedirectRoutes = never",
      "type RewriteRoutes = never",
      "type Routes = never",
      "",
      "interface ParamMap {}",
      "",
      "export type ParamsOf<Route extends Routes> = ParamMap[Route]",
      "export type { AppRoutes, PageRoutes, LayoutRoutes, RedirectRoutes, RewriteRoutes, ParamMap, AppRouteHandlerRoutes }",
      "",
    ].join("\n"),
    path.join(projectRoot, ".next", "types", "routes.d.ts"),
  );
  ensureScaffoldFile(
    path.join(typesDir, "validator.ts"),
    [
      "// This file is generated automatically by Next.js",
      "// Do not edit this file manually",
      "export {}",
      "",
    ].join("\n"),
    path.join(projectRoot, ".next", "types", "validator.ts"),
  );
}

if (!env.PLAYWRIGHT_DIST_DIR) {
  const hasSharedLock = fs.existsSync(defaultLockPath);
  const hasRepoDev = hasRepoNextDevProcess(projectRoot);
  const hasRepoBuild = hasRepoNextBuildProcess(projectRoot);
  keepSharedDevBuildPackage = hasRepoDev;

  if (hasSharedLock && !hasRepoDev && !hasRepoBuild) {
    try {
      fs.rmSync(defaultLockPath, { force: true });
      console.log("[next_build_safe] stale .next/lock 을 정리하고 기본 build 를 계속합니다.");
    } catch {
      // ignore stale lock cleanup failures and let next decide whether it can proceed
    }
  }

  if (hasRepoBuild) {
    clearIsolatedBuildInfo();
    backupRootTsconfig();
    env.PLAYWRIGHT_DIST_DIR = resolveConcurrentBuildDistDir(fallbackDistDir);
    if (!env.PLAYWRIGHT_TSCONFIG_PATH) {
      env.PLAYWRIGHT_TSCONFIG_PATH = ensureIsolatedTsconfig(env.PLAYWRIGHT_DIST_DIR);
    }
    isolatedServerDir = path.join(projectRoot, env.PLAYWRIGHT_DIST_DIR, "server");
    ensureIsolatedBuildScaffold(path.join(projectRoot, env.PLAYWRIGHT_DIST_DIR));
    console.log(`[next_build_safe] active repo build 감지로 ${env.PLAYWRIGHT_DIST_DIR} 로 분리 build 합니다.`);
  } else if (hasRepoDev) {
    clearIsolatedBuildInfo();
    backupRootTsconfig();
    env.PLAYWRIGHT_DIST_DIR = resolveIsolatedDistDir(fallbackDistDir);
    if (!env.PLAYWRIGHT_TSCONFIG_PATH) {
      env.PLAYWRIGHT_TSCONFIG_PATH = ensureIsolatedTsconfig(env.PLAYWRIGHT_DIST_DIR);
    }
    isolatedServerDir = path.join(projectRoot, env.PLAYWRIGHT_DIST_DIR, "server");
    ensureIsolatedBuildScaffold(path.join(projectRoot, env.PLAYWRIGHT_DIST_DIR));
    console.log(`[next_build_safe] shared .next 사용 중이라 ${env.PLAYWRIGHT_DIST_DIR} 로 분리 build 합니다.`);
  }
}

if (!keepSharedDevBuildPackage) {
  keepSharedDevBuildPackage = hasRepoNextDevProcess(projectRoot);
}

if (keepSharedDevBuildPackage) {
  ensureSharedDevBuildPackageScaffold();
}

if (!isolatedServerDir && env.PLAYWRIGHT_DIST_DIR?.trim()) {
  isolatedServerDir = path.join(projectRoot, env.PLAYWRIGHT_DIST_DIR.trim(), "server");
}

if (env.PLAYWRIGHT_DIST_DIR?.trim()) {
  effectiveDistDir = env.PLAYWRIGHT_DIST_DIR.trim();
}

if (!hasRepoNextDevProcess(projectRoot)) {
  logPruneSummary(
    "[next_build_safe] root pre-prune",
    pruneRootTransientNextArtifacts({
      cwd: projectRoot,
      preserveNames: [effectiveDistDir, env.PLAYWRIGHT_DIST_DIR?.trim() ?? ""],
      ignorePids: [process.ppid],
    }),
  );
}

logPruneSummary(
  "[next_build_safe] root build pre-prune",
  pruneRootIsolatedBuildArtifacts({
    cwd: projectRoot,
    preserveNames: [effectiveDistDir, env.PLAYWRIGHT_DIST_DIR?.trim() ?? ""],
    ignorePids: [process.ppid],
  }),
);

logPruneSummary(
  "[next_build_safe] root build preflight",
  pruneStandaloneDataArtifactsForBuildPreflight({
    cwd: projectRoot,
    distDirs: [effectiveDistDir, env.PLAYWRIGHT_DIST_DIR?.trim() ?? ""],
    ignorePids: [process.ppid],
  }),
);

function readBuildStage() {
  try {
    const diagnosticsPath = path.join(projectRoot, effectiveDistDir, "diagnostics", "build-diagnostics.json");
    if (!fs.existsSync(diagnosticsPath)) return null;
    const raw = fs.readFileSync(diagnosticsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.buildStage === "string" && parsed.buildStage
      ? parsed.buildStage
      : null;
  } catch {
    return null;
  }
}

const child = spawn(process.execPath, [nextBin, "build", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "pipe"],
  env,
});
let childExited = false;
let forwardedParentSignal = "";

let lastOutputAt = Date.now();
const buildStartedAt = lastOutputAt;

function forwardOutput(target, chunk) {
  lastOutputAt = Date.now();
  target.write(chunk);
}

child.stdout?.on("data", (chunk) => {
  forwardOutput(process.stdout, chunk);
});

child.stderr?.on("data", (chunk) => {
  forwardOutput(process.stderr, chunk);
});

const scaffoldTimer = isolatedServerDir || keepSharedDevBuildPackage
  ? setInterval(() => {
    try {
      if (isolatedServerDir) {
        ensureIsolatedBuildScaffold(path.join(projectRoot, effectiveDistDir));
      }
      if (keepSharedDevBuildPackage) {
        ensureSharedDevBuildPackageScaffold();
      }
    } catch {
      // ignore transient distDir churn while next rebuilds isolated output
    }
  }, 250)
  : null;

const heartbeatTimer = Number.isFinite(buildHeartbeatMs) && buildHeartbeatMs > 0
  ? setInterval(() => {
    const now = Date.now();
    const elapsedSec = Math.max(1, Math.round((now - buildStartedAt) / 1000));
    const silentSec = Math.max(1, Math.round((now - lastOutputAt) / 1000));
    const stage = readBuildStage();
    const stageSuffix = stage ? ` stage=${stage}` : "";
    console.log(`[next_build_safe] build 진행 중... elapsed=${elapsedSec}s silent=${silentSec}s distDir=${effectiveDistDir}${stageSuffix}`);
  }, buildHeartbeatMs)
  : null;

function clearScaffoldTimer() {
  if (scaffoldTimer) clearInterval(scaffoldTimer);
}

function clearHeartbeatTimer() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
}

function terminateChild(signal = "SIGTERM") {
  if (childExited || child.killed) return;
  try {
    child.kill(signal);
  } catch {
    // ignore cleanup failures during parent shutdown
  }
}

const signalHandlers = new Map();

function relayParentSignal(signal) {
  if (forwardedParentSignal) return;
  forwardedParentSignal = signal;
  const handler = signalHandlers.get(signal);
  if (handler) {
    process.off(signal, handler);
  }
  process.kill(process.pid, signal);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  const handler = () => {
    clearScaffoldTimer();
    clearHeartbeatTimer();
    terminateChild(signal);
    if (childExited) {
      relayParentSignal(signal);
      return;
    }

    const relayTimer = setTimeout(() => {
      relayParentSignal(signal);
    }, 250);
    relayTimer.unref?.();
    child.once("exit", () => {
      clearTimeout(relayTimer);
      relayParentSignal(signal);
    });
  };

  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

process.on("exit", () => {
  clearScaffoldTimer();
  clearHeartbeatTimer();
  restoreRootTsconfig();
  clearGeneratedTsconfig();
  terminateChild("SIGTERM");
});

child.on("exit", (code, signal) => {
  childExited = true;
  clearScaffoldTimer();
  clearHeartbeatTimer();
  restoreRootTsconfig();
  clearGeneratedTsconfig();
  if (typeof code === "number" && code === 0) {
    logPruneSummary(
      "[next_build_safe] standalone prune",
      pruneStandaloneShadowNextArtifacts({
        cwd: projectRoot,
        distDir: effectiveDistDir,
        preserveNames: [effectiveDistDir],
        ignorePids: [process.ppid],
      }),
    );
    logPruneSummary(
      "[next_build_safe] root prune",
      pruneRootTransientNextArtifacts({
        cwd: projectRoot,
        preserveNames: [effectiveDistDir, env.PLAYWRIGHT_DIST_DIR?.trim() ?? ""],
        ignorePids: [process.ppid],
      }),
    );
    logPruneSummary(
      "[next_build_safe] root build prune",
      pruneRootIsolatedBuildArtifacts({
        cwd: projectRoot,
        preserveNames: [effectiveDistDir, env.PLAYWRIGHT_DIST_DIR?.trim() ?? ""],
        ignorePids: [process.ppid],
      }),
    );
    writeIsolatedBuildInfo(effectiveDistDir);
  } else {
    clearIsolatedBuildInfo();
  }
  if (forwardedParentSignal) {
    return;
  }
  if (typeof code === "number") {
    process.exit(code);
    return;
  }
  process.kill(process.pid, signal ?? "SIGTERM");
});

child.on("error", (error) => {
  clearScaffoldTimer();
  clearHeartbeatTimer();
  restoreRootTsconfig();
  clearGeneratedTsconfig();
  console.error("[next_build_safe] next build 실행 실패", error);
  process.exit(1);
});
