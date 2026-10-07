import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import {
  logPruneSummary,
  pruneRootIsolatedBuildArtifacts,
  pruneRootTransientNextArtifacts,
  pruneStandaloneShadowNextArtifacts,
} from "./next_artifact_prune.mjs";
import { sanitizeInheritedColorEnv } from "./runtime_color_env.mjs";
import { ensureStandaloneRuntimeAssets } from "./standalone_runtime_assets.mjs";
import { assertPlanningStorageMode } from "./planning_storage_mode_guard.mjs";
import { verifyPlanningDesktopRuntimeStartup } from "./planning_runtime_startup.mjs";
import { spawnRegisteredPlanningWriterChild } from "./planning_writer_child.mjs";

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
  let strictPort = false;
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
    if (arg === "--strict-port") {
      strictPort = true;
      continue;
    }
    passthroughArgs.push(arg);
  }

  return { overridePort, scanRange, strictPort, passthroughArgs };
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

async function pickPort({ preferredPort, scanRange, host, strictPort }) {
  let lastError = null;
  for (let offset = 0; offset <= scanRange; offset += 1) {
    const candidate = preferredPort + offset;
    if (candidate > 65535) break;
    const listened = await canListen({ host, port: candidate });
    if (listened.ok) return candidate;
    lastError = listened.error;
    if (strictPort) break;
  }

  if (strictPort) throw lastError ?? new Error(`port ${preferredPort} is unavailable`);
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

async function main() {
  const { overridePort, scanRange, strictPort, passthroughArgs } = parseCliArgs(process.argv.slice(2));
  const standaloneRuntime = resolveStandaloneServer(process.cwd());
  const nextBin = resolveNextBin(process.cwd());

  if (!standaloneRuntime && !nextBin) {
    console.error("[next_prod_safe] no runtime found. Run `pnpm build` first.");
    process.exit(2);
    return;
  }

  await verifyPlanningDesktopRuntimeStartup({
    cwd: process.cwd(),
    env: process.env,
    bindHost: FORCED_HOST,
  });

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
  const port = await pickPort({ preferredPort, scanRange, host: FORCED_HOST, strictPort });

  const env = sanitizeInheritedColorEnv(process.env);
  delete env.HOSTNAME;
  delete env.PORT;
  env.NODE_ENV = "production";
  env.HOSTNAME = FORCED_HOST;
  env.PORT = String(port);

  if (!env.PLANNING_RUNTIME_MODE) {
    env.PLANNING_RUNTIME_MODE = "production";
  }
  assertPlanningStorageMode(env);

  console.log(`Bind: host=${FORCED_HOST} port=${port}`);
  console.log(`Open (same env): http://${FORCED_HOST}:${port}`);
  console.log(`Open (same env): http://localhost:${port}`);

  let child;
  if (standaloneRuntime) {
    ensureStandaloneRuntimeAssets({
      standaloneServer: standaloneRuntime.serverPath,
      distDir: standaloneRuntime.distDir,
      cwd: process.cwd(),
      log: (message) => console.log(message.replace("[standalone_runtime_assets]", "[next_prod_safe]")),
    });
    console.log(
      `[next_prod_safe] mode=standalone distDir=${standaloneRuntime.distDir} server=${standaloneRuntime.serverPath}`,
    );
    child = await spawnRegisteredPlanningWriterChild({
      dataRoot: env.PLANNING_WRITER_DATA_ROOT,
      capability: env.PLANNING_WRITER_LEASE_CAPABILITY,
      command: process.execPath,
      args: [standaloneRuntime.serverPath, ...passthroughArgs],
      cwd: process.cwd(),
      env,
      detached: false,
    });
  } else {
    console.log(`[next_prod_safe] mode=next-start nextBin=${nextBin}`);
    child = await spawnRegisteredPlanningWriterChild({
      dataRoot: env.PLANNING_WRITER_DATA_ROOT,
      capability: env.PLANNING_WRITER_LEASE_CAPABILITY,
      command: process.execPath,
      args: [nextBin, "start", "-H", FORCED_HOST, "-p", String(port), ...passthroughArgs],
      cwd: process.cwd(),
      env,
      detached: false,
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
