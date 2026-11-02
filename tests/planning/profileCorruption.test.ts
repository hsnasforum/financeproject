import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProfile, deleteProfile, getProfile, hardDeleteProfile, listProfiles,
  restoreProfileFromTrash, setDefaultProfile, updateProfile, upsertProfileRecord,
} from "../../src/lib/planning/store/profileStore";
import { resolveProfilePath, resolveProfileRecordPath, resolveProfilePartitionsDir } from "../../src/lib/planning/store/paths";
import { resolveTrashKindDir } from "../../src/lib/planning/store/trash";
import { StorageCorruptedError, StorageUnavailableError } from "../../src/lib/planning/storage/serverFileRead";
import * as vaultStorage from "../../src/lib/planning/security/vaultStorage";
import { configureVaultPassphrase, lockVault, resetVaultRuntimeForTests } from "../../src/lib/planning/security/vaultState";
import { encryptPlanningJson } from "../../src/lib/planning/crypto/encrypt";
import { encryptJsonWithKey } from "../../src/lib/planning/crypto/vaultCrypto";

vi.mock("../../src/lib/planning/migrations/manager", () => ({
  runPlanningMigrationsOnStartup: vi.fn(async () => ({ result: "ok" })),
}));

function sampleProfile() {
  return {
    monthlyIncomeNet: 4_200_000, monthlyEssentialExpenses: 1_800_000,
    monthlyDiscretionaryExpenses: 600_000, liquidAssets: 2_000_000,
    investmentAssets: 1_000_000, debts: [], goals: [],
  };
}

