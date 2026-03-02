import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadAssumptionsOverridesByProfile,
  saveAssumptionsOverrides,
} from "../../src/lib/planning/assumptions/overridesStorage";
import { resetVaultRuntimeForTests } from "../../src/lib/planning/security/vaultState";
import { createProfile } from "../../src/lib/planning/store/profileStore";
import { resolveProfilePartitionDir } from "../../src/lib/planning/store/paths";

const env = process.env as Record<string, string | undefined>;

const originalNodeEnv = process.env.NODE_ENV;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalRunsDir = process.env.PLANNING_RUNS_DIR;
const originalAssumptionsOverridesPath = process.env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_700_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 2_000_000,
    investmentAssets: 4_000_000,
    debts: [],
    goals: [],
  };
}

describe("assumptions overrides storage", () => {
  let root = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-overrides-storage-"));
    env.NODE_ENV = "test";
    env.PLANNING_PROFILES_DIR = path.join(root, "profiles");
    env.PLANNING_RUNS_DIR = path.join(root, "runs");
    env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = path.join(root, "assumptions", "overrides.json");
    env.PLANNING_VAULT_CONFIG_PATH = path.join(root, "security", "vault.json");
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;

    if (typeof originalRunsDir === "string") env.PLANNING_RUNS_DIR = originalRunsDir;
    else delete env.PLANNING_RUNS_DIR;

    if (typeof originalAssumptionsOverridesPath === "string") env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH = originalAssumptionsOverridesPath;
    else delete env.PLANNING_ASSUMPTIONS_OVERRIDES_PATH;

    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;

    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("isolates assumptions overrides by profileId", async () => {
    const profileA = await createProfile({ name: "A", profile: sampleProfile() });
    const profileB = await createProfile({ name: "B", profile: sampleProfile() });

    await saveAssumptionsOverrides([
      { key: "inflationPct", value: 2.4, reason: "profile-a", updatedAt: "2026-03-02T00:00:00.000Z" },
    ], profileA.id);
    await saveAssumptionsOverrides([
      { key: "inflationPct", value: 3.1, reason: "profile-b", updatedAt: "2026-03-02T00:00:00.000Z" },
    ], profileB.id);

    const loadedA = await loadAssumptionsOverridesByProfile(profileA.id);
    const loadedB = await loadAssumptionsOverridesByProfile(profileB.id);

    expect(loadedA).toHaveLength(1);
    expect(loadedA[0]?.value).toBe(2.4);
    expect(loadedA[0]?.reason).toBe("profile-a");

    expect(loadedB).toHaveLength(1);
    expect(loadedB[0]?.value).toBe(3.1);
    expect(loadedB[0]?.reason).toBe("profile-b");
  });

  it("migrates legacy global overrides into requested profile partition", async () => {
    const profile = await createProfile({ name: "Legacy", profile: sampleProfile() });
    const legacyFilePath = path.join(root, "assumptions", "overrides.json");
    fs.mkdirSync(path.dirname(legacyFilePath), { recursive: true });
    fs.writeFileSync(legacyFilePath, `${JSON.stringify({
      version: 1,
      updatedAt: "2026-03-02T00:00:00.000Z",
      items: [
        { key: "investReturnPct", value: 5.2, reason: "legacy", updatedAt: "2026-03-02T00:00:00.000Z" },
      ],
    }, null, 2)}\n`, "utf-8");

    const loaded = await loadAssumptionsOverridesByProfile(profile.id);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe("investReturnPct");
    expect(loaded[0]?.value).toBe(5.2);

    const scopedPath = path.join(resolveProfilePartitionDir(profile.id), "assumptions-overrides.json");
    expect(fs.existsSync(scopedPath)).toBe(true);
  });
});
