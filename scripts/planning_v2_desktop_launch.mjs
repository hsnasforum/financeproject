import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBoolean(value) {
  const normalized = asString(value).toLowerCase();
  return normalized === "1"
    || normalized === "true"
    || normalized === "yes"
    || normalized === "on"
    || normalized === "packaged"
    || normalized === "desktop";
}

function resolvePackagedDataBaseDir(platform, env) {
  if (platform === "win32") {
    const localAppData = asString(env.LOCALAPPDATA);
    const appData = asString(env.APPDATA);
    if (localAppData) return localAppData;
    if (appData) return appData;
    return path.join(os.homedir(), "AppData", "Local");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  const xdgDataHome = asString(env.XDG_DATA_HOME);
  if (xdgDataHome) return xdgDataHome;
  return path.join(os.homedir(), ".local", "share");
}

function resolveDesktopDataDir(cwd = process.cwd(), env = process.env, platform = process.platform) {
  const override = asString(env.PLANNING_DATA_DIR);
  if (override) return path.resolve(cwd, override);

  const packaged = normalizeBoolean(env.PLANNING_PACKAGED_MODE)
    || normalizeBoolean(env.PLANNING_RUNTIME_PACKAGED)
    || asString(env.PLANNING_RUNTIME_MODE).toLowerCase() === "packaged";
  if (!packaged) return path.resolve(cwd, ".data");

  const appName = asString(env.PLANNING_APP_NAME).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-").trim() || "PlanningV2";
  return path.resolve(resolvePackagedDataBaseDir(platform, env), appName);
}

function resolveRuntimeLockPath(cwd = process.cwd(), env = process.env, platform = process.platform) {
  return path.join(resolveDesktopDataDir(cwd, env, platform), "runtime", "desktop-instance.lock.json");
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code === "ESRCH") return false;
    return true;
  }
}

function parseLockPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value;
  const pid = Math.trunc(Number(row.pid));
  const baseUrl = asString(row.baseUrl);
  const targetUrl = asString(row.targetUrl);
  const openPath = asString(row.openPath);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return {
    pid,
    baseUrl,
    targetUrl,
    openPath,
  };
}

async function readLockPayload(lockPath) {
  try {
    const raw = await fs.readFile(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parseLockPayload(parsed);
  } catch {
    return null;
  }
}

async function writeLockPayload(lockPath, payload) {
  const encoded = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, encoded, "utf-8");
}

async function releaseLock(lockPath) {
  try {
    const existing = await readLockPayload(lockPath);
    if (existing && existing.pid !== process.pid) return;
    await fs.rm(lockPath, { force: true });
  } catch {
    // ignore
  }
}

async function acquireSingleInstanceLock(lockPath, initialPayload) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const payload = { ...initialPayload, pid: process.pid };
  const encoded = `${JSON.stringify(payload, null, 2)}\n`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.writeFile(lockPath, encoded, { encoding: "utf-8", flag: "wx" });
      return {
        acquired: true,
        existing: null,
      };
    } catch (error) {
      const nodeError = error;
      if (nodeError?.code !== "EEXIST") throw error;
      const existing = await readLockPayload(lockPath);
      if (existing && isProcessAlive(existing.pid)) {
        return {
          acquired: false,
          existing,
        };
      }
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }

  return {
    acquired: true,
    existing: null,
  };
}

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: 3100,
    openPath: "/planning",
    openBrowser: true,
    runtime: "prod",
    waitTimeoutMs: 90_000,
    pollMs: 500,
  };
  const readValue = (idx, inlineValue) => {
    const direct = asString(inlineValue);
    if (direct) return { value: direct, nextIndex: idx };
    const next = asString(argv[idx + 1]);
    if (next && !next.startsWith("--")) return { value: next, nextIndex: idx + 1 };
    return { value: "", nextIndex: idx };
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--no-open") {
      out.openBrowser = false;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const resolved = readValue(i, rest.join("="));
    i = resolved.nextIndex;
    const value = resolved.value;
    if (key === "host") {
      const nextHost = asString(value);
      if (nextHost) out.host = nextHost;
    } else if (key === "port") {
      out.port = toInt(value, out.port, 1, 65535);
    } else if (key === "path") {
      const nextPath = asString(value);
      if (nextPath) out.openPath = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
    } else if (key === "runtime") {
      const nextRuntime = asString(value).toLowerCase();
      if (nextRuntime === "dev" || nextRuntime === "prod") {
        out.runtime = nextRuntime;
      }
    } else if (key === "wait-timeout-ms") {
      out.waitTimeoutMs = toInt(value, out.waitTimeoutMs, 5_000, 300_000);
    } else if (key === "poll-ms") {
      out.pollMs = toInt(value, out.pollMs, 100, 10_000);
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(url, timeoutMs, pollMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "manual" });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return;
      }
    } catch {
      // wait for server
    }
    await sleep(pollMs);
  }
  throw new Error(`desktop launcher timeout waiting for ${url}`);
}

