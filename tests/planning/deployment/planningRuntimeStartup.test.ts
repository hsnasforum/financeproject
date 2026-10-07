import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquirePlanningWriterLease,
  registerPlanningWriterLeaseChild,
} from "../../../src/lib/planning/deployment/writerLease.mjs";
import { PLANNING_RUNTIME_ATTESTATION } from "../../../src/lib/planning/deployment/runtimePolicy.mjs";
import { verifyPlanningDesktopRuntimeStartup } from "../../../scripts/planning_runtime_startup.mjs";
import {
  formatPlanningSqliteDatabaseUrl,
  readPlanningSqliteSchemaContract,
} from "../../../src/lib/planning/deployment/runtimeDatabase.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function createRuntimeDatabase(databasePath: string): void {
  const database = new Database(databasePath);
  try {
    const schemaContract = readPlanningSqliteSchemaContract({ cwd: process.cwd() });
    for (const entry of schemaContract) {
      const columns = entry.columns.map((column) => `"${column}" TEXT`).join(", ");
      database.exec(`CREATE TABLE "${entry.tableName}" (${columns})`);
    }
  } finally {
    database.close();
  }
}

function runtimeEnv(
  cwd: string,
  planningRoot: string,
  controlRoot: string,
  capability: string,
  databasePath: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: formatPlanningSqliteDatabaseUrl({ cwd, databasePath }),
    PLANNING_DATA_DIR: planningRoot,
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
    PLANNING_DATABASE_PROVIDER: "sqlite",
    PLANNING_DATABASE_CONNECTION: "file",
    PLANNING_RUNTIME_ATTESTATION,
    PLANNING_DESKTOP_SESSION_TOKEN: "r".repeat(43),
    PLANNING_WRITER_DATA_ROOT: controlRoot,
    PLANNING_WRITER_LEASE_CAPABILITY: capability,
  };
}

describe("planning runtime startup verification", () => {
  it("accepts only the desktop runtime lease with its registered parent", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-runtime-startup-"));
    cleanupRoots.push(controlRoot);
    const planningRoot = path.join(controlRoot, "planning");
    const databasePath = path.join(controlRoot, "finance.db");
    createRuntimeDatabase(databasePath);
    const lease = await acquirePlanningWriterLease({ dataRoot: controlRoot, writerId: "runtime.desktop" });
    await registerPlanningWriterLeaseChild({
      dataRoot: controlRoot,
      capability: lease.capability,
      childPid: process.ppid,
    });

    await expect(verifyPlanningDesktopRuntimeStartup({
      cwd: process.cwd(),
      env: runtimeEnv(process.cwd(), planningRoot, controlRoot, lease.capability, databasePath),
      bindHost: "127.0.0.1",
    })).resolves.toMatchObject({
      planningRoot,
      controlRoot,
      decision: { ok: true, writerExclusivity: "data-root-exclusive" },
    });
    await lease.release();
  });

  it("rejects a lease held by a non-runtime writer", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-runtime-wrong-writer-"));
    cleanupRoots.push(controlRoot);
    const planningRoot = path.join(controlRoot, "planning");
    const databasePath = path.join(controlRoot, "finance.db");
    createRuntimeDatabase(databasePath);
    const lease = await acquirePlanningWriterLease({ dataRoot: controlRoot, writerId: "v3:migrate" });
    await registerPlanningWriterLeaseChild({
      dataRoot: controlRoot,
      capability: lease.capability,
      childPid: process.ppid,
    });

    await expect(verifyPlanningDesktopRuntimeStartup({
      cwd: process.cwd(),
      env: runtimeEnv(process.cwd(), planningRoot, controlRoot, lease.capability, databasePath),
      bindHost: "127.0.0.1",
    })).rejects.toThrow("cannot inherit writer v3:migrate");
    await lease.release();
  });

  it("fails closed when next_prod_safe is launched without the desktop launcher", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-runtime-direct-"));
    cleanupRoots.push(controlRoot);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      PLANNING_DATA_DIR: path.join(controlRoot, "planning"),
    };
    for (const key of [
      "PLANNING_WRITER_DATA_ROOT",
      "PLANNING_WRITER_LEASE_CAPABILITY",
      "PLANNING_RUNTIME_ATTESTATION",
      "PLANNING_DESKTOP_SESSION_TOKEN",
    ]) {
      delete env[key];
    }

    const result = spawnSync(process.execPath, ["scripts/next_prod_safe.mjs", "--port", "3299", "--strict-port"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("writer capability is missing");
    expect(result.stdout).not.toContain("Bind:");
  });
});
