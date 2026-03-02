import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { buildPortCandidates, choosePort, DEFAULT_PREFERRED_PORT } from "./start_local_port.mjs";
import {
  acquireSingleInstanceLock,
  readLockFile,
  removeLockFile,
  resolveRuntimeLockPath,
  writeLockFile,
} from "./start_local_lock.mjs";

const FORCED_HOST = "127.0.0.1";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePort(value, fallback = DEFAULT_PREFERRED_PORT) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function parseArgs(argv) {
  let overridePort;
  let openExisting = true;
  const passthroughArgs = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-open-existing") {
      openExisting = false;
      continue;
    }
    if (arg === "--port" || arg === "-p") {
      if (i + 1 < argv.length) {
        overridePort = argv[i + 1];
        i += 1;
      }
      continue;
    }
    if (arg === "--host" || arg === "--hostname" || arg === "-H") {
      if (i + 1 < argv.length) i += 1;
      continue;
    }
    passthroughArgs.push(arg);
  }

  return { overridePort, passthroughArgs, openExisting };
}

function canListen(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // ignore close failures
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    server.once("error", () => {
      clearTimeout(timer);
      done(false);
    });
    server.listen({ host, port }, () => {
      clearTimeout(timer);
      done(true);
    });
  });
}

function reserveEphemeralPort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host, port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address !== "object" || typeof address.port !== "number") {
        server.close(() => reject(new Error("failed to reserve an ephemeral port")));
        return;
      }
      const chosen = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(chosen);
      });
    });
  });
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

function resolveStandaloneServer(cwd = process.cwd()) {
  const serverPath = path.join(cwd, ".next", "standalone", "server.js");
  if (fs.existsSync(serverPath)) return serverPath;
  return null;
}

function hasBuildArtifact(cwd = process.cwd()) {
  if (resolveStandaloneServer(cwd)) return true;
  return fs.existsSync(path.join(cwd, ".next", "BUILD_ID"));
}

function openInDefaultBrowser(url) {
  const target = asString(url);
  if (!target) return;
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", target], { stdio: "ignore", detached: true });
    child.unref();
    return;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", [target], { stdio: "ignore", detached: true });
    child.unref();
    return;
  }
  const child = spawn("xdg-open", [target], { stdio: "ignore", detached: true });
  child.unref();
}

async function main() {
  const { overridePort, passthroughArgs, openExisting } = parseArgs(process.argv.slice(2));
  const lockPath = resolveRuntimeLockPath();
  const startedAt = new Date().toISOString();
  let lockAcquired = false;
  let child;
  let childExited = false;
  let shuttingDown = false;

  const cleanupLock = async () => {
    if (!lockAcquired) return;
    lockAcquired = false;
    await removeLockFile(lockPath);
  };

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (child && !childExited) {
      child.kill(signal);
      return;
    }
    cleanupLock().finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const firstLock = await acquireSingleInstanceLock(lockPath, {
      pid: process.pid,
      startedAt,
      url: "",
    });
    if (!firstLock.acquired) {
      const existingUrl = asString(firstLock.url) || asString((await readLockFile(lockPath))?.url);
      const printableUrl = existingUrl || "http://127.0.0.1";
      process.stdout.write(`ALREADY_RUNNING ${printableUrl}\n`);
      if (openExisting && existingUrl) {
        openInDefaultBrowser(existingUrl);
      }
      return 0;
    }
    lockAcquired = true;

    if (!hasBuildArtifact(process.cwd())) {
      process.stderr.write("[start:local] Next production build is missing. Run `pnpm build` first.\n");
      return 2;
    }

    const preferredPort = parsePort(overridePort || process.env.PORT, DEFAULT_PREFERRED_PORT);
    const candidates = buildPortCandidates({ preferredPort });
    const selected = await choosePort(candidates, (port) => canListen(FORCED_HOST, port));
    const port = selected > 0 ? selected : await reserveEphemeralPort(FORCED_HOST);

    const standaloneServer = resolveStandaloneServer(process.cwd());
    const nextBin = standaloneServer ? null : resolveNextBin(process.cwd());
    if (!standaloneServer && !nextBin) {
      process.stderr.write("[start:local] Unable to locate Next runtime. Run `pnpm install` and `pnpm build`.\n");
      return 2;
    }

    const env = { ...process.env };
    delete env.HOSTNAME;
    delete env.PORT;
    env.HOSTNAME = FORCED_HOST;
    env.PORT = String(port);
    env.NODE_ENV = "production";
    const url = `http://${FORCED_HOST}:${port}`;

    await writeLockFile(lockPath, {
      pid: process.pid,
      startedAt,
      url,
    });
    process.stdout.write(`LISTENING ${url}\n`);

    child = standaloneServer
      ? spawn(process.execPath, [standaloneServer, ...passthroughArgs], { stdio: "inherit", env })
      : spawn(process.execPath, [nextBin, "start", "-H", FORCED_HOST, "-p", String(port), ...passthroughArgs], {
        stdio: "inherit",
        env,
      });

    const exitCode = await new Promise((resolve) => {
      child.on("exit", (code, signal) => {
        childExited = true;
        if (signal) {
          resolve(0);
          return;
        }
        resolve(code ?? 1);
      });
    });

    await cleanupLock();
    return exitCode;
  } finally {
    await cleanupLock();
  }
}

main()
  .then((code) => {
    process.exit(typeof code === "number" ? code : 0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[start:local] failed to start: ${message}\n`);
    process.exit(1);
  });
