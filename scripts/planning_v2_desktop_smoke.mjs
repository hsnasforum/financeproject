import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PLANNING_E2E_DESKTOP_SHUTDOWN_MESSAGE } from "./planning_desktop_session_server.mjs";
import { preparePlanningSmokeDatabase } from "./planning_smoke_database.mjs";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const out = {
    appDir: process.cwd(),
    port: 3210,
    timeoutMs: 90_000,
    useInstalledDatabase: false,
  };
  for (const token of argv) {
    if (token === "--use-installed-database") {
      out.useInstalledDatabase = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rawRest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = rawRest.join("=");
    if (key === "app-dir") out.appDir = asString(value) || out.appDir;
    if (key === "port") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) out.port = parsed;
    }
    if (key === "timeout-ms") {
      const parsed = Math.trunc(Number(value));
      if (Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 300_000) out.timeoutMs = parsed;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return false;
    return true;
  }
}

async function waitForPidsToExit(pids, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const alive = pids.filter(isPidAlive);
    if (alive.length === 0) return;
    await sleep(100);
  }
  throw new Error(`desktop writer descendants remained alive after shutdown: ${pids.filter(isPidAlive).join(",")}`);
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

async function requestE2EShutdown(child, token) {
  if (!token || !child.connected || typeof child.send !== "function") return false;
  return new Promise((resolve) => {
    try {
      child.send({
        type: PLANNING_E2E_DESKTOP_SHUTDOWN_MESSAGE,
        token,
      }, (error) => resolve(!error));
    } catch {
      resolve(false);
    }
  });
}

export async function stopServer(child, e2eSessionToken = "") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const controlRequested = await requestE2EShutdown(child, e2eSessionToken);
  if (!controlRequested && process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // ignore
    }
  } else if (!controlRequested) {
    child.kill("SIGTERM");
  }
  const graceful = await waitForExit(child, 15_000);
  if (graceful) return;

  if (process.platform === "win32" && typeof child.pid === "number") {
    await runWindowsTaskkill(child.pid);
  } else if (typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // ignore
    }
  } else {
    child.kill("SIGKILL");
  }
  const forced = await waitForExit(child, 5_000);
  if (!forced) throw new Error("desktop launcher did not exit after forced shutdown");
}

async function runDesktopLauncherOnce({ appDir, env, port }) {
  const bootstrapOutputPath = asString(env.PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE);
  if (!bootstrapOutputPath) {
    throw new Error("secondary desktop launcher smoke requires a bootstrap output file");
  }
  await fs.rm(bootstrapOutputPath, { force: true });
  const child = spawn(process.execPath, [
    "scripts/planning_v2_desktop_launch.mjs",
    "--runtime",
    "prod",
    "--port",
    String(port),
    "--no-open",
  ], {
    cwd: appDir,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout = `${stdout}${String(chunk)}`.slice(-16_000);
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-16_000);
  });
  const result = await waitForExit(child, 15_000);
  if (!result) {
    await stopServer(child);
    throw new Error("secondary desktop launcher did not exit after bootstrap issuance");
  }
  const bootstrapUrl = await fs.readFile(bootstrapOutputPath, "utf8")
    .then(asString)
    .catch(() => "");
  await fs.rm(bootstrapOutputPath, { force: true });
  return { ...result, stdout, stderr, bootstrapUrl };
}

function parseSetCookie(rawSetCookie) {
  const line = asString(rawSetCookie);
  if (!line) return null;
  const first = line.split(";", 1)[0] || "";
  const eqIndex = first.indexOf("=");
  if (eqIndex < 1) return null;
  const key = first.slice(0, eqIndex).trim();
  const value = first.slice(eqIndex + 1).trim();
  if (!key) return null;
  return { key, value };
}

function setCookieFromHeaders(headers, jar) {
  const values = [];
  if (typeof headers.getSetCookie === "function") {
    values.push(...headers.getSetCookie());
  } else {
    const single = headers.get("set-cookie");
    if (single) values.push(single);
  }
  for (const raw of values) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    jar[parsed.key] = parsed.value;
  }
}