function record(id: string) {
  return { version: 1, schemaVersion: 2, id, name: "합성 프로필", profile: sampleProfile(),
    createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" };
}

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

// Same byte/hash/stat checks as planning-store.test.ts, retaining raw bytes as well.
function fileFingerprint(file: string) {
  const bytes = fs.readFileSync(file);
  const stat = fs.statSync(file);
  return { bytes, hash: crypto.createHash("sha256").update(bytes).digest("hex"),
    size: stat.size, mtimeMs: stat.mtimeMs };
}

describe("profile corruption preservation (startup mocked)", () => {
  let root: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-profile-corruption-"));
    vi.stubEnv("PLANNING_DATA_DIR", root);
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "0");
    vi.stubEnv("PLANNING_SINGLE_USER_MODE", "0");
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "0");
    vi.stubEnv("PLANNING_PROFILES_DIR", path.join(root, "profiles"));
    vi.stubEnv("PLANNING_PROFILE_PARTITIONS_DIR", path.join(root, "vault", "profiles"));
    vi.stubEnv("PLANNING_PROFILE_META_PATH", path.join(root, "vault", "profiles.meta.json"));
    vi.stubEnv("PLANNING_PROFILE_REGISTRY_PATH", path.join(root, "vault", "profiles", "index.json"));
    vi.stubEnv("PLANNING_RUNS_DIR", path.join(root, "runs"));
    vi.stubEnv("PLANNING_TRASH_DIR", path.join(root, "trash"));
    vi.stubEnv("PLANNING_VAULT_CONFIG_PATH", path.join(root, "security", "vault.json"));
    await resetVaultRuntimeForTests();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetVaultRuntimeForTests();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates one default only for a genuinely empty store, including after last deletion", async () => {
    const first = await listProfiles();
    expect(first.map(row => row.id)).toEqual(["default-profile"]);
    expect((await listProfiles()).map(row => row.id)).toEqual(["default-profile"]);
    await deleteProfile("default-profile");
    expect((await listProfiles()).map(row => row.id)).toEqual(["default-profile"]);
    expect(await getProfile("missing")).toBeNull();
  });

  const corruptions = [
    ["malformed JSON", '{"sensitive-fixture":'],
    ["record schema", JSON.stringify({ version: 1, profile: sampleProfile() })],
    ["payload schema", JSON.stringify({ ...record("default-profile"), profile: {} })],
    ["invalid numeric payload", JSON.stringify({ ...record("default-profile"), profile: { ...sampleProfile(), liquidAssets: "broken" } })],
    ["invalid array payload", JSON.stringify({ ...record("default-profile"), profile: { ...sampleProfile(), debts: "broken" } })],
    ["unsupported format", JSON.stringify({ version: 99, ciphertext: "synthetic-only" })],
  ];
  it.each(corruptions)("preserves a default with %s on list and detail", async (_label, raw) => {
    const file = resolveProfileRecordPath("default-profile");
    write(file, raw);
    const before = fileFingerprint(file);
    const detail = await getProfile("default-profile").catch(error => error);
    expect.soft(detail).toBeInstanceOf(StorageCorruptedError);
    expect.soft(fileFingerprint(file)).toEqual(before);
    const listed = await listProfiles().catch(error => error);
    expect.soft(listed).toBeInstanceOf(StorageCorruptedError);
    expect(fileFingerprint(file)).toEqual(before);
  });

  it.each([["a-good", "z-bad"], ["z-good", "a-bad"]])("fails the whole list with order %s / %s", async (good, bad) => {
    write(resolveProfileRecordPath(good), record(good));
    write(resolveProfileRecordPath(bad), "{");
    fs.mkdirSync(path.join(resolveProfilePartitionsDir(), "invalid.name"));
    const files = [resolveProfileRecordPath(good), resolveProfileRecordPath(bad)];
    const before = files.map(fileFingerprint);
    expect((await getProfile(good))?.id).toBe(good);
    await expect(listProfiles()).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(files.map(fileFingerprint)).toEqual(before);
  });

  it.each(["list", "detail"])("preserves a corrupt partition and same-ID legacy during %s", async mode => {
    const id = "default-profile";
    const files = [resolveProfileRecordPath(id), resolveProfilePath(id)];
    write(files[0], "{");
    write(files[1], record(id));
    const before = files.map(fileFingerprint);
    const result = await (mode === "list" ? listProfiles() : getProfile(id)).catch(error => error);
    expect.soft(result).toBeInstanceOf(StorageCorruptedError);
    expect(files.map(file => fs.existsSync(file) ? fileFingerprint(file) : null)).toEqual(before);
  });

  it.each(["EACCES", "EIO"])("propagates mocked target-file %s and preserves bytes", async code => {
    const file = resolveProfileRecordPath("default-profile");
    write(file, record("default-profile"));
    const before = fileFingerprint(file);
    const read = fsPromises.readFile.bind(fsPromises);
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (...args) => {
      if (String(args[0]) === file) throw Object.assign(new Error("synthetic I/O failure"), { code });
      return read(...args);
    });
    await expect(getProfile("default-profile")).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(listProfiles()).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(fileFingerprint(file)).toEqual(before);
  });

  it("reports real filesystem EISDIR instead of an empty store", async () => {
    fs.mkdirSync(resolveProfileRecordPath("default-profile"), { recursive: true });
    await expect(getProfile("default-profile")).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(listProfiles()).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(fs.statSync(resolveProfileRecordPath("default-profile")).isDirectory()).toBe(true);
  });

  it("does not interpret ENOENT after the target read as missing", async () => {
    const file = resolveProfileRecordPath("default-profile");
    write(file, record("default-profile"));
    const before = fileFingerprint(file);
    const failure = Object.assign(new Error("synthetic dependent file missing"), { code: "ENOENT" });
    vi.spyOn(vaultStorage, "decodeStoragePayload").mockRejectedValue(failure);
    await expect(getProfile("default-profile")).rejects.toBe(failure);
    await expect(listProfiles()).rejects.toBe(failure);
    expect(fileFingerprint(file)).toEqual(before);
  });

  it.each(["create", "upsert", "update", "delete", "hardDelete", "default", "restore"])("preflights %s before changing data when a sibling is corrupt", async operation => {
    const good = resolveProfileRecordPath("good");
    const bad = resolveProfileRecordPath("bad");
    const trash = path.join(resolveTrashKindDir("profiles"), "restored.json");
    write(good, record("good"));
    write(bad, "{");
    write(trash, record("restored"));
    const files = [good, bad, trash];
    const before = files.map(fileFingerprint);
    const mutations: Record<string, () => Promise<unknown>> = {
      create: () => createProfile({ name: "new", profile: sampleProfile() }),
      upsert: () => upsertProfileRecord({ ...record("good"), name: "changed" }),
      update: () => updateProfile("good", { name: "changed" }),
      delete: () => deleteProfile("good"),
      hardDelete: () => hardDeleteProfile("good"),
      default: () => setDefaultProfile("good"),
      restore: () => restoreProfileFromTrash("restored"),
    };
    await expect(mutations[operation]()).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(files.map(file => fs.existsSync(file) ? fileFingerprint(file) : null)).toEqual(before);
    expect(fs.readdirSync(resolveProfilePartitionsDir()).sort()).toEqual(["bad", "good"]);
    expect(fs.existsSync(path.join(root, "vault", "profiles.meta.json"))).toBe(false);
  });

  it("rejects corrupted trash before moving it into the active store", async () => {
    const trash = path.join(resolveTrashKindDir("profiles"), "restored.json");
    write(trash, "{");
    const before = fileFingerprint(trash);
    await expect(restoreProfileFromTrash("restored")).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(fileFingerprint(trash)).toEqual(before);
    expect(fs.existsSync(resolveProfileRecordPath("restored"))).toBe(false);
  });

  it("keeps metadata/index recovery from valid profile bodies", async () => {
    write(resolveProfileRecordPath("good"), record("good"));
    write(path.join(root, "vault", "profiles.meta.json"), "{");
    write(path.join(resolveProfilePartitionsDir(), "index.json"), "{");
    expect((await listProfiles()).map(row => row.id)).toEqual(["good"]);
    expect(JSON.parse(fs.readFileSync(path.join(resolveProfilePartitionsDir(), "index.json"), "utf8")).defaultProfileId).toBe("good");
  });

  it("reads the repository v1 legacy fixture with its original debt fields", async () => {
    const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
    write(resolveProfilePath(legacy.id), legacy);
    const loaded = await getProfile(legacy.id);
    expect(loaded?.profile.debts).toHaveLength(1);
    expect(loaded?.profile.debts[0].balance).toBe(legacy.profile.debts[0].balance);
    expect(fs.existsSync(resolveProfilePath(legacy.id))).toBe(false);
  });

  it("keeps supported legacy cashflow/assets and list aliases", async () => {
    const legacy = { ...record("legacy-aliases"), schemaVersion: 1, profile: {
      cashflow: { monthlyIncomeKrw: 4_200_000, monthlyFixedExpensesKrw: 1_800_000, monthlyVariableExpensesKrw: 600_000 },
      assets: { cashKrw: 2_000_000, investmentsKrw: 1_000_000 }, liabilities: [], goalsV2: [],
    } };
    write(resolveProfilePath(legacy.id), legacy);
    expect((await getProfile(legacy.id))?.profile).toMatchObject(sampleProfile());
  });

  it.each([false, true])("preserves populated v1 amounts through partition/Vault conversion (Vault=%s)", async vault => {
    const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
    if (vault) await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
    write(resolveProfilePath(legacy.id), legacy);
    const loaded = await getProfile(legacy.id);
    expect(loaded?.profile.debts).toHaveLength(legacy.profile.debts.length);
    expect(loaded?.profile.debts[0]).toMatchObject({ balance: 120_000_000, aprPct: 4.2, remainingMonths: 220 });
    expect(loaded?.profile.goals).toHaveLength(legacy.profile.goals.length);
    expect(loaded?.profile.goals[0]).toMatchObject({
      targetAmount: 18_000_000, currentAmount: 8_000_000, targetMonth: 24, minimumMonthlyContribution: 300_000,
    });
    const stored = await vaultStorage.decodeStoragePayload(JSON.parse(fs.readFileSync(resolveProfileRecordPath(legacy.id), "utf8")));
    expect(stored.payload).toMatchObject({ profile: loaded?.profile });
    expect(fs.existsSync(resolveProfilePath(legacy.id))).toBe(false);
  });

  it.each([0, 120_000])("keeps nonempty legacy amount aliases and omitted optional payments (amount=%s)", async amount => {
    const legacy = { ...record("legacy-values"), schemaVersion: 1, profile: {
      ...sampleProfile(), debts: [{ principalKrw: amount }],
      goals: undefined, goalsV2: [{ amount, savedAmount: 0 }],
    } };
    write(resolveProfilePath(legacy.id), legacy);
    const loaded = await getProfile(legacy.id);
    expect(loaded?.profile.debts).toHaveLength(1);
    expect(loaded?.profile.debts[0].balance).toBe(amount);
    expect(loaded?.profile.goals).toHaveLength(1);
    expect(loaded?.profile.goals[0].targetAmount).toBe(amount);
  });

  const durationFields = [
    ["debts", "remainingMonths", "termMonths"],
    ["goals", "targetMonth", "dueMonth"],
  ] as const;
  const invalidDurations = durationFields.flatMap(([collection, primary, alias]) =>
    [primary, alias].flatMap(field => ["broken", null, 0, -1].map(value => ({ collection, primary, alias, field, value }))),
  );
  describe.each(["legacy", "partition"] as const)("stored legacy duration preservation in %s", layout => {
    describe.each([false, true])("Vault enabled=%s", vault => {
      it.each(invalidDurations)("rejects $field=$value before rewriting", async ({ collection, primary, field, value }) => {
        const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
        if (field !== primary) delete legacy.profile[collection][0][primary];
        legacy.profile[collection][0][field] = value;
        const file = layout === "legacy" ? resolveProfilePath(legacy.id) : resolveProfileRecordPath(legacy.id);
        write(file, legacy);
        const before = fileFingerprint(file);
        if (vault) await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
        for (const operation of [() => getProfile(legacy.id), () => listProfiles()]) {
          const result = await operation().catch(error => error);
          expect.soft(result).toBeInstanceOf(StorageCorruptedError);
          expect.soft(fs.existsSync(file) ? fileFingerprint(file) : null).toEqual(before);
          expect.soft(fs.existsSync(file + ".bak")).toBe(false);
          if (layout === "legacy") expect.soft(fs.existsSync(resolveProfileRecordPath(legacy.id))).toBe(false);
        }
      });
    });
  });

  it.each(durationFields)("does not hide invalid %s.%s behind a valid %s alias", async (collection, primary, alias) => {
    const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
    legacy.profile[collection][0][primary] = "broken";
    legacy.profile[collection][0][alias] = 18;
    const file = resolveProfilePath(legacy.id);
    write(file, legacy);
    const before = fileFingerprint(file);
    await expect(getProfile(legacy.id)).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(fileFingerprint(file)).toEqual(before);
    expect(fs.existsSync(resolveProfileRecordPath(legacy.id))).toBe(false);
  });

  describe.each([false, true])("valid legacy durations with Vault=%s", vault => {
    it.each(["omitted", "aliases", "primary wins", "ignored invalid alias", "minimum", "fractional"])("preserves %s and populated values", async scenario => {
      const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
      for (const [collection, primary, alias] of durationFields) {
        if (scenario === "omitted" || scenario === "aliases") delete legacy.profile[collection][0][primary];
        if (scenario === "aliases" || scenario === "primary wins") legacy.profile[collection][0][alias] = 18;
        if (scenario === "ignored invalid alias") legacy.profile[collection][0][alias] = "broken";
        if (scenario === "minimum") legacy.profile[collection][0][primary] = 1;
        if (scenario === "fractional") legacy.profile[collection][0][primary] = 1.5;
      }
      if (vault) await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
      write(resolveProfilePath(legacy.id), legacy);
      const loaded = await getProfile(legacy.id);
      expect(loaded?.profile.debts).toHaveLength(1);
      expect(loaded?.profile.goals).toHaveLength(1);
      expect(loaded?.profile.debts[0]).toMatchObject({ balance: 120_000_000, aprPct: 4.2,
        remainingMonths: scenario === "omitted" ? 36 : scenario === "aliases" ? 18 : ["minimum", "fractional"].includes(scenario) ? 1 : 220 });
      expect(loaded?.profile.goals[0]).toMatchObject({ targetAmount: 18_000_000, currentAmount: 8_000_000,
        minimumMonthlyContribution: 300_000 });
      expect(loaded?.profile.goals[0].targetMonth).toBe(scenario === "omitted" ? undefined : scenario === "aliases" ? 18 : ["minimum", "fractional"].includes(scenario) ? 1 : 24);
      const stored = await vaultStorage.decodeStoragePayload(JSON.parse(fs.readFileSync(resolveProfileRecordPath(legacy.id), "utf8")));
      expect(stored.payload).toMatchObject({ profile: loaded?.profile });
      expect(fs.existsSync(resolveProfilePath(legacy.id))).toBe(false);
    });
  });

  const legacyItemCases = [
    ["debt balance", (legacy: ReturnType<typeof JSON.parse>) => { legacy.profile.debts[0].balance = "broken"; }],
    ["non-object debt", (legacy: ReturnType<typeof JSON.parse>) => {
      legacy.profile.debts[0] = "broken";
      delete legacy.profile.debtOffers; // Optional offer mapping must not mask the malformed item.
    }],
    ["goal amount alias", (legacy: ReturnType<typeof JSON.parse>) => {
      legacy.profile.goalsV2 = [{ goalId: "goal-alias", amount: "broken", savedAmount: 0 }];
      delete legacy.profile.goals;
    }],
  ] as const;
  describe.each(["detail", "list"] as const)("legacy item preservation on %s", operation => {
    describe.each([false, true])("Vault enabled=%s", vault => {
      it.each(legacyItemCases)("rejects %s before normalization or conversion", async (_label, corrupt) => {
        const legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
        corrupt(legacy);
        const file = resolveProfilePath(legacy.id);
        write(file, legacy);
        const before = fileFingerprint(file);
        if (vault) await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
        const result = await (operation === "detail" ? getProfile(legacy.id) : listProfiles()).catch(error => error);
        expect.soft(result).toBeInstanceOf(StorageCorruptedError);
        expect.soft(fs.existsSync(file) ? fileFingerprint(file) : null).toEqual(before);
        expect.soft(fs.existsSync(resolveProfileRecordPath(legacy.id))).toBe(false);
        expect(fs.existsSync(file + ".bak")).toBe(false);
      });
    });
  });

  it("preserves a locked Vault envelope", async () => {
    await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
    const created = await createProfile({ name: "vault", profile: sampleProfile() });
    const file = resolveProfileRecordPath(created.id);
    const before = fileFingerprint(file);
    await lockVault();
    await expect(getProfile(created.id)).rejects.toThrow("VAULT_LOCKED");
    await expect(listProfiles()).rejects.toThrow("VAULT_LOCKED");
    expect(fileFingerprint(file)).toEqual(before);
  });

  it.each(["wrong key", "damaged ciphertext"])("preserves Vault data with %s", async mode => {
    await configureVaultPassphrase({ passphrase: "synthetic-vault-only", autoLockMinutes: 30 });
    const envelope = mode === "wrong key"
      ? encryptJsonWithKey(crypto.randomBytes(32), record("default-profile"))
      : await vaultStorage.encodeStoragePayload(record("default-profile"));
    if (mode === "damaged ciphertext") Object.assign(envelope as object, { ciphertext: "AAAA" });
    const file = resolveProfileRecordPath("default-profile");
    write(file, envelope);
    const before = fileFingerprint(file);
    await expect(getProfile("default-profile")).rejects.toThrow();
    await expect(listProfiles()).rejects.toThrow();
    expect(fileFingerprint(file)).toEqual(before);
  });

  it("preserves a legacy encrypted envelope with the wrong passphrase", async () => {
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "1");
    vi.stubEnv("PLANNING_ENCRYPTION_PASSPHRASE", "synthetic-wrong");
    const file = resolveProfileRecordPath("default-profile");
    write(file, await encryptPlanningJson(record("default-profile"), "synthetic-correct"));
    const before = fileFingerprint(file);
    await expect(getProfile("default-profile")).rejects.toThrow();
    await expect(listProfiles()).rejects.toThrow();
    expect(fileFingerprint(file)).toEqual(before);
  });
});
