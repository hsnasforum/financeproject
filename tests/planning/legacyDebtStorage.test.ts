import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProfile, listProfiles } from "../../src/lib/planning/store/profileStore";
import { resolveProfilePath, resolveProfileRecordPath } from "../../src/lib/planning/store/paths";
import { StorageCorruptedError } from "../../src/lib/planning/storage/serverFileRead";
import { configureVaultPassphrase, resetVaultRuntimeForTests } from "../../src/lib/planning/security/vaultState";
import { decodeStoragePayload, encodeStoragePayload } from "../../src/lib/planning/security/vaultStorage";
import { isVaultEncryptedEnvelope } from "../../src/lib/planning/crypto/vaultCrypto";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

vi.mock("../../src/lib/planning/migrations/manager", () => ({
  runPlanningMigrationsOnStartup: vi.fn(async () => ({ result: "ok" })),
}));

const repository = process.cwd();
const execFileAsync = promisify(execFile);
function fixture(liabilities = false) {
  const record = JSON.parse(fs.readFileSync(path.join(repository, "tests/fixtures/compat/profile-record-v1.json"), "utf8"));
  if (liabilities) {
    record.profile.liabilities = [{ liabilityId: "loan-legacy", principalKrw: 120_000_000, ratePct: 4.2, termMonths: 220, monthlyPayment: 920_000 }];
    delete record.profile.debts;
    delete record.profile.debtOffers;
  }
  return record;
}
function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}
function fingerprintTree(dir: string): Record<string, unknown> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const file = path.join(dir, entry.name);
    const bytes = entry.isDirectory() ? undefined : fs.readFileSync(file);
    return [entry.name, bytes ? { bytes, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), mtimeMs: fs.statSync(file).mtimeMs } : fingerprintTree(file)];
  }));
}
function expectAmounts(profile: ProfileV2 | undefined, liabilities: boolean) {
  expect(profile?.debts).toEqual([{
    id: liabilities ? "loan-legacy" : "loan-compat-1", name: liabilities ? "Debt 1" : "주담대",
    balance: 120_000_000, aprPct: 4.2, remainingMonths: 220, minimumPayment: 920_000, repaymentType: "amortizing",
  }]);
  expect(profile?.goals).toEqual([{ ...fixture().profile.goals[0], name: "Emergency Fund" }]);
}

