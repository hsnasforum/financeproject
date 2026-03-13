import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  logPruneSummary,
  pruneRootIsolatedBuildArtifacts,
  pruneRootTransientNextArtifacts,
  pruneStandaloneShadowNextArtifacts,
} from "./next_artifact_prune.mjs";
import { sanitizeInheritedColorEnv } from "./runtime_color_env.mjs";

const FORCED_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;
const DEFAULT_SCAN_RANGE = 30;
const FALLBACK_BUILD_DIST_DIR = (process.env.BUILD_FALLBACK_DIST_DIR ?? ".next-build").trim() || ".next-build";

function parsePort(value, fallback = DEFAULT_PORT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intPort = Math.trunc(parsed);
  if (intPort < 1 || intPort > 65535) return fallback;
  return intPort;
}

function parseCliArgs(argv) {
  let overridePort;
  let scanRange = DEFAULT_SCAN_RANGE;
  const passthroughArgs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host" || arg === "--hostname" || arg === "-H") {
      // production mode always forces loopback host.
      if (i + 1 < argv.length) i += 1;
      continue;
    }
    if (arg === "--port" || arg === "-p") {
      if (i + 1 < argv.length) {
        overridePort = argv[i + 1];
        i += 1;
      }
      continue;
    }
    if (arg.startsWith("--scan-range=")) {
      const raw = arg.slice("--scan-range=".length);
      const parsed = Math.trunc(Number(raw));
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 500) {
        scanRange = parsed;
      }
      continue;
    }
    passthroughArgs.push(arg);
  }

  return { overridePort, scanRange, passthroughArgs };
}

function canListen({ host, port, timeoutMs = 1_200 }) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      done({ ok: false, error: new Error(`listen timeout ${host}:${port}`) });
    }, timeoutMs);

    server.once("error", (error) => {
      clearTimeout(timer);
      done({ ok: false, error });
    });
    server.listen({ host, port }, () => {
      clearTimeout(timer);
      done({ ok: true });
    });
  });
}

function reserveRandomPort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address !== "object" || typeof address.port !== "number") {
        server.close(() => reject(new Error("failed to reserve random port")));
        return;
      }
      const port = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function pickPort({ preferredPort, scanRange, host }) {
  let lastError = null;
  for (let offset = 0; offset <= scanRange; offset += 1) {
    const candidate = preferredPort + offset;
    if (candidate > 65535) break;
    const listened = await canListen({ host, port: candidate });
    if (listened.ok) return candidate;
    lastError = listened.error;
  }

  const randomPort = await reserveRandomPort(host);
  if (typeof randomPort === "number" && randomPort > 0) return randomPort;
  throw lastError ?? new Error("no available port");
}