function toCookieHeader(jar) {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function request(baseUrl, input, jar) {
  const url = `${baseUrl}${input.path}`;
  const headers = {
    origin: baseUrl,
    referer: `${baseUrl}/planning`,
    ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
    ...input.headers,
  };
  const cookie = toCookieHeader(jar);
  if (cookie) headers.cookie = cookie;

  const response = await fetch(url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    redirect: "manual",
    cache: "no-store",
  });
  setCookieFromHeaders(response.headers, jar);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function buildSmokeProfile() {
  return {
    monthlyIncomeNet: 4_600_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 2_000_000,
    investmentAssets: 6_000_000,
    debts: [
      {
        id: "desktop-smoke-loan-1",
        name: "Desktop Smoke Loan",
        balance: 8_000_000,
        minimumPayment: 250_000,
        aprPct: 5.1,
        remainingMonths: 48,
      },
    ],
    goals: [
      {
        id: "desktop-smoke-goal-1",
        name: "Emergency",
        targetAmount: 12_000_000,
        targetMonth: 12,
        priority: 5,
      },
    ],
  };
}

async function waitForPlanning(baseUrl, timeoutMs, jar = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const cookie = toCookieHeader(jar);
      const res = await fetch(`${baseUrl}/planning`, {
        cache: "no-store",
        headers: cookie ? { cookie } : undefined,
      });
      if (res.ok) {
        const html = await res.text();
        if (html.includes("planning-profile-form") || html.includes("/planning")) {
          return;
        }
      }
    } catch {
      // wait for server
    }
    await sleep(500);
  }
  throw new Error(`planning page did not respond within ${timeoutMs}ms`);
}