describe("legacy debt storage integrity", () => {
  let root: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-legacy-debt-"));
    vi.stubEnv("PLANNING_DATA_DIR", path.join(root, ".data", "planning"));
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "0");
    vi.stubEnv("PLANNING_SINGLE_USER_MODE", "0");
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "0");
    for (const [key, relative] of Object.entries({
      PLANNING_PROFILES_DIR: "profiles", PLANNING_PROFILE_PARTITIONS_DIR: "vault/profiles",
      PLANNING_PROFILE_META_PATH: "vault/profiles.meta.json", PLANNING_PROFILE_REGISTRY_PATH: "vault/profiles/index.json",
      PLANNING_RUNS_DIR: "runs", PLANNING_TRASH_DIR: "trash", PLANNING_VAULT_CONFIG_PATH: "security/vault.json",
    })) vi.stubEnv(key, path.join(root, ".data", "planning", relative));
    await resetVaultRuntimeForTests();
  });
  afterEach(async () => {
    await resetVaultRuntimeForTests();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe.each([false, true])("Vault enabled=%s", vault => {
    beforeEach(async () => {
      if (vault) await configureVaultPassphrase({ passphrase: "synthetic-legacy-debt", autoLockMinutes: 30 });
    });
    it.each([false, true])("preserves all v1 amounts through partition conversion, liabilities=%s", async liabilities => {
      const raw = fixture(liabilities);
      write(resolveProfilePath(raw.id), raw);
      const loaded = await getProfile(raw.id);
      expectAmounts(loaded?.profile, liabilities);
      const stored = JSON.parse(fs.readFileSync(resolveProfileRecordPath(raw.id), "utf8"));
      expect(isVaultEncryptedEnvelope(stored)).toBe(vault);
      expect((await decodeStoragePayload(stored)).payload).toMatchObject({ schemaVersion: 2, profile: loaded?.profile });
      expectAmounts((await listProfiles()).find(row => row.id === raw.id)?.profile, liabilities);
      expect(fs.existsSync(resolveProfilePath(raw.id))).toBe(false);
    });

    describe.each(["legacy", "partition"] as const)("%s layout", layout => {
      it.each(["920000", "broken", null, -1])("rejects explicit monthlyPayment=%s before any rewrite", async value => {
        const raw = fixture();
        raw.profile.debts[0].monthlyPayment = value;
        const file = layout === "legacy" ? resolveProfilePath(raw.id) : resolveProfileRecordPath(raw.id);
        write(file, raw);
        const before = fingerprintTree(root);
        for (const operation of [() => getProfile(raw.id), () => listProfiles()]) {
          const result = await operation().catch(error => error);
          expect.soft(result).toBeInstanceOf(StorageCorruptedError);
          expect.soft(fingerprintTree(root)).toEqual(before);
        }
      });
    });

    it("rejects invalid liabilities payment without rewriting", async () => {
      const raw = fixture(true);
      raw.profile.liabilities[0].monthlyPayment = "broken";
      write(resolveProfilePath(raw.id), raw);
      const before = fingerprintTree(root);
      await expect(getProfile(raw.id)).rejects.toBeInstanceOf(StorageCorruptedError);
      expect(fingerprintTree(root)).toEqual(before);
    });
  });

  it("preserves an already encrypted legacy payload with invalid monthlyPayment", async () => {
    await configureVaultPassphrase({ passphrase: "synthetic-legacy-debt", autoLockMinutes: 30 });
    const raw = fixture();
    raw.profile.debts[0].monthlyPayment = "broken";
    write(resolveProfileRecordPath(raw.id), await encodeStoragePayload(raw));
    const before = fingerprintTree(root);
    await expect(getProfile(raw.id)).rejects.toBeInstanceOf(StorageCorruptedError);
    await expect(listProfiles()).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(fingerprintTree(root)).toEqual(before);
  });

  it.each(["minimumPayment", "minimumPaymentKrw", "monthlyPaymentKrw"])("retains supplied-null rejection and valid %s precedence", async alias => {
    const raw = fixture();
    raw.profile.debts[0][alias] = null;
    write(resolveProfilePath(raw.id), raw);
    const before = fingerprintTree(root);
    await expect(getProfile(raw.id)).rejects.toBeInstanceOf(StorageCorruptedError);
    expect(fingerprintTree(root)).toEqual(before);
    raw.profile.debts[0][alias] = 910_000;
    raw.profile.debts[0].monthlyPayment = "ignored-lower-priority";
    write(resolveProfilePath(raw.id), raw);
    expect((await getProfile(raw.id))?.profile.debts[0].minimumPayment).toBe(910_000);
  });

  // A subprocess imports real modules: the Vitest startup mock above cannot mask migration writes.
  async function fresh(operation: "get" | "list") {
    const url = (p: string) => JSON.stringify(pathToFileURL(path.join(repository, p)).href);
    const program = `
      const unwrap = mod => mod.default ?? mod;
      const store = unwrap(await import(${url("src/lib/planning/store/profileStore.ts")}));
      const gate = unwrap(await import(${url("src/lib/planning/store/startupMigrationGate.ts")}));
      process.chdir(${JSON.stringify(root)});
      const result = { pid: process.pid };
      try { result.value = ${operation === "get" ? 'await store.getProfile("compat-profile-1")' : "(await store.listProfiles())[0]"}; }
      catch (error) { result.error = error.name; }
      result.startup = gate.getPlanningStartupMigrationGateSnapshot();
      process.stdout.write(JSON.stringify(result));
    `;
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) {
      if (key.startsWith("PLANNING_") || ["AUTH_SECRET", "NEXTAUTH_SECRET"].includes(key)) delete childEnv[key];
    }
    Object.assign(childEnv, { NODE_ENV: "test", PLANNING_DATA_DIR: path.join(root, ".data", "planning"),
      PLANNING_NAMESPACE_ENABLED: "0", PLANNING_SINGLE_USER_MODE: "0", DATABASE_URL: `file:${path.join(root, "test.db")}` });
    const child = await execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", program], {
      cwd: repository, env: childEnv, timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    return JSON.parse(child.stdout) as { pid: number; error?: string; value?: { profile: ProfileV2 }; startup: { result: string } | null };
  }

  it.each([false, true])("preserves amounts across actual fresh-process startup and reload, liabilities=%s", async liabilities => {
    const raw = fixture(liabilities);
    const legacy = resolveProfilePath(raw.id);
    write(legacy, raw);
    const before = fs.readFileSync(legacy);
    const first = await fresh("get");
    expect(first.error).toBeUndefined();
    expectAmounts(first.value?.profile, liabilities);
    expect(first.startup?.result).toBe("ok");
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.readFileSync(legacy + ".bak")).toEqual(before);
    const second = await fresh("get");
    expect(second.pid).not.toBe(first.pid);
    expect(second.error).toBeUndefined();
    expectAmounts(second.value?.profile, liabilities);
  }, 60_000);

  it.each(["string", "null", "NaN JSON token"])("blocks %s before real startup writes", async kind => {
    const raw = fixture();
    raw.profile.debts[0].monthlyPayment = kind === "string" ? "920000" : null;
    const bytes = JSON.stringify(raw);
    // NaN cannot be stored as a JSON number; JSON.stringify(NaN) also becomes null.
    write(resolveProfilePath(raw.id), kind === "NaN JSON token" ? bytes.replace('"monthlyPayment":null', '"monthlyPayment":NaN') : bytes);
    const before = fingerprintTree(path.join(root, ".data"));
    const pids: number[] = [];
    for (const operation of ["get", "list"] as const) {
      const result = await fresh(operation);
      pids.push(result.pid);
      expect.soft(result.error).toBe("StorageCorruptedError");
      expect.soft(result.startup).toBeNull();
      expect.soft(fingerprintTree(path.join(root, ".data"))).toEqual(before);
    }
    expect(new Set(pids).size).toBe(2);
  }, 60_000);
});
