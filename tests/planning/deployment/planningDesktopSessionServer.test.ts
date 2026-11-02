import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPlanningDesktopSessionBootstrap,
  issuePlanningDesktopSessionBootstrap,
} from "../../../scripts/planning_desktop_session_server.mjs";

type Broker = Awaited<ReturnType<typeof createPlanningDesktopSessionBootstrap>>;

const openBrokers: Broker[] = [];
const temporaryRoots: string[] = [];
// A launcher may wait up to 30s for the Windows drive-type query before it reads the lock,
// so each real launcher process gets 45s and each case (two launches) gets room for both.
const SECONDARY_LAUNCHER_PROCESS_TIMEOUT_MS = 45_000;
const SECONDARY_LAUNCHER_TEST_TIMEOUT_MS = 2 * SECONDARY_LAUNCHER_PROCESS_TIMEOUT_MS + 10_000;

async function createBroker(options: Record<string, unknown> = {}) {
  const broker = await createPlanningDesktopSessionBootstrap({
    targetUrl: "http://127.0.0.1:3100/planning",
    sessionToken: "b".repeat(43),
    ...options,
  });
  openBrokers.push(broker);
  return broker;
}

afterEach(async () => {
  await Promise.all(openBrokers.splice(0).map((broker) => broker.close()));
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function runSecondaryLauncher(env: NodeJS.ProcessEnv) {
  const bootstrapOutputPath = env.PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE ?? "";
  if (!bootstrapOutputPath) throw new Error("bootstrap output path is required");
  await fs.rm(bootstrapOutputPath, { force: true });
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/planning_v2_desktop_launch.mjs",
      "--runtime",
      "prod",
      "--port",
      "3100",
      "--no-open",
    ], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("secondary desktop launcher timed out"));
    }, SECONDARY_LAUNCHER_PROCESS_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
  const bootstrapUrl = await fs.readFile(bootstrapOutputPath, "utf8")
    .then((value) => value.trim())
    .catch(() => "");
  await fs.rm(bootstrapOutputPath, { force: true });
  return { ...result, bootstrapUrl };
}

