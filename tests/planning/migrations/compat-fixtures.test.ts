import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  previewPlanningDataVaultZip,
  restorePlanningDataVaultZip,
} from "../../../src/lib/ops/backup/planningDataVault";
import { listAssumptionsHistory } from "../../../src/lib/planning/assumptions/storage";
import { listProfiles } from "../../../src/lib/planning/store/profileStore";
import { listRuns } from "../../../src/lib/planning/store/runStore";
import { migrateProfileRecord } from "../../../src/lib/planning/migrations/profileMigrate";
import { migrateRunRecord } from "../../../src/lib/planning/migrations/runMigrate";
import { migrateAssumptionsSnapshot } from "../../../src/lib/planning/migrations/snapshotMigrate";
import {
  resetVaultRuntimeForTests,
  unlockVault,
} from "../../../src/lib/planning/security/vaultState";
import {
  getPlanningMigrationStatePath,
  inspectPlanningMigrations,
  runPlanningMigrations,
} from "../../../src/lib/planning/migrations/manager";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsPath = process.env.PLANNING_ASSUMPTIONS_PATH;
const originalAssumptionsHistoryDir = process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR;
const originalProfileMetaPath = process.env.PLANNING_PROFILE_META_PATH;
const originalVaultPath = process.env.PLANNING_VAULT_CONFIG_PATH;

function fixturePath(name: string): string {
  return path.resolve(process.cwd(), "tests/fixtures/compat", name);
}

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(fixturePath(name), "utf-8")) as unknown;
}

function loadFixtureBuffer(name: string): Buffer {
  return fs.readFileSync(fixturePath(name));
}

function hashSha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function copyFixtureStorage(name: string, targetRoot: string): void {
  const fixtureRoot = fixturePath(name);
  fs.cpSync(fixtureRoot, targetRoot, { recursive: true, force: true });
}

describe("compat fixtures", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "planning-compat-fixtures-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, ".data/planning/profiles");
    env.PLANNING_RUNS_DIR = path.join(root, ".data/planning/runs");
    env.PLANNING_ASSUMPTIONS_PATH = path.join(root, ".data/planning/assumptions.latest.json");
    env.PLANNING_ASSUMPTIONS_HISTORY_DIR = path.join(root, ".data/planning/assumptions/history");
    env.PLANNING_PROFILE_META_PATH = path.join(root, ".data/planning/vault/profiles.meta.json");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, ".data/planning/security/vault.json");
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalAssumptionsPath === "string") env.PLANNING_ASSUMPTIONS_PATH = originalAssumptionsPath;
    else delete env.PLANNING_ASSUMPTIONS_PATH;

    if (typeof originalAssumptionsHistoryDir === "string") env.PLANNING_ASSUMPTIONS_HISTORY_DIR = originalAssumptionsHistoryDir;
    else delete env.PLANNING_ASSUMPTIONS_HISTORY_DIR;

    if (typeof originalProfileMetaPath === "string") env.PLANNING_PROFILE_META_PATH = originalProfileMetaPath;
    else delete env.PLANNING_PROFILE_META_PATH;

    if (typeof originalVaultPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;

    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("opens v1 fixtures through migration functions", () => {
    const profile = migrateProfileRecord(loadFixture("profile-record-v1.json"));
    const run = migrateRunRecord(loadFixture("run-record-v1.json"));
    const snapshot = migrateAssumptionsSnapshot(loadFixture("assumptions-snapshot-v1.json"));

    expect(profile.ok).toBe(true);
    expect(run.ok).toBe(true);
    expect(snapshot.ok).toBe(true);

    expect(profile.data?.schemaVersion).toBe(2);
    expect(run.data?.schemaVersion).toBe(2);
    expect(snapshot.data?.schemaVersion).toBe(2);
  });

  it("runs migration manager against v1 plain storage fixture and records state", async () => {
    copyFixtureStorage("v1_plain_storage", root);

    const before = await inspectPlanningMigrations({ baseDir: root });
    expect(before.summary.pending).toBeGreaterThan(0);

    const result = await runPlanningMigrations({ baseDir: root, trigger: "ops" });
    expect(result.result === "ok" || result.result === "partial").toBe(true);

    const statePath = getPlanningMigrationStatePath(root);
    const stateRaw = JSON.parse(fs.readFileSync(statePath, "utf-8")) as {
      lastAttempt?: { trigger?: string; result?: string };
    };
    expect(stateRaw.lastAttempt?.trigger).toBe("ops");
    expect(typeof stateRaw.lastAttempt?.result).toBe("string");
  });

  it("opens v2 encrypted storage fixture after vault unlock", async () => {
    copyFixtureStorage("v2_encrypted_storage", root);
    await resetVaultRuntimeForTests();
    await unlockVault("compat-passphrase-1");

    const profiles = await listProfiles();
    const runs = await listRuns({ limit: 20 });
    expect(profiles.some((row) => row.id === "compat-profile-1")).toBe(true);
    expect(runs.some((row) => row.id === "compat-run-1")).toBe(true);
  });

  it("restores legacy backup fixture zip", async () => {
    const zip = loadFixtureBuffer("backup_v1.zip");
    const preview = await previewPlanningDataVaultZip(zip, {
      maxEntries: 100,
      maxBytes: 10 * 1024 * 1024,
      maxPreviewIds: 20,
    });
    expect(preview.actual.profiles).toBe(1);
    expect(preview.actual.runs).toBe(1);

    const restored = await restorePlanningDataVaultZip(zip, {
      maxEntries: 100,
      maxBytes: 10 * 1024 * 1024,
      mode: "merge",
    });

    expect(restored.issues.length).toBe(0);
    expect(restored.imported.profiles).toBe(1);
    expect(restored.imported.runs).toBe(1);
    expect(restored.imported.assumptionsHistory).toBe(1);

    const profiles = await listProfiles();
    const runs = await listRuns({ limit: 20 });
    const history = await listAssumptionsHistory(20);

    expect(profiles.length).toBeGreaterThan(0);
    expect(runs.some((row) => row.id === "compat-run-1")).toBe(true);
    expect(history.some((row) => row.id === "compat-snapshot-1")).toBe(true);

    const zipHash = hashSha256(zip);
    expect(zipHash.length).toBe(64);
  });
});
