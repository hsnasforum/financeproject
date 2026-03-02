import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isVaultEncryptedEnvelope } from "../../src/lib/planning/crypto/vaultCrypto";
import { configureVaultPassphrase, resetVaultRuntimeForTests } from "../../src/lib/planning/security/vaultState";
import { listProfiles } from "../../src/lib/planning/store/profileStore";

const env = process.env as Record<string, string | undefined>;
const originalProfilesDir = process.env.PLANNING_PROFILES_DIR;
const originalVaultConfigPath = process.env.PLANNING_VAULT_CONFIG_PATH;

function sampleProfile() {
  return {
    schemaVersion: 2,
    monthlyIncomeNet: 4_200_000,
    monthlyEssentialExpenses: 1_800_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 2_000_000,
    investmentAssets: 1_000_000,
    debts: [],
    goals: [],
  };
}

describe("vault storage migration", () => {
  let root = "";
  let profilesDir = "";
  let configPath = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-vault-migration-"));
    profilesDir = path.join(root, "profiles");
    configPath = path.join(root, "security", "vault.config.json");
    env.PLANNING_PROFILES_DIR = profilesDir;
    env.PLANNING_VAULT_CONFIG_PATH = configPath;
    await resetVaultRuntimeForTests();
  });

  afterEach(async () => {
    if (typeof originalProfilesDir === "string") env.PLANNING_PROFILES_DIR = originalProfilesDir;
    else delete env.PLANNING_PROFILES_DIR;
    if (typeof originalVaultConfigPath === "string") env.PLANNING_VAULT_CONFIG_PATH = originalVaultConfigPath;
    else delete env.PLANNING_VAULT_CONFIG_PATH;
    await resetVaultRuntimeForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rewrites plaintext profile record to encrypted envelope after successful load", async () => {
    await fs.promises.mkdir(profilesDir, { recursive: true });
    const filePath = path.join(profilesDir, "legacy-profile.json");
    const plaintextRecord = {
      version: 1,
      schemaVersion: 2,
      id: "legacy-profile",
      name: "legacy",
      profile: sampleProfile(),
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };
    await fs.promises.writeFile(filePath, `${JSON.stringify(plaintextRecord, null, 2)}\n`, "utf-8");

    await configureVaultPassphrase({
      passphrase: "vault-migration-pass",
      autoLockMinutes: 30,
    });

    const profiles = await listProfiles();
    expect(profiles.some((row) => row.id === "legacy-profile")).toBe(true);

    const rewrittenRaw = await fs.promises.readFile(filePath, "utf-8");
    const rewrittenJson = JSON.parse(rewrittenRaw) as unknown;
    expect(isVaultEncryptedEnvelope(rewrittenJson)).toBe(true);
  });
});
