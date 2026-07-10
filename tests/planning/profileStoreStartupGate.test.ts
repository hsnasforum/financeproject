import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPlanningMigrationsOnStartup: vi.fn(),
}));

vi.mock("../../src/lib/planning/migrations/manager", () => ({
  runPlanningMigrationsOnStartup: mocks.runPlanningMigrationsOnStartup,
}));

import {
  getDefaultProfileId,
  getProfile,
  updateProfile,
  upsertProfileRecord,
} from "../../src/lib/planning/store/profileStore";
import {
  resolveProfilePath,
  resolveProfileRecordPath,
} from "../../src/lib/planning/store/paths";
import {
  getPlanningStartupMigrationGateSnapshot,
  resetPlanningStartupMigrationGateSnapshotForTest,
} from "../../src/lib/planning/store/startupMigrationGate";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
  "PLANNING_USER_ID",
  "PLANNING_PROFILES_DIR",
  "PLANNING_PROFILE_META_PATH",
  "PLANNING_PROFILE_REGISTRY_PATH",
  "PLANNING_PROFILE_PARTITIONS_DIR",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_000_000,
    investmentAssets: 3_000_000,
    debts: [],
    goals: [],
  };
}

describe("planning profile store startup migration gate", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-profile-startup-gate-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "1";
    env.PLANNING_USER_ID = "default";
    delete env.PLANNING_PROFILES_DIR;
    delete env.PLANNING_PROFILE_META_PATH;
    delete env.PLANNING_PROFILE_REGISTRY_PATH;
    delete env.PLANNING_PROFILE_PARTITIONS_DIR;
    mocks.runPlanningMigrationsOnStartup.mockReset();
    mocks.runPlanningMigrationsOnStartup.mockResolvedValue({ result: "ok" });
    resetPlanningStartupMigrationGateSnapshotForTest();
  });

  afterEach(() => {
    restoreEnv();
    resetPlanningStartupMigrationGateSnapshotForTest();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("runs the startup gate once for update and keeps public getProfile guarded", async () => {
    await upsertProfileRecord({
      id: "profile-1",
      name: "Profile 1",
      profile: sampleProfile(),
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    mocks.runPlanningMigrationsOnStartup.mockClear();
    resetPlanningStartupMigrationGateSnapshotForTest();

    const updated = await updateProfile("profile-1", {
      name: "Updated Profile",
    });

    expect(updated?.name).toBe("Updated Profile");
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    expect(getPlanningStartupMigrationGateSnapshot()?.sequence).toBe(1);

    mocks.runPlanningMigrationsOnStartup.mockClear();
    resetPlanningStartupMigrationGateSnapshotForTest();
    await expect(getProfile("profile-1")).resolves.toEqual(expect.objectContaining({
      name: "Updated Profile",
    }));
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    expect(getPlanningStartupMigrationGateSnapshot()?.sequence).toBe(1);
  });

  it("runs the startup gate once when the update target does not exist", async () => {
    await expect(updateProfile("missing-profile", {
      name: "Missing",
    })).resolves.toBeNull();

    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    expect(getPlanningStartupMigrationGateSnapshot()?.sequence).toBe(1);
  });

  it("keeps legacy migration and default registry sync on the single-gate update path", async () => {
    const legacyRecord = {
      version: 1,
      schemaVersion: 2,
      id: "legacy-profile",
      name: "Legacy Profile",
      profile: sampleProfile(),
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const legacyPath = resolveProfilePath(legacyRecord.id);
    const partitionPath = resolveProfileRecordPath(legacyRecord.id);
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, `${JSON.stringify(legacyRecord, null, 2)}\n`, "utf8");

    const updated = await updateProfile(legacyRecord.id, {
      name: "Migrated Profile",
    });

    expect(updated?.name).toBe("Migrated Profile");
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    expect(getPlanningStartupMigrationGateSnapshot()?.sequence).toBe(1);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(partitionPath)).toBe(true);
    await expect(getDefaultProfileId()).resolves.toBe(legacyRecord.id);
  });

  it("updates only the active namespace and keeps its default profile", async () => {
    env.PLANNING_USER_ID = "user-a";
    await upsertProfileRecord({
      id: "shared-profile",
      name: "User A",
      profile: sampleProfile(),
    });
    env.PLANNING_USER_ID = "user-b";
    await upsertProfileRecord({
      id: "shared-profile",
      name: "User B",
      profile: sampleProfile(),
    });

    env.PLANNING_USER_ID = "user-a";
    mocks.runPlanningMigrationsOnStartup.mockClear();
    resetPlanningStartupMigrationGateSnapshotForTest();
    await expect(updateProfile("shared-profile", {
      name: "User A Updated",
    })).resolves.toEqual(expect.objectContaining({
      name: "User A Updated",
    }));
    expect(mocks.runPlanningMigrationsOnStartup).toHaveBeenCalledTimes(1);
    await expect(getDefaultProfileId()).resolves.toBe("shared-profile");

    env.PLANNING_USER_ID = "user-b";
    await expect(getProfile("shared-profile")).resolves.toEqual(expect.objectContaining({
      name: "User B",
    }));
  });
});
