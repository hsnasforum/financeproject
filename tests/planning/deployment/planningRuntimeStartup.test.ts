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
import { createFinlifeLegacyFixture } from "../../helpers/finlifeLegacyDatabase";
import {
  formatPlanningSqliteDatabaseUrl,
} from "../../../src/lib/planning/deployment/runtimeDatabase.mjs";

const cleanupRoots: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function createRuntimeDatabase(databasePath: string): void {
  createFinlifeLegacyFixture(databasePath, { globalUnique: false, identityColumn: true });
  const database = new Database(databasePath);
  try {
    database.exec(`
      CREATE UNIQUE INDEX "Product_identityKey_key" ON "Product"("identityKey");
      CREATE INDEX "Product_finPrdtCd_idx" ON "Product"("finPrdtCd");
      UPDATE "Product" SET "identityKey"='finlife:deposit:0010001:SHARED-CODE';
    `);
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
  it("rejects an identity column with the old global product-code uniqueness before runtime startup", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-runtime-legacy-"));
    cleanupRoots.push(controlRoot);
    const databasePath = path.join(controlRoot, "legacy.db");
    createFinlifeLegacyFixture(databasePath, { identityColumn: true });
    const before = await fs.readFile(databasePath);
    const lease = await acquirePlanningWriterLease({ dataRoot: controlRoot, writerId: "runtime.desktop" });
    try {
      await registerPlanningWriterLeaseChild({
        dataRoot: controlRoot,
        capability: lease.capability,
        childPid: process.ppid,
      });
      await expect(verifyPlanningDesktopRuntimeStartup({
        cwd: process.cwd(),
        env: runtimeEnv(process.cwd(), path.join(controlRoot, "planning"), controlRoot, lease.capability, databasePath),
        bindHost: "127.0.0.1",
      })).rejects.toThrow("finlife:identity:migrate");
      expect(await fs.readFile(databasePath)).toEqual(before);
    } finally {
      await lease.release();
    }
  });

  it("makes the primary launcher fail identity readiness before preparing a session or server", async () => {
    const controlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "planning-launcher-legacy-"));
    cleanupRoots.push(controlRoot);
    const databasePath = path.join(controlRoot, "legacy.db");
    createFinlifeLegacyFixture(databasePath, { identityColumn: true });
    const before = await fs.readFile(databasePath);
    const result = spawnSync(process.execPath, ["scripts/planning_v2_desktop_launch.mjs", "--runtime", "prod", "--no-open"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLANNING_E2E_DESKTOP_BOOTSTRAP_FILE: path.join(controlRoot, "bootstrap.json"),
        PLANNING_E2E_DESKTOP_DATABASE_URL: formatPlanningSqliteDatabaseUrl({ cwd: process.cwd(), databasePath }),
        PLANNING_E2E_DESKTOP_DATA_DIR: path.join(controlRoot, "planning"),
        PLANNING_E2E_DESKTOP_SESSION_TOKEN: "invalid",
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("finlife:identity:migrate");
    expect(result.stderr).not.toContain("must be a high-entropy");
    expect(await fs.readFile(databasePath)).toEqual(before);
    await expect(fs.access(path.join(controlRoot, "runtime", "writer-lease.json"))).rejects.toThrow();
    await expect(fs.access(path.join(controlRoot, "bootstrap.json"))).rejects.toThrow();
  });

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