describe("planning desktop session bootstrap broker", () => {
  it("keeps the broker alive and reissues one-shot bootstrap URLs without exposing the session token", async () => {
    const token = "c".repeat(43);
    const broker = await createBroker({ sessionToken: token });

    expect(broker.bootstrapUrl).not.toContain(token);
    expect(broker.brokerUrl).not.toContain(token);
    expect(broker.issueCapability).not.toBe(token);
    expect(broker.issueCapability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(broker.bootstrapUrl).not.toContain(broker.issueCapability);

    const first = await fetch(broker.bootstrapUrl, { redirect: "manual" });
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("http://127.0.0.1:3100/planning");
    expect(first.headers.get("set-cookie")).toBe(
      `planning.desktop-session=${token}; Path=/; HttpOnly; SameSite=Strict`,
    );
    expect(first.headers.get("cache-control")).toBe("no-store");
    await expect(fetch(broker.bootstrapUrl, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(403);

    const reissuedUrl = await issuePlanningDesktopSessionBootstrap({
      brokerUrl: broker.brokerUrl,
      issueCapability: broker.issueCapability,
    });
    expect(reissuedUrl).not.toBe(broker.bootstrapUrl);
    await expect(fetch(reissuedUrl, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(303);
  });

  it("keeps an issued bootstrap available after a wrong nonce", async () => {
    const broker = await createBroker();
    const wrongUrl = new URL(broker.bootstrapUrl);
    wrongUrl.searchParams.set("nonce", "wrong");

    await expect(fetch(wrongUrl, { redirect: "manual" }).then((response) => response.status)).resolves.toBe(403);
    await expect(fetch(broker.bootstrapUrl, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(303);
  });

  it("rejects an origin-bearing bootstrap request without consuming its nonce", async () => {
    const broker = await createBroker();

    await expect(fetch(broker.bootstrapUrl, {
      redirect: "manual",
      headers: { origin: "http://127.0.0.1:3100" },
    }).then((response) => response.status)).resolves.toBe(403);
    await expect(fetch(broker.bootstrapUrl, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(303);
  });

  it("requires an authorized origin-free POST to issue a bootstrap", async () => {
    const broker = await createBroker({ issueInitialBootstrap: false });
    const issueUrl = `${broker.brokerUrl}/issue`;
    const authorization = `Bearer ${broker.issueCapability}`;

    await expect(fetch(issueUrl, { method: "GET", headers: { authorization } }).then((response) => response.status))
      .resolves.toBe(403);
    await expect(fetch(issueUrl, { method: "POST" }).then((response) => response.status)).resolves.toBe(403);
    await expect(fetch(issueUrl, {
      method: "POST",
      headers: { authorization, origin: "http://127.0.0.1:3100" },
    }).then((response) => response.status)).resolves.toBe(403);

    await expect(issuePlanningDesktopSessionBootstrap({
      brokerUrl: broker.brokerUrl,
      issueCapability: broker.issueCapability,
    })).resolves.toMatch(/^http:\/\/127\.0\.0\.1:\d+\/bootstrap\?nonce=[A-Za-z0-9_-]{43}$/);
  });

  it("atomically consumes a nonce once under concurrent requests", async () => {
    const broker = await createBroker();
    const statuses = await Promise.all([
      fetch(broker.bootstrapUrl, { redirect: "manual" }).then((response) => response.status),
      fetch(broker.bootstrapUrl, { redirect: "manual" }).then((response) => response.status),
    ]);

    expect(statuses.sort((left, right) => left - right)).toEqual([303, 403]);
  });

  it("expires nonces and bounds the number of pending bootstrap URLs", async () => {
    const boundedBroker = await createBroker({
      issueInitialBootstrap: false,
      maxPendingNonces: 2,
      nonceTtlMs: 60_000,
    });
    await boundedBroker.issueBootstrapUrl();
    await boundedBroker.issueBootstrapUrl();
    await expect(boundedBroker.issueBootstrapUrl()).rejects.toThrow("broker rejected bootstrap issuance (429)");

    const expiringBroker = await createBroker({
      issueInitialBootstrap: false,
      maxPendingNonces: 2,
      nonceTtlMs: 20,
    });
    const firstUrl = await expiringBroker.issueBootstrapUrl();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(fetch(firstUrl, { redirect: "manual" }).then((response) => response.status)).resolves.toBe(403);
    await expect(expiringBroker.issueBootstrapUrl()).resolves.toMatch(/\/bootstrap\?nonce=/);
  });

  it("rejects non-exact loopback targets and broker URLs", async () => {
    await expect(createPlanningDesktopSessionBootstrap({
      targetUrl: "http://localhost:3100/planning",
      sessionToken: "d".repeat(43),
    })).rejects.toThrow("exact http://127.0.0.1 URL");
    await expect(issuePlanningDesktopSessionBootstrap({
      brokerUrl: "http://localhost:3101",
      issueCapability: "e".repeat(43),
    })).rejects.toThrow("exact http://127.0.0.1 URL");
    await expect(issuePlanningDesktopSessionBootstrap({
      brokerUrl: "http://127.0.0.1:3101/issue",
      issueCapability: "e".repeat(43),
    })).rejects.toThrow("exact http://127.0.0.1 URL");
  });

  it("lets a secondary launcher recover authentication and fails closed for an invalid broker", async () => {
    const token = "f".repeat(43);
    const broker = await createBroker({ sessionToken: token, issueInitialBootstrap: false });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-secondary-test-"));
    temporaryRoots.push(root);
    const runtimeDir = path.join(root, "runtime");
    const lockPath = path.join(runtimeDir, "desktop-instance.lock.json");
    await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    const lockPayload = {
      pid: process.pid,
      baseUrl: "http://127.0.0.1:3100",
      targetUrl: "http://127.0.0.1:3100/planning",
      openPath: "/planning",
      brokerUrl: broker.brokerUrl,
      issueCapability: broker.issueCapability,
      readyAt: new Date().toISOString(),
    };
    await fs.writeFile(lockPath, `${JSON.stringify(lockPayload)}\n`, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      PLANNING_DEPLOYMENT_MODE: "desktop-local",
      PLANNING_E2E_DESKTOP_DATABASE_URL: "file:./dev.db",
      PLANNING_E2E_DESKTOP_DATA_DIR: path.join(root, "planning"),
      PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
      PLANNING_NAMESPACE_ENABLED: "false",
      PLANNING_SINGLE_USER_MODE: "true",
      PLANNING_TRUST_AUTH_HEADERS: "false",
      PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(runtimeDir, "e2e-bootstrap.url"),
      PLANNING_E2E_DESKTOP_SESSION_TOKEN: "h".repeat(43),
    };

    const secondary = await runSecondaryLauncher(env);
    expect(
      secondary.code,
      `secondary launcher failed\nstdout:\n${secondary.stdout}\nstderr:\n${secondary.stderr}`,
    ).toBe(0);
    expect(secondary.stdout).not.toContain(token);
    expect(secondary.stdout).not.toContain(broker.issueCapability);
    expect(secondary.stdout).not.toContain("/bootstrap?nonce=");
    expect(secondary.stderr).not.toContain("/bootstrap?nonce=");
    const issuedUrl = secondary.bootstrapUrl;
    expect(issuedUrl).toBeTruthy();
    const bootstrap = await fetch(issuedUrl!, { redirect: "manual" });
    expect(bootstrap.status).toBe(303);
    expect(bootstrap.headers.get("set-cookie")).toContain(`planning.desktop-session=${token}`);

    await fs.writeFile(lockPath, `${JSON.stringify({
      ...lockPayload,
      brokerUrl: "http://localhost:1",
    })}\n`, { mode: 0o600 });
    const rejected = await runSecondaryLauncher(env);
    expect(rejected.code).toBe(1);
    expect(rejected.bootstrapUrl).toBe("");
    expect(`${rejected.stdout}\n${rejected.stderr}`).not.toContain(lockPayload.targetUrl);
    expect(`${rejected.stdout}\n${rejected.stderr}`).not.toContain("session bootstrap");
  }, SECONDARY_LAUNCHER_TEST_TIMEOUT_MS);

  it("waits for a living primary to atomically publish its broker contract", async () => {
    const token = "g".repeat(43);
    const broker = await createBroker({ sessionToken: token, issueInitialBootstrap: false });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-startup-lock-test-"));
    temporaryRoots.push(root);
    const runtimeDir = path.join(root, "runtime");
    const lockPath = path.join(runtimeDir, "desktop-instance.lock.json");
    await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    const initialLock = {
      pid: process.pid,
      baseUrl: "http://127.0.0.1:3100",
      targetUrl: "http://127.0.0.1:3100/planning",
      openPath: "/planning",
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(lockPath, `${JSON.stringify(initialLock)}\n`, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      PLANNING_DEPLOYMENT_MODE: "desktop-local",
      PLANNING_E2E_DESKTOP_DATABASE_URL: "file:./dev.db",
      PLANNING_E2E_DESKTOP_DATA_DIR: path.join(root, "planning"),
      PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
      PLANNING_NAMESPACE_ENABLED: "false",
      PLANNING_SINGLE_USER_MODE: "true",
      PLANNING_TRUST_AUTH_HEADERS: "false",
      PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(runtimeDir, "e2e-bootstrap.url"),
      PLANNING_E2E_DESKTOP_SESSION_TOKEN: "i".repeat(43),
    };

    const publishReadyLock = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const readyLock = {
        ...initialLock,
        brokerUrl: broker.brokerUrl,
        issueCapability: broker.issueCapability,
        readyAt: new Date().toISOString(),
      };
      const temporaryPath = `${lockPath}.ready`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(readyLock)}\n`, { mode: 0o600 });
      await fs.rename(temporaryPath, lockPath);
    })();
    const secondary = await runSecondaryLauncher(env);
    await publishReadyLock;

    expect(
      secondary.code,
      `secondary launcher failed\nstdout:\n${secondary.stdout}\nstderr:\n${secondary.stderr}`,
    ).toBe(0);
    expect(secondary.stdout).toContain(`already running pid=${process.pid}`);
    expect(secondary.stdout).not.toContain(token);
    expect(secondary.stdout).not.toContain(broker.issueCapability);
    expect(secondary.stdout).not.toContain("/bootstrap?nonce=");
    expect(secondary.stderr).not.toContain("/bootstrap?nonce=");
    const issuedUrl = secondary.bootstrapUrl;
    expect(issuedUrl).toBeTruthy();
    await expect(fetch(issuedUrl!, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(303);
  }, SECONDARY_LAUNCHER_TEST_TIMEOUT_MS);

  it("checks the automation bootstrap file against the canonical control root", async () => {
    const broker = await createBroker({ sessionToken: "j".repeat(43), issueInitialBootstrap: false });
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "planning-desktop-canonical-root-test-"));
    const linkedRoot = `${root}-link`;
    temporaryRoots.push(linkedRoot, root);
    // Reaching the root through a link mirrors Windows 8.3 temp paths that differ from their realpath.
    await fs.symlink(root, linkedRoot, "junction");
    const runtimeDir = path.join(root, "runtime");
    await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(runtimeDir, "desktop-instance.lock.json"), `${JSON.stringify({
      pid: process.pid,
      baseUrl: "http://127.0.0.1:3100",
      targetUrl: "http://127.0.0.1:3100/planning",
      openPath: "/planning",
      brokerUrl: broker.brokerUrl,
      issueCapability: broker.issueCapability,
      readyAt: new Date().toISOString(),
    })}\n`, { mode: 0o600 });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      PLANNING_DEPLOYMENT_MODE: "desktop-local",
      PLANNING_E2E_DESKTOP_DATABASE_URL: "file:./dev.db",
      PLANNING_E2E_DESKTOP_DATA_DIR: path.join(linkedRoot, "planning"),
      PLANNING_FORWARDED_HEADERS_TRUSTED: "false",
      PLANNING_NAMESPACE_ENABLED: "false",
      PLANNING_SINGLE_USER_MODE: "true",
      PLANNING_TRUST_AUTH_HEADERS: "false",
      PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(linkedRoot, "runtime", "e2e-bootstrap.url"),
      PLANNING_E2E_DESKTOP_SESSION_TOKEN: "k".repeat(43),
    };

    const linked = await runSecondaryLauncher(env);
    expect(
      linked.code,
      `secondary launcher failed\nstdout:\n${linked.stdout}\nstderr:\n${linked.stderr}`,
    ).toBe(0);
    await expect(fetch(linked.bootstrapUrl, { redirect: "manual" }).then((response) => response.status))
      .resolves.toBe(303);

    const outside = await runSecondaryLauncher({
      ...env,
      PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: `${root}-outside.url`,
    });
    expect(outside.code).toBe(1);
    expect(outside.stderr).toContain("PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE must stay inside the desktop control root");
    expect(outside.bootstrapUrl).toBe("");
  }, SECONDARY_LAUNCHER_TEST_TIMEOUT_MS);
});