function openInDefaultBrowser(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    return;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", [url], { stdio: "ignore", detached: true });
    child.unref();
    return;
  }
  const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  child.unref();
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      done({ code, signal });
    });
  });
}

async function stopServerGracefully(child, signal = "SIGTERM", timeoutMs = 10_000) {
  if (child.exitCode !== null) return;

  try {
    if (process.platform !== "win32" && typeof child.pid === "number") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    // ignore
  }

  const graceful = await waitForExit(child, timeoutMs);
  if (graceful) return;

  try {
    if (process.platform !== "win32" && typeof child.pid === "number") {
      process.kill(-child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // ignore
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = args.runtime === "prod" ? "127.0.0.1" : args.host;
  const baseUrl = `http://${host}:${args.port}`;
  const targetUrl = `${baseUrl}${args.openPath}`;
  const lockPath = resolveRuntimeLockPath();
  const lockState = await acquireSingleInstanceLock(lockPath, {
    baseUrl,
    targetUrl,
    openPath: args.openPath,
    createdAt: new Date().toISOString(),
  });

  if (!lockState.acquired) {
    const existingUrl = lockState.existing?.targetUrl
      || `${lockState.existing?.baseUrl || baseUrl}${lockState.existing?.openPath || args.openPath}`;
    process.stdout.write(`[planning:v2:desktop:launch] already running pid=${lockState.existing?.pid ?? "unknown"}\n`);
    if (args.openBrowser) {
      openInDefaultBrowser(existingUrl);
      process.stdout.write(`[planning:v2:desktop:launch] opened existing instance ${existingUrl}\n`);
    } else {
      process.stdout.write(`[planning:v2:desktop:launch] existing instance URL ${existingUrl}\n`);
    }
    return;
  }

  const serverScript = args.runtime === "prod"
    ? "scripts/next_prod_safe.mjs"
    : "scripts/next_dev_safe.mjs";
  process.stdout.write(`[planning:v2:desktop:launch] starting runtime=${args.runtime} host=${host} port=${args.port}\n`);

  const launchArgs = args.runtime === "prod"
    ? [serverScript, "--port", String(args.port)]
    : [serverScript, "--host", args.host, "--port", String(args.port)];

  const server = spawn(process.execPath, launchArgs, {
    env: process.env,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });

  server.once("error", (error) => {
    process.stderr.write(`[planning:v2:desktop:launch] server spawn error ${error instanceof Error ? error.message : String(error)}\n`);
  });

  const earlyExit = new Promise((resolve) => {
    server.once("exit", (code, signal) => resolve({ code, signal }));
  });

  let shuttingDown = false;
  const onShutdownSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`[planning:v2:desktop:launch] shutdown signal=${signal} (graceful)\n`);
    void stopServerGracefully(server, "SIGTERM", 10_000).then(async () => {
      await releaseLock(lockPath);
      const result = await waitForExit(server, 500);
      process.exit(result?.code ?? 0);
    });
  };
  process.on("SIGINT", () => onShutdownSignal("SIGINT"));
  process.on("SIGTERM", () => onShutdownSignal("SIGTERM"));

  try {
    await Promise.race([
      waitForReady(targetUrl, args.waitTimeoutMs, args.pollMs),
      (async () => {
        const exited = await earlyExit;
        throw new Error(`server exited before ready (code=${exited.code ?? "?"}, signal=${exited.signal ?? "none"})`);
      })(),
    ]);
    await writeLockPayload(lockPath, {
      pid: process.pid,
      baseUrl,
      targetUrl,
      openPath: args.openPath,
      readyAt: new Date().toISOString(),
    });
    process.stdout.write(`[planning:v2:desktop:launch] ready ${targetUrl}\n`);
    if (args.openBrowser) {
      openInDefaultBrowser(targetUrl);
      process.stdout.write("[planning:v2:desktop:launch] browser opened\n");
    } else {
      process.stdout.write("[planning:v2:desktop:launch] browser open skipped (--no-open)\n");
    }
  } catch (error) {
    process.stderr.write(`[planning:v2:desktop:launch] failed ${error instanceof Error ? error.message : String(error)}\n`);
    await stopServerGracefully(server, "SIGTERM", 10_000);
    await releaseLock(lockPath);
    process.exit(1);
    return;
  }

  const result = await earlyExit;
  await releaseLock(lockPath);
  if ((result.code ?? 0) === 0) {
    process.exit(0);
    return;
  }
  process.exit(result.code ?? 1);
}

main().catch((error) => {
  process.stderr.write(`[planning:v2:desktop:launch] failed ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