function parentDirs(startDir, limit = 8) {
  const dirs = [];
  let current = path.resolve(startDir);
  for (let i = 0; i < limit; i += 1) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

function resolveNextBin(startDir) {
  const require = createRequire(import.meta.url);
  const candidateModules = ["next/dist/bin/next", "next/dist/bin/next.js"];
  const searchDirs = parentDirs(startDir, 8);

  for (const dir of searchDirs) {
    for (const candidate of candidateModules) {
      try {
        return require.resolve(candidate, { paths: [dir] });
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

function readIsolatedBuildInfo(cwd = process.cwd()) {
  const infoPath = path.join(cwd, ".next-build-info.json");
  if (!fs.existsSync(infoPath)) return "";

  try {
    const raw = fs.readFileSync(infoPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && typeof parsed.distDir === "string" ? parsed.distDir.trim() : "";
  } catch {
    return "";
  }
}

function resolveStandaloneServer(cwd = process.cwd()) {
  const requestedDistDir = typeof process.env.PLAYWRIGHT_DIST_DIR === "string" ? process.env.PLAYWRIGHT_DIST_DIR.trim() : "";
  const metadataDistDir = readIsolatedBuildInfo(cwd);
  const candidates = [requestedDistDir, metadataDistDir, ".next", FALLBACK_BUILD_DIST_DIR];
  const seen = new Set();

  for (const distDir of candidates) {
    if (!distDir || seen.has(distDir)) continue;
    seen.add(distDir);
    const serverPath = path.join(cwd, distDir, "standalone", "server.js");
    if (fs.existsSync(serverPath)) {
      return { distDir, serverPath };
    }
  }

  return null;
}

function sameResolvedPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

function ensureStandaloneAssetLink({ sourcePath, targetPath, label }) {
  if (!fs.existsSync(sourcePath)) return;

  if (fs.existsSync(targetPath) || fs.lstatSync(targetPath, { throwIfNoEntry: false })) {
    if (sameResolvedPath(sourcePath, targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(fs.realpathSync(sourcePath), targetPath, linkType);
  console.log(`[next_prod_safe] linked ${label}: ${targetPath} -> ${sourcePath}`);
}

function ensureStandaloneRuntimeAssets({ standaloneServer, distDir, cwd = process.cwd() }) {
  const standaloneDir = path.dirname(standaloneServer);
  const distDirPath = path.join(cwd, distDir);

  ensureStandaloneAssetLink({
    sourcePath: path.join(distDirPath, "static"),
    targetPath: path.join(standaloneDir, distDir, "static"),
    label: `${distDir}/static`,
  });

  ensureStandaloneAssetLink({
    sourcePath: path.join(cwd, "public"),
    targetPath: path.join(standaloneDir, "public"),
    label: "public",
  });
}

async function main() {
  const { overridePort, scanRange, passthroughArgs } = parseCliArgs(process.argv.slice(2));
  const standaloneRuntime = resolveStandaloneServer(process.cwd());
  const nextBin = resolveNextBin(process.cwd());

  if (!standaloneRuntime && !nextBin) {
    console.error("[next_prod_safe] no runtime found. Run `pnpm build` first.");
    process.exit(2);
    return;
  }

  if (standaloneRuntime) {
    logPruneSummary(
      "[next_prod_safe] standalone prune",
      pruneStandaloneShadowNextArtifacts({
        cwd: process.cwd(),
        distDir: standaloneRuntime.distDir,
        preserveNames: [standaloneRuntime.distDir],
        ignorePids: [process.ppid],
      }),
    );
    logPruneSummary(
      "[next_prod_safe] root prune",
      pruneRootTransientNextArtifacts({
        cwd: process.cwd(),
        preserveNames: [standaloneRuntime.distDir],
        ignorePids: [process.ppid],
      }),
    );
    logPruneSummary(
      "[next_prod_safe] root build prune",
      pruneRootIsolatedBuildArtifacts({
        cwd: process.cwd(),
        preserveNames: [standaloneRuntime.distDir],
        ignorePids: [process.ppid],
      }),
    );
  }

  const preferredPort = parsePort(overridePort ?? process.env.PORT, DEFAULT_PORT);
  const port = await pickPort({ preferredPort, scanRange, host: FORCED_HOST });

  const env = sanitizeInheritedColorEnv(process.env);
  delete env.HOSTNAME;
  delete env.PORT;
  env.HOSTNAME = FORCED_HOST;
  env.PORT = String(port);

  if (!env.PLANNING_RUNTIME_MODE) {
    env.PLANNING_RUNTIME_MODE = "production";
  }

  console.log(`Bind: host=${FORCED_HOST} port=${port}`);
  console.log(`Open (same env): http://${FORCED_HOST}:${port}`);
  console.log(`Open (same env): http://localhost:${port}`);

  let child;
  if (standaloneRuntime) {
    ensureStandaloneRuntimeAssets({
      standaloneServer: standaloneRuntime.serverPath,
      distDir: standaloneRuntime.distDir,
      cwd: process.cwd(),
    });
    console.log(
      `[next_prod_safe] mode=standalone distDir=${standaloneRuntime.distDir} server=${standaloneRuntime.serverPath}`,
    );
    child = spawn(process.execPath, [standaloneRuntime.serverPath, ...passthroughArgs], {
      stdio: "inherit",
      env,
    });
  } else {
    console.log(`[next_prod_safe] mode=next-start nextBin=${nextBin}`);
    child = spawn(process.execPath, [nextBin, "start", "-H", FORCED_HOST, "-p", String(port), ...passthroughArgs], {
      stdio: "inherit",
      env,
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[next_prod_safe] failed to start:", message);
  process.exit(1);
});
