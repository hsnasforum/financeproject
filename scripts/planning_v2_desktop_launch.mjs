import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { assertFinlifeIdentityReady } from "../src/lib/finlife/sqliteIdentityMigration.mjs";
import {
  acquirePlanningWriterLease,
  verifyPlanningWriterLeaseCapability,
} from "../src/lib/planning/deployment/writerLease.mjs";
import {
  inspectPlanningDataRoot,
  resolvePlanningControlRoot,
  resolvePlanningDatabaseFacts,
  resolvePlanningDataRoot,
} from "../src/lib/planning/deployment/runtimeRoot.mjs";
import {
  assertPlanningSqliteSchema,
  resolvePlanningSqliteDatabase,
} from "../src/lib/planning/deployment/runtimeDatabase.mjs";
import {
  assertPlanningRuntimePolicy,
  PLANNING_RUNTIME_ATTESTATION,
} from "../src/lib/planning/deployment/runtimePolicy.mjs";
import {
  createPlanningDesktopSessionBootstrap,
  issuePlanningDesktopSessionBootstrap,
  PLANNING_E2E_DESKTOP_SHUTDOWN_MESSAGE,
} from "./planning_desktop_session_server.mjs";
import {
  requestRegisteredPlanningWriterChildShutdown,
  spawnRegisteredPlanningWriterChild,
} from "./planning_writer_child.mjs";
import {
  loadPlanningDesktopEnvironment,
  PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS,
} from "./planning_v2_desktop_env.mjs";
import {
  assertManagedDesktopDatabasePath,
  resolveProspectiveDesktopCanonicalPath,
} from "./planning_desktop_install_state.mjs";
import { openInDefaultBrowser } from "./planning_desktop_browser.mjs";
import { captureLauncherReadyTimeout, emitReadyDiag } from "./planning_ready_timeout_diag.mjs";