export async function runDesktopSmokeCleanup(options) {
  const failures = [];
  try {
    await options.stop();
  } catch (error) {
    failures.push(error);
  }
  try {
    await options.wait();
  } catch (error) {
    failures.push(error);
  }
  const leaseStillExists = await fs.access(options.leasePath)
    .then(() => true)
    .catch(() => false);
  try {
    await fs.rm(options.smokeRoot, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
  if (leaseStillExists) {
    failures.push(new Error("desktop writer lease remained after launcher shutdown"));
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, "desktop smoke cleanup failed");
  }
}

async function runDesktopSmokeWithRoot({ args, appDir, baseUrl, jar, smokeRoot }) {
  const smokeDatabase = args.useInstalledDatabase
    ? null
    : await preparePlanningSmokeDatabase({
        appDir,
        databasePath: path.join(smokeRoot, "database", "finance.db"),
      });
  const bootstrapOutputPath = path.join(smokeRoot, "runtime", "e2e-bootstrap.url");
  const childEnv = {
    ...process.env,
    NODE_ENV: "production",
    ...(smokeDatabase ? { PLANNING_E2E_DESKTOP_DATABASE_URL: smokeDatabase.databaseUrl } : {}),
    PLANNING_AUTH_REQUIRED: "true",
    PLANNING_DEPLOYMENT_MODE: "desktop-local",
    PLANNING_E2E_DESKTOP_DATA_DIR: path.join(smokeRoot, "planning"),
    PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
    PLANNING_NAMESPACE_ENABLED: "false",
    PLANNING_PACKAGED_MODE: process.env.PLANNING_PACKAGED_MODE || "1",
    PLANNING_RUNTIME_MODE: "packaged-smoke",
    PLANNING_SINGLE_USER_MODE: "true",
    PLANNING_TRUST_AUTH_HEADERS: "false",
    PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: bootstrapOutputPath,
    PLANNING_E2E_DESKTOP_SESSION_TOKEN: "s".repeat(43),
  };
  delete childEnv.DATABASE_URL;
  delete childEnv.PLANNING_APP_NAME;
  delete childEnv.PLANNING_DATA_DIR;

  let exited = null;
  let bootstrapUrl = "";
  let registeredWriterPids = [];
  const server = spawn(process.execPath, [
    "scripts/planning_v2_desktop_launch.mjs",
    "--runtime",
    "prod",
    "--port",
    String(args.port),
    "--no-open",
  ], {
    cwd: appDir,
    env: childEnv,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  server.on("exit", (code, signal) => {
    exited = { code, signal };
  });

  server.stdout.on("data", (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[desktop-smoke][launcher] ${text}`);
  });
  server.stderr.on("data", (chunk) => {
    process.stderr.write(`[desktop-smoke][launcher] ${String(chunk)}`);
  });

  let operationError = null;
  try {
    const startedAt = Date.now();
    while (true) {
      if (exited && exited.code !== 0) {
        throw new Error(`desktop server exited before ready (code=${exited.code ?? "?"}, signal=${exited.signal ?? "none"})`);
      }
      bootstrapUrl = await fs.readFile(bootstrapOutputPath, "utf8")
        .then(asString)
        .catch(() => "");
      if (bootstrapUrl) break;
      if (Date.now() - startedAt > args.timeoutMs) {
        throw new Error(`desktop launcher did not publish a session bootstrap within ${args.timeoutMs}ms`);
      }
      await sleep(300);
    }
    await fs.rm(bootstrapOutputPath, { force: true });

    const bootstrap = await fetch(bootstrapUrl, { cache: "no-store", redirect: "manual" });
    setCookieFromHeaders(bootstrap.headers, jar);
    if (bootstrap.status !== 303 || bootstrap.headers.get("location") !== `${baseUrl}/planning`) {
      throw new Error(`desktop session bootstrap failed: ${bootstrap.status}`);
    }
    if (!jar["planning.desktop-session"]) {
      throw new Error("desktop session bootstrap did not set the process-lifetime cookie");
    }
    await waitForPlanning(baseUrl, args.timeoutMs, jar);
    const catalogApi = await fetch(`${baseUrl}/api/products/unified?kind=deposit&limit=1`, {
      cache: "no-store",
      headers: { cookie: toCookieHeader(jar) },
    });
    const catalogPayload = await catalogApi.json().catch(() => null);
    if (!catalogApi.ok || catalogPayload?.ok !== true || !Array.isArray(catalogPayload?.data?.items)) {
      throw new Error(`desktop product catalog contract failed: ${catalogApi.status}`);
    }
    const catalogPage = await fetch(`${baseUrl}/products/catalog`, {
      cache: "no-store",
      headers: { cookie: toCookieHeader(jar) },
    });
    const catalogHtml = await catalogPage.text();
    if (!catalogPage.ok || !catalogHtml.includes("통합 상품 탐색")) {
      throw new Error(`desktop product catalog page failed: ${catalogPage.status}`);
    }
    const invalidShutdownDelivered = await requestE2EShutdown(server, "x".repeat(43));
    if (!invalidShutdownDelivered) {
      throw new Error("desktop launcher did not accept the negative IPC control probe");
    }
    await sleep(100);
    if (exited || !isPidAlive(server.pid)) {
      throw new Error("desktop launcher accepted an invalid IPC shutdown token");
    }
    const desktopLockPath = path.join(smokeRoot, "runtime", "desktop-instance.lock.json");
    const desktopLockSource = await fs.readFile(desktopLockPath, "utf8");
    const desktopLockPayload = JSON.parse(desktopLockSource);
    const desktopLockStats = await fs.lstat(desktopLockPath);
    if (!desktopLockStats.isFile() || desktopLockStats.isSymbolicLink()) {
      throw new Error("desktop instance lock must be a regular non-link file");
    }
    if (process.platform !== "win32" && (desktopLockStats.mode & 0o077) !== 0) {
      throw new Error("desktop instance lock must be readable only by its owner");
    }
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(asString(desktopLockPayload.brokerUrl))
      || !/^[A-Za-z0-9_-]{43,}$/.test(asString(desktopLockPayload.issueCapability))
    ) {
      throw new Error("desktop instance lock is missing the authenticated loopback broker contract");
    }
    if (desktopLockSource.includes(childEnv.PLANNING_E2E_DESKTOP_SESSION_TOKEN)) {
      throw new Error("desktop instance lock exposed the desktop session token");
    }

    const secondary = await runDesktopLauncherOnce({ appDir, env: childEnv, port: args.port });
    const secondaryBootstrapUrl = secondary.bootstrapUrl;
    if (secondary.code !== 0 || !secondaryBootstrapUrl) {
      throw new Error(`secondary desktop launcher failed to issue a bootstrap: ${secondary.stderr || secondary.stdout}`);
    }
    if (
      secondary.stdout.includes(childEnv.PLANNING_E2E_DESKTOP_SESSION_TOKEN)
      || secondary.stderr.includes(childEnv.PLANNING_E2E_DESKTOP_SESSION_TOKEN)
      || secondary.stdout.includes(desktopLockPayload.issueCapability)
      || secondary.stderr.includes(desktopLockPayload.issueCapability)
      || secondary.stdout.includes("/bootstrap?nonce=")
      || secondary.stderr.includes("/bootstrap?nonce=")
    ) {
      throw new Error("secondary desktop launcher output exposed a session secret");
    }
    const recoveredJar = {};
    const recoveredBootstrap = await fetch(secondaryBootstrapUrl, { cache: "no-store", redirect: "manual" });
    setCookieFromHeaders(recoveredBootstrap.headers, recoveredJar);
    if (recoveredBootstrap.status !== 303 || !recoveredJar["planning.desktop-session"]) {
      throw new Error("secondary desktop launcher bootstrap did not restore authentication");
    }
    await waitForPlanning(baseUrl, args.timeoutMs, recoveredJar);
    const recoveredProfiles = await request(
      baseUrl,
      { method: "GET", path: "/api/planning/v2/profiles" },
      recoveredJar,
    );
    if (!recoveredProfiles.response.ok || recoveredProfiles.payload?.ok !== true) {
      throw new Error("secondary desktop launcher cookie did not authenticate a protected API");
    }

    const invalidBrokerPayload = {
      ...desktopLockPayload,
      brokerUrl: "http://localhost:1",
    };
    await fs.writeFile(desktopLockPath, `${JSON.stringify(invalidBrokerPayload, null, 2)}\n`, { mode: 0o600 });
    await fs.chmod(desktopLockPath, 0o600);
    const rejectedSecondary = await runDesktopLauncherOnce({ appDir, env: childEnv, port: args.port });
    await fs.writeFile(desktopLockPath, desktopLockSource, { mode: 0o600 });
    await fs.chmod(desktopLockPath, 0o600);
    if (
      rejectedSecondary.code === 0
      || rejectedSecondary.bootstrapUrl
      || rejectedSecondary.stdout.includes(`${baseUrl}/planning`)
      || rejectedSecondary.stdout.includes("session bootstrap")
    ) {
      throw new Error("secondary desktop launcher must fail closed when broker validation fails");
    }

    const leasePath = path.join(smokeRoot, "runtime", "writer-lease.json");
    const leasePayload = JSON.parse(await fs.readFile(leasePath, "utf8"));
    registeredWriterPids = Array.isArray(leasePayload.childPids) ? leasePayload.childPids : [];
    if (leasePayload.writerId !== "runtime.desktop" || registeredWriterPids.length < 4) {
      throw new Error("desktop writer lease did not register the complete runtime process tree");
    }
    if (registeredWriterPids.some((pid) => !isPidAlive(pid))) {
      throw new Error("desktop writer lease contains a runtime process that is not alive");
    }

    const status = await request(baseUrl, { method: "GET", path: "/api/ops/security/status" }, jar);
    if (status.response.status === 404) {
      process.stdout.write("[planning:v2:desktop:smoke] ok production-only vault status route hidden\n");
    } else if (!status.response.ok || !status.payload?.ok) {
      throw new Error(`vault status failed: ${status.response.status}`);
    } else {
      const csrf = asString(status.payload.csrfToken);
      const vault = status.payload?.data ?? {};
      if (vault.configured && vault.unlocked !== true) {
        const passphrase = asString(process.env.PLANNING_VAULT_PASSPHRASE);
        if (!passphrase) {
          throw new Error("vault is locked; set PLANNING_VAULT_PASSPHRASE for smoke unlock");
        }
        const unlock = await request(
          baseUrl,
          {
            method: "POST",
            path: "/api/ops/security/unlock",
            body: {
              csrf,
              passphrase,
            },
          },
          jar,
        );
        if (!unlock.response.ok || !unlock.payload?.ok) {
          throw new Error(`vault unlock failed: ${unlock.response.status}`);
        }
      }
    }

    const opsDoctorPage = await fetch(`${baseUrl}/ops/doctor`, {
      cache: "no-store",
      redirect: "manual",
      headers: { cookie: toCookieHeader(jar) },
    });
    if (!opsDoctorPage.ok) {
      throw new Error(`ops doctor page failed: ${opsDoctorPage.status}`);
    }

    const doctorApi = await request(
      baseUrl,
      { method: "GET", path: "/api/ops/doctor" },
      jar,
    );
    if (doctorApi.response.status !== 404 || doctorApi.payload?.error?.code !== "NOT_FOUND") {
      throw new Error(`production-hidden ops doctor api boundary failed: ${doctorApi.response.status}`);
    }
    process.stdout.write("[planning:v2:desktop:smoke] ok production-hidden ops doctor api boundary\n");

    const profiles = await request(baseUrl, { method: "GET", path: "/api/planning/v2/profiles" }, jar);
    if (!profiles.response.ok || !profiles.payload?.ok || !Array.isArray(profiles.payload.data)) {
      throw new Error(`profiles list failed: ${profiles.response.status} ${JSON.stringify(profiles.payload)}`);
    }

    let profileId = asString(profiles.payload.data[0]?.id);
    if (!profileId) {
      const created = await request(
        baseUrl,
        {
          method: "POST",
          path: "/api/planning/v2/profiles",
          body: {
            name: `Desktop Smoke ${Date.now()}`,
            profile: buildSmokeProfile(),
          },
        },
        jar,
      );
      if (!created.response.ok || !created.payload?.ok) {
        throw new Error(`profile create failed: ${created.response.status}`);
      }
      profileId = asString(created.payload.data?.id);
    }

    if (!profileId) {
      throw new Error("profile id is empty");
    }

    const run = await request(
      baseUrl,
      {
        method: "POST",
        path: "/api/planning/v2/runs",
        body: {
          profileId,
          input: {
            horizonMonths: 12,
          },
        },
      },
      jar,
    );
    if (!run.response.ok || !run.payload?.ok) {
      throw new Error(`run create failed: ${run.response.status}`);
    }
    const runId = asString(run.payload.data?.id);
    if (!runId) {
      throw new Error("run id missing");
    }

    const reportsPage = await fetch(`${baseUrl}/planning/reports?runId=${encodeURIComponent(runId)}`, {
      cache: "no-store",
      headers: { cookie: toCookieHeader(jar) },
    });
    if (!reportsPage.ok) {
      throw new Error(`reports page failed: ${reportsPage.status}`);
    }

    const reportHtml = await fetch(`${baseUrl}/api/planning/v2/runs/${encodeURIComponent(runId)}/report`, {
      cache: "no-store",
      headers: {
        cookie: toCookieHeader(jar),
        origin: baseUrl,
        referer: `${baseUrl}/planning/reports?runId=${encodeURIComponent(runId)}`,
      },
    });
    if (!reportHtml.ok) {
      throw new Error(`run report endpoint failed: ${reportHtml.status}`);
    }

    const exportHtml = await fetch(`${baseUrl}/api/planning/reports/${encodeURIComponent(runId)}/export.html`, {
      cache: "no-store",
      redirect: "manual",
      headers: { cookie: toCookieHeader(jar) },
    });
    if (!exportHtml.ok) {
      throw new Error(`export html endpoint failed: ${exportHtml.status}`);
    }
    const exportText = await exportHtml.text();
    if (!exportText.includes("Executive Summary")) {
      throw new Error("export html missing Executive Summary");
    }

    process.stdout.write(`[planning:v2:desktop:smoke] PASS runId=${runId}\n`);
  } catch (error) {
    operationError = error;
  } finally {
    try {
      await runDesktopSmokeCleanup({
        stop: () => stopServer(server, childEnv.PLANNING_E2E_DESKTOP_SESSION_TOKEN),
        wait: () => waitForPidsToExit(registeredWriterPids),
        leasePath: path.join(smokeRoot, "runtime", "writer-lease.json"),
        smokeRoot,
      });
    } catch (cleanupError) {
      if (operationError) {
        throw new AggregateError([operationError, cleanupError], "desktop smoke and cleanup failed");
      }
      throw cleanupError;
    }
  }
  if (operationError) throw operationError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(args.appDir);
  const baseUrl = `http://127.0.0.1:${args.port}`;
  const jar = {};
  const smokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-smoke-"));
  try {
    await runDesktopSmokeWithRoot({ args, appDir, baseUrl, jar, smokeRoot });
  } finally {
    await fs.rm(smokeRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`[planning:v2:desktop:smoke] failed\n${message}\n`);
    process.exit(1);
  });
}
