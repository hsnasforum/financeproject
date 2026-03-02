import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  inspectPlanningMigrations,
  runPlanningMigrations,
  getPlanningMigrationStatePath,
} from "../../../src/lib/planning/migrations/manager";
import { configureVaultPassphrase, lockVault, resetVaultRuntimeForTests } from "../../../src/lib/planning/security/vaultState";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalVaultPath = process.env.PLANNING_VAULT_CONFIG_PATH;
const originalMigrationStatePath = process.env.PLANNING_MIGRATION_STATE_PATH;
const originalMigrationSnapshotDir = process.env.PLANNING_MIGRATION_SNAPSHOT_DIR;
const originalStorageJournalPath = process.env.PLANNING_STORAGE_JOURNAL_PATH;

function fixturePath(name: string): string {
  return path.resolve(process.cwd(), "tests/fixtures/compat", name);
}

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(fixturePath(name), "utf-8")) as unknown;
}

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

describe("planning migration manager", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-migration-manager-"));
    env.NODE_ENV = "test";
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, ".data/planning/security/vault.json");
    env.PLANNING_MIGRATION_STATE_PATH = path.join(root, ".data/planning/migrations/migrationState.json");
    env.PLANNING_MIGRATION_SNAPSHOT_DIR = path.join(root, ".data/planning/migrations/snapshots");
    env.PLANNING_STORAGE_JOURNAL_PATH = path.join(root, ".data/planning/storage/journal.ndjson");

    await resetVaultRuntimeForTests();

    writeJson(path.join(root, ".data/planning/profiles/compat-profile-1.json"), readFixture("profile-record-v1.json"));
    writeJson(path.join(root, ".data/planning/runs/compat-run-1.json"), readFixture("run-record-v1.json"));
    const snapshot = readFixture("assumptions-snapshot-v1.json");
    writeJson(path.join(root, ".data/planning/assumptions/history/compat-snapshot-1.json"), snapshot);
    writeJson(path.join(root, ".data/planning/assumptions.latest.json"), snapshot);
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalVaultPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;

    if (typeof originalMigrationStatePath === "string") env.PLANNING_MIGRATION_STATE_PATH = originalMigrationStatePath;
    else delete env.PLANNING_MIGRATION_STATE_PATH;

    if (typeof originalMigrationSnapshotDir === "string") env.PLANNING_MIGRATION_SNAPSHOT_DIR = originalMigrationSnapshotDir;
    else delete env.PLANNING_MIGRATION_SNAPSHOT_DIR;

    if (typeof originalStorageJournalPath === "string") env.PLANNING_STORAGE_JOURNAL_PATH = originalStorageJournalPath;
    else delete env.PLANNING_STORAGE_JOURNAL_PATH;

    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("detects pending storage migration and applies it with state tracking", async () => {
    const before = await inspectPlanningMigrations({ baseDir: root });
    expect(before.summary.pending).toBeGreaterThan(0);

    const applied = await runPlanningMigrations({ baseDir: root, trigger: "ops" });
    expect(applied.result).toBe("ok");
    expect(applied.summary.failed).toBe(0);

    const statePath = getPlanningMigrationStatePath(root);
    const savedState = JSON.parse(fs.readFileSync(statePath, "utf-8")) as {
      migrations?: Record<string, { status?: string; attempts?: number; appliedAt?: string }>;
      lastAttempt?: { result?: string; trigger?: string };
    };

    expect(savedState.migrations?.["storage-schema-v2"]?.status).toBe("applied");
    expect(savedState.migrations?.["storage-schema-v2"]?.attempts).toBeGreaterThanOrEqual(1);
    expect(savedState.migrations?.["storage-schema-v2"]?.appliedAt).toBeTruthy();
    expect(savedState.lastAttempt?.trigger).toBe("ops");

    const after = await inspectPlanningMigrations({ baseDir: root });
    expect(after.summary.pending).toBe(0);
    expect(after.summary.failed).toBe(0);
  });

  it("defers storage migration when vault is configured but locked", async () => {
    await configureVaultPassphrase({ passphrase: "test-passphrase-1234" });
    await lockVault();

    const report = await inspectPlanningMigrations({ baseDir: root });
    const storageMigration = report.items.find((item) => item.id === "storage-schema-v2");

    expect(storageMigration).toBeDefined();
    expect(storageMigration?.status).toBe("DEFERRED");
    expect(storageMigration?.code).toBe("LOCKED");
    expect(storageMigration?.fixHref).toBe("/ops/security");
  });
});