const E2E_BOOTSTRAP_FILE_ENV = "PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE";
const E2E_DATABASE_URL_ENV = "PLANNING_E2E_DESKTOP_DATABASE_URL";
const E2E_DATA_DIR_ENV = "PLANNING_E2E_DESKTOP_DATA_DIR";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function resolveRuntimeLockPath(controlRoot) {
  return path.join(controlRoot, "runtime", "desktop-instance.lock.json");
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
  const brokerUrl = asString(row.brokerUrl);
  const issueCapability = asString(row.issueCapability);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return {
    pid,
    baseUrl,
    targetUrl,
    openPath,
    brokerUrl,
    issueCapability,
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
  const temporaryPath = `${lockPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporaryPath, encoded, {
      encoding: "utf-8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, lockPath);
    await fs.chmod(lockPath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function publishAutomationBootstrapUrl(controlRoot, bootstrapUrl) {
  const outputValue = asString(process.env[E2E_BOOTSTRAP_FILE_ENV]);
  if (!outputValue) return;
  const e2eToken = asString(process.env.PLANNING_E2E_DESKTOP_SESSION_TOKEN);
  if (!/^[A-Za-z0-9_-]{43,}$/.test(e2eToken)) {
    throw new Error(`${E2E_BOOTSTRAP_FILE_ENV} requires PLANNING_E2E_DESKTOP_SESSION_TOKEN`);
  }
  // controlRoot is canonical (realpath), so compare against the canonical output path too:
  // Windows temp paths may use 8.3 short names and other hosts may reach temp through a symlink.
  const outputPath = await resolveProspectiveDesktopCanonicalPath(outputValue);
  const relative = path.relative(controlRoot, outputPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${E2E_BOOTSTRAP_FILE_ENV} must stay inside the desktop control root`);
  }
  const temporaryPath = `${outputPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await fs.writeFile(temporaryPath, `${bootstrapUrl}\n`, {
      encoding: "utf-8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, outputPath);
    await fs.chmod(outputPath, 0o600);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.writeFile(lockPath, encoded, { encoding: "utf-8", flag: "wx", mode: 0o600 });
      await fs.chmod(lockPath, 0o600);
      return {
        acquired: true,
        existing: null,
      };
    } catch (error) {
      const nodeError = error;
      if (nodeError?.code !== "EEXIST") throw error;
      let existing = null;
      for (let readAttempt = 0; readAttempt < 10; readAttempt += 1) {
        existing = await readLockPayload(lockPath);
        if (existing) break;
        await sleep(50);
      }
      if (existing && isProcessAlive(existing.pid)) {
        return {
          acquired: false,
          existing,
        };
      }
      await fs.rm(lockPath, { force: true }).catch(() => undefined);
    }
  }

  throw new Error("desktop launcher could not acquire the single-instance lock");
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

async function waitForExistingInstanceBroker(lockPath, initialLock, timeoutMs, pollMs) {
  const expectedPid = initialLock?.pid;
  const startedAt = Date.now();
  let current = initialLock;
  while (Date.now() - startedAt < timeoutMs) {
    if (current?.pid === expectedPid && current.brokerUrl && current.issueCapability) {
      return current;
    }
    if (!isProcessAlive(expectedPid)) {
      throw new Error("existing desktop instance exited before its session broker became ready");
    }
    await sleep(pollMs);
    current = await readLockPayload(lockPath);
    if (current && current.pid !== expectedPid) {
      throw new Error("desktop instance ownership changed while waiting for its session broker");
    }
  }
  throw new Error("existing desktop instance session broker did not become ready in time");
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

async function runWindowsTaskkill(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  await new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      taskkill.kill("SIGKILL");
      resolve();
    }, 5_000);
    taskkill.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
    taskkill.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForRegisteredWriterChildrenToExit(runtime, lease, timeoutMs = 5_000) {
  if (!runtime || !lease) return;
  const startedAt = Date.now();
  let alive = [];
  while (Date.now() - startedAt < timeoutMs) {
    const current = await verifyPlanningWriterLeaseCapability({
      dataRoot: runtime.controlRoot,
      capability: lease.capability,
    });
    alive = current.childPids.filter(isProcessAlive);
    if (alive.length === 0) return;
    await sleep(100);
  }
  throw new Error(`desktop writer descendants remained alive after shutdown: ${alive.join(",")}`);
}

async function stopServerGracefully(child, signal = "SIGTERM", timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  requestRegisteredPlanningWriterChildShutdown(child, signal);

  const graceful = await waitForExit(child, timeoutMs);
  if (graceful) return;

  if (process.platform === "win32" && typeof child.pid === "number") {
    await runWindowsTaskkill(child.pid);
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
  await waitForExit(child, 5_000);
}

function assertUnsetOrAllowed(env, key, allowedValues) {
  const value = asString(env[key]);
  if (!value) return;
  if (!allowedValues.has(value.toLowerCase())) {
    throw new Error(`desktop-local conflicts with ${key}`);
  }
}

function assertDesktopLauncherEnvironment(env) {
  const requestedMode = asString(env.PLANNING_DEPLOYMENT_MODE);
  if (requestedMode && requestedMode !== "desktop-local") {
    throw new Error(`unsupported planning deployment mode: ${requestedMode}`);
  }
  assertUnsetOrAllowed(env, "PLANNING_SINGLE_USER_MODE", new Set(["1", "true", "yes", "on"]));
  assertUnsetOrAllowed(env, "PLANNING_NAMESPACE_ENABLED", new Set(["0", "false", "no", "off"]));
  assertUnsetOrAllowed(env, "PLANNING_TRUST_AUTH_HEADERS", new Set(["0", "false", "no", "off"]));
  assertUnsetOrAllowed(env, "PLANNING_FORWARDED_HEADERS_TRUSTED", new Set(["0", "false", "no", "off"]));
  const database = resolvePlanningDatabaseFacts(env);
  if (database.databaseProvider !== "sqlite" || database.databaseConnection !== "file") {
    throw new Error("desktop-local supports only a local SQLite file database");
  }
  return database;
}

async function prepareDesktopRuntime() {
  const databaseFacts = assertDesktopLauncherEnvironment(process.env);
  const rootEnv = { ...process.env, NODE_ENV: "production" };
  const databaseLocation = resolvePlanningSqliteDatabase({ cwd: process.cwd(), env: rootEnv });
  await assertManagedDesktopDatabasePath({
    installDir: process.cwd(),
    databasePath: databaseLocation.databasePath,
    allowExternal: Boolean(
      asString(process.env[E2E_BOOTSTRAP_FILE_ENV])
      && asString(process.env[E2E_DATABASE_URL_ENV]),
    ),
  });
  const configuredPlanningRoot = resolvePlanningDataRoot({ cwd: process.cwd(), env: rootEnv });
  const configuredControlRoot = resolvePlanningControlRoot({ cwd: process.cwd(), env: rootEnv });
  const [planningRoot, controlRoot, databaseRoot] = await Promise.all([
    inspectPlanningDataRoot({ dataRoot: configuredPlanningRoot }),
    inspectPlanningDataRoot({ dataRoot: configuredControlRoot }),
    inspectPlanningDataRoot({ dataRoot: path.dirname(databaseLocation.databasePath) }),
  ]);
  if (
    planningRoot.dataRootKind !== "local"
    || controlRoot.dataRootKind !== "local"
    || databaseRoot.dataRootKind !== "local"
  ) {
    throw new Error(
      `desktop-local requires verified local storage (planning=${planningRoot.dataRootKind}, app=${controlRoot.dataRootKind}, database=${databaseRoot.dataRootKind})`,
    );
  }
  if (path.dirname(planningRoot.dataRoot) !== controlRoot.dataRoot) {
    throw new Error("desktop-local data root crosses a symlink or app-root boundary");
  }
  return {
    planningRoot: planningRoot.dataRoot,
    controlRoot: controlRoot.dataRoot,
    database: {
      ...databaseFacts,
      ...databaseLocation,
    },
  };
}

function createDesktopChildEnvironment(runtime, lease, sessionToken) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: runtime.database.databaseUrl,
    PLANNING_DATA_DIR: runtime.planningRoot,
    PLANNING_DEPLOYMENT_MODE: "desktop-local",
    PLANNING_RUNTIME_BIND_HOST: "127.0.0.1",
    PLANNING_PROXY_MODE: "none",
    PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
    PLANNING_TRUST_AUTH_HEADERS: "false",
    PLANNING_DESKTOP_IDENTITY_MODE: "desktop-local-session",
    PLANNING_DESKTOP_IDENTITY_PROVENANCE: "launcher-process",
    PLANNING_DESKTOP_IDENTITY_READY: "true",
    PLANNING_PROCESS_MODEL: "single",
    PLANNING_WRITER_EXCLUSIVITY: "data-root-exclusive",
    PLANNING_SINGLE_USER_MODE: "true",
    PLANNING_NAMESPACE_ENABLED: "false",
    PLANNING_DATA_ROOT_KIND: "local",
    PLANNING_DATABASE_PROVIDER: runtime.database.databaseProvider,
    PLANNING_DATABASE_CONNECTION: runtime.database.databaseConnection,
    PLANNING_RUNTIME_ATTESTATION,
    PLANNING_DESKTOP_SESSION_TOKEN: sessionToken,
    PLANNING_USER_ID: "default",
    PLANNING_AUTH_REQUIRED: "true",
    PLANNING_RUNTIME_MODE: "production",
    PLANNING_WRITER_DATA_ROOT: runtime.controlRoot,
    PLANNING_WRITER_LEASE_CAPABILITY: lease.capability,
    PLANNING_WRITER_ENTRYPOINT_ID: "runtime.desktop",
  };
  assertPlanningRuntimePolicy(env);
  return env;
}

async function main() {
  const e2eDatabaseUrl = asString(process.env[E2E_DATABASE_URL_ENV]);
  const e2eDataDir = asString(process.env[E2E_DATA_DIR_ENV]);
  await loadPlanningDesktopEnvironment({
    cwd: process.cwd(),
    env: process.env,
    authoritativeKeys: PLANNING_DESKTOP_RUNTIME_CONFIG_ENV_KEYS,
  });
  if (asString(process.env[E2E_BOOTSTRAP_FILE_ENV])) {
    if (e2eDatabaseUrl) process.env.DATABASE_URL = e2eDatabaseUrl;
    if (e2eDataDir) process.env.PLANNING_DATA_DIR = e2eDataDir;
  }
  const args = parseArgs(process.argv.slice(2));
  if (args.runtime !== "prod") {
    throw new Error("desktop-local supports only the production runtime; use `pnpm dev` for development");
  }
  const host = "127.0.0.1";
  const baseUrl = `http://${host}:${args.port}`;
  const targetUrl = `${baseUrl}${args.openPath}`;
  const runtime = await prepareDesktopRuntime();
  const lockPath = resolveRuntimeLockPath(runtime.controlRoot);
  const lockState = await acquireSingleInstanceLock(lockPath, {
    baseUrl,
    targetUrl,
    openPath: args.openPath,
    createdAt: new Date().toISOString(),
  });

  if (!lockState.acquired) {
    process.stdout.write(`[planning:v2:desktop:launch] already running pid=${lockState.existing?.pid ?? "unknown"}\n`);
    let bootstrapUrl;
    try {
      const existing = await waitForExistingInstanceBroker(
        lockPath,
        lockState.existing,
        args.waitTimeoutMs,
        args.pollMs,
      );
      bootstrapUrl = await issuePlanningDesktopSessionBootstrap({
        brokerUrl: existing.brokerUrl,
        issueCapability: existing.issueCapability,
      });
      await publishAutomationBootstrapUrl(runtime.controlRoot, bootstrapUrl);
    } catch (error) {
      process.stderr.write(
        `[planning:v2:desktop:launch] failed to issue authenticated bootstrap for existing instance: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
      return;
    }
    if (args.openBrowser) {
      await openInDefaultBrowser(bootstrapUrl);
      process.stdout.write("[planning:v2:desktop:launch] browser launch requested for existing instance\n");
    } else {
      process.stdout.write("[planning:v2:desktop:launch] browser open skipped (--no-open)\n");
    }
    return;
  }

  let lease;
  let sessionBootstrap;
  let server;
  let serverStartup;
  let earlyExit;
  let e2eShutdownHandler = null;
  let cleanupPromise = null;
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      if (e2eShutdownHandler) {
        process.off("message", e2eShutdownHandler);
        e2eShutdownHandler = null;
      }
      await sessionBootstrap?.close().catch(() => undefined);
      await waitForRegisteredWriterChildrenToExit(runtime, lease);
      await lease?.release().catch(() => undefined);
      await releaseLock(lockPath);
    })();
    return cleanupPromise;
  };
  let shuttingDown = false;
  const onShutdownSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`[planning:v2:desktop:launch] shutdown signal=${signal} (graceful)\n`);
    void (async () => {
      try {
        const activeServer = server ?? await serverStartup?.catch(() => null);
        if (activeServer) await stopServerGracefully(activeServer, "SIGTERM", 10_000);
        const result = activeServer ? await waitForExit(activeServer, 500) : null;
        await cleanup();
        process.exit(result?.code ?? 0);
      } catch (error) {
        process.stderr.write(
          `[planning:v2:desktop:launch] shutdown failed ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exit(1);
      }
    })();
  };
  process.on("SIGINT", () => onShutdownSignal("SIGINT"));
  process.on("SIGTERM", () => onShutdownSignal("SIGTERM"));

  try {
    // A secondary launch only asks the already-running primary for a fresh
    // authenticated bootstrap URL. Schema readiness is therefore a primary
    // startup preflight and must not prevent that recovery path.
    lease = await acquirePlanningWriterLease({
      dataRoot: runtime.controlRoot,
      writerId: "runtime.desktop",
    });
    assertFinlifeIdentityReady({ cwd: process.cwd(), databasePath: runtime.database.databasePath });
    assertPlanningSqliteSchema({ databasePath: runtime.database.databasePath });
    const e2eSessionToken = asString(process.env.PLANNING_E2E_DESKTOP_SESSION_TOKEN);
    if (e2eSessionToken && !/^[A-Za-z0-9_-]{43,}$/.test(e2eSessionToken)) {
      throw new Error("PLANNING_E2E_DESKTOP_SESSION_TOKEN must be a high-entropy base64url token");
    }
    if (e2eSessionToken && typeof process.send === "function") {
      e2eShutdownHandler = (message) => {
        if (
          !message
          || typeof message !== "object"
          || message.type !== PLANNING_E2E_DESKTOP_SHUTDOWN_MESSAGE
          || message.token !== e2eSessionToken
        ) return;
        onShutdownSignal("E2E_IPC");
      };
      process.on("message", e2eShutdownHandler);
    }
    const sessionToken = e2eSessionToken || randomBytes(32).toString("base64url");
    const env = createDesktopChildEnvironment(runtime, lease, sessionToken);
    sessionBootstrap = await createPlanningDesktopSessionBootstrap({
      targetUrl,
      sessionToken,
      issueInitialBootstrap: false,
    });
    process.stdout.write(`[planning:v2:desktop:launch] starting runtime=prod host=${host} port=${args.port}\n`);
    serverStartup = spawnRegisteredPlanningWriterChild({
      dataRoot: runtime.controlRoot,
      capability: lease.capability,
      command: process.execPath,
      args: ["scripts/next_prod_safe.mjs", "--port", String(args.port), "--strict-port"],
      cwd: process.cwd(),
      env,
    });
    server = await serverStartup;
    emitReadyDiag("LA_SERVER_STARTUP_RESOLVED", { target: server.pid });
    earlyExit = new Promise((resolve) => {
      server.once("exit", (code, signal) => resolve({ code, signal }));
    });
    await Promise.race([
      waitForReady(targetUrl, args.waitTimeoutMs, args.pollMs),
      (async () => {
        const exited = await earlyExit;
        throw new Error(`server exited before ready (code=${exited.code ?? "?"}, signal=${exited.signal ?? "none"})`);
      })(),
    ]);
    emitReadyDiag("LA_READY_REACHED", { target: server.pid });
    const bootstrapUrl = await sessionBootstrap.issueBootstrapUrl();
    await writeLockPayload(lockPath, {
      pid: process.pid,
      baseUrl,
      targetUrl,
      openPath: args.openPath,
      brokerUrl: sessionBootstrap.brokerUrl,
      issueCapability: sessionBootstrap.issueCapability,
      readyAt: new Date().toISOString(),
    });
    await publishAutomationBootstrapUrl(runtime.controlRoot, bootstrapUrl);
    process.stdout.write(`[planning:v2:desktop:launch] ready ${targetUrl}\n`);
    if (args.openBrowser) {
      await openInDefaultBrowser(bootstrapUrl);
      process.stdout.write("[planning:v2:desktop:launch] browser launch requested\n");
    } else {
      process.stdout.write("[planning:v2:desktop:launch] browser open skipped (--no-open)\n");
    }
  } catch (error) {
    process.stderr.write(`[planning:v2:desktop:launch] failed ${error instanceof Error ? error.message : String(error)}\n`);
    // #306: acts only for waitForReady's own deadline error; one immediate
    // bounded snapshot before the unchanged graceful stop. It never throws.
    captureLauncherReadyTimeout({ error, targetUrl, port: args.port, server });
    if (server) await stopServerGracefully(server, "SIGTERM", 10_000);
    await cleanup();
    process.exit(1);
    return;
  }

  const result = await earlyExit;
  await cleanup();
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
