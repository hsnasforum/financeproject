import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as applyPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/apply/route";
import { POST as preflightPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/preflight/route";
import { createProfile, getProfile, getDefaultProfileId, listProfiles, updateProfile, getProfileUpdateSnapshot } from "../src/lib/planning/store/profileStore";
import { resolveProfileRecordPath, resolveProfilePath } from "../src/lib/planning/store/paths";
import { resolvePlanningV3DataDir } from "../src/lib/planning/v3/store/dataDir";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";
import { configureVaultPassphrase, resetVaultRuntimeForTests } from "../src/lib/planning/security/vaultState";
import { decodeStoragePayload } from "../src/lib/planning/security/vaultStorage";

installPlanningAuthRequiredFalseForTest();
const monthly = { monthlyIncomeNet: 5_200_000, monthlyEssentialExpenses: 2_100_000, monthlyDiscretionaryExpenses: 700_000 };
const draftId = "draft-update";
const context = { params: Promise.resolve({ id: draftId }) };
function request(action: string, body: object, userId?: string) {
  return new Request(`http://localhost:4120/api/planning/v3/profile/drafts/${draftId}/${action}`, {
    method: "POST", body: JSON.stringify(body),
    headers: { host: "localhost:4120", origin: "http://localhost:4120", referer: "http://localhost:4120/planning/v3/profile/drafts", "content-type": "application/json", ...(userId ? { "x-planning-user-id": userId } : {}) },
  });
}
function writeDraft(patch: object = monthly) {
  const dir = path.join(resolvePlanningV3DataDir(), "drafts", "profile");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${draftId}.json`), JSON.stringify({ id: draftId, batchId: "batch-update", createdAt: "2026-09-07T00:00:00.000Z", draftPatch: patch, evidence: { monthsUsed: ["2026-08"] }, assumptions: [], stats: { months: 1 } }));
}
function bytesTree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, bytesTree(full));
    else result[full] = fs.readFileSync(full).toString("base64");
  }
  return result;
}
async function seed() {
  const base = await createProfile({ name: "기존 A", profile: {
    monthlyIncomeNet: 5_000_000, monthlyEssentialExpenses: 2_000_000, monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 10_000_000, investmentAssets: 20_000_000,
    debts: [{ id: "loan", name: "기존 대출", balance: 12_000_000, minimumPayment: 300_000, aprPct: 4 }],
    goals: [{ id: "goal", name: "비상금", targetAmount: 20_000_000, currentAmount: 2_000_000, targetMonth: 24 }],
    cashflow: { contributions: [{ id: "saving", title: "기존 적립", range: { startMonth: 1, endMonth: 12 }, from: "cash", to: "investments", monthlyAmountKrw: 100_000 }] },
    tax: { regime: "KR", filingStatus: "married", dependents: 1 },
    pensionsDetailed: { regime: "KR", nationalPension: { expectedMonthlyPayoutKrw: 500_000, startAge: 65 } },
  } });
  writeDraft();
  return base;
}
async function preflight(profileId: string, userId?: string) {
  const response = await preflightPOST(request("preflight", { profileId, applyMode: "update" }, userId), context);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.data.ok).toBe(true);
  return { profileId, applyMode: "update", expectedProfileRevision: payload.data.profileRevision as string, expectedDraftPatchHash: payload.data.draftPatchHash as string };
}

describe("explicit draft update through the real profile store", () => {
  let root: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-draft-update-"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PLANNING_DATA_DIR", root);
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "0");
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "0");
    vi.stubEnv("PLANNING_VAULT_CONFIG_PATH", path.join(root, "security", "vault.json"));
    await resetVaultRuntimeForTests();
  });
  afterEach(async () => { vi.restoreAllMocks(); await resetVaultRuntimeForTests(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it.each(["current", "legacy timestamp"])("updates only the three supplied fields, retains default/count and survives a new process (%s)", async (timestamp) => {
    const base = await seed();
    const file = resolveProfileRecordPath(base.id);
    const original = JSON.parse(fs.readFileSync(file, "utf8"));
    original.profile.existingOptional = { retained: true };
    if (timestamp === "legacy timestamp") original.updatedAt = "legacy timestamp";
    fs.writeFileSync(file, JSON.stringify(original));
    const count = (await listProfiles()).length;
    const defaultBefore = await getDefaultProfileId();
    const input = await preflight(base.id);
    const response = await applyPOST(request("apply", input), context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.profileId).toBe(base.id);
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(stored).toEqual({ ...original, profile: { ...original.profile, ...monthly }, updatedAt: stored.updatedAt });
    expect(stored.updatedAt).not.toBe(original.updatedAt);
    expect(await getDefaultProfileId()).toBe(defaultBefore);
    expect((await listProfiles()).length).toBe(count);
    expect((await getProfile(base.id))?.profile).toEqual({ ...base.profile, ...monthly });
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `const m = await import('./src/lib/planning/store/profileStore.ts'); const s = m.default ?? m; console.log(JSON.stringify(await s.getProfile(${JSON.stringify(base.id)})));`], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout).profile).toEqual({ ...base.profile, ...monthly });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(stored);
  });

  it.each([
    { location: "partition", vault: false }, { location: "legacy", vault: false },
    { location: "partition", vault: true }, { location: "legacy", vault: true },
  ])("updates monthly aliases and preserves the schedule ($location, Vault=$vault)", async ({ location, vault }) => {
    const base = await seed();
    const partition = resolveProfileRecordPath(base.id);
    const file = location === "legacy" ? resolveProfilePath(base.id) : partition;
    const original = JSON.parse(fs.readFileSync(partition, "utf8"));
    original.profile.cashflow = { ...original.profile.cashflow,
      monthlyIncomeKrw: 5_000_000, monthlyFixedExpensesKrw: 2_000_000, monthlyVariableExpensesKrw: 800_000,
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(original));
    if (location === "legacy") fs.unlinkSync(partition);
    if (vault) await configureVaultPassphrase({ passphrase: "synthetic-draft-test-only", autoLockMinutes: 30 });
    const input = await preflight(base.id);
    expect((await applyPOST(request("apply", input), context)).status).toBe(200);
    const stored = (await decodeStoragePayload(JSON.parse(fs.readFileSync(file, "utf8")))).payload as typeof original;
    expect(stored.profile).toEqual({ ...original.profile, ...monthly, cashflow: { ...original.profile.cashflow,
      monthlyIncomeKrw: 5_200_000, monthlyFixedExpensesKrw: 2_100_000, monthlyVariableExpensesKrw: 700_000,
    } });
    expect((await getProfile(base.id))?.profile).toEqual({ ...base.profile, ...monthly });
    expect((await listProfiles()).length).toBe(1);
  });

  it.each([undefined, "create"])("preserves create-copy behavior for mode %s", async (applyMode) => {
    const base = await seed();
    const file = resolveProfileRecordPath(base.id);
    const before = fs.readFileSync(file);
    const count = (await listProfiles()).length;
    const response = await applyPOST(request("apply", { profileId: base.id, ...(applyMode ? { applyMode } : {}) }), context);
    expect(response.status).toBe(200);
    expect((await response.json()).data.profileId).not.toBe(base.id);
    expect((await listProfiles()).length).toBe(count + 1);
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it.each(["missing-id", "missing-profile", "missing-preflight", "invalid-mode"])("rejects %s without any write", async (caseName) => {
    const base = await seed();
    const input: Record<string, unknown> = { ...await preflight(base.id) };
    if (caseName === "missing-id") delete input.profileId;
    if (caseName === "missing-profile") input.profileId = "missing-profile";
    if (caseName === "missing-preflight") delete input.expectedProfileRevision;
    if (caseName === "invalid-mode") input.applyMode = "replace";
    const before = bytesTree(root);
    const response = await applyPOST(request("apply", input), context);
    expect(response.status).toBe(caseName === "missing-profile" ? 404 : 400);
    expect(bytesTree(root)).toEqual(before);
  });

  it.each(["profile", "draft"])("conflicts after %s changes, then accepts a fresh preflight", async (changed) => {
    const base = await seed();
    const input = await preflight(base.id);
    if (changed === "profile") await updateProfile(base.id, { name: "이름 변경" });
    else writeDraft({ ...monthly, monthlyIncomeNet: 5_300_000 });
    const before = bytesTree(root);
    const response = await applyPOST(request("apply", input), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
    expect(bytesTree(root)).toEqual(before);
    expect((await applyPOST(request("apply", await preflight(base.id)), context)).status).toBe(200);
  });

  it("serializes concurrent update requests so exactly one revision commits", async () => {
    const base = await seed();
    const input = await preflight(base.id);
    const responses = await Promise.all([applyPOST(request("apply", input), context), applyPOST(request("apply", input), context)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await listProfiles()).length).toBe(1);
  });

  it("keeps a legacy update when a migration reader overlaps the atomic replacement", async () => {
    const base = await seed();
    const legacyPath = resolveProfilePath(base.id);
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.renameSync(resolveProfileRecordPath(base.id), legacyPath);
    const input = await preflight(base.id);
    let entered!: () => void;
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { entered = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    const rename = fsp.rename.bind(fsp);
    vi.spyOn(fsp, "rename").mockImplementation(async (from, to) => {
      if (String(to) === legacyPath) { entered(); await resumed; }
      return rename(from, to);
    });
    const applying = applyPOST(request("apply", input), context);
    await paused;
    const reading = getProfile(base.id);
    release();
    expect((await applying).status).toBe(200);
    expect((await reading)?.profile).toEqual({ ...base.profile, ...monthly });
    expect((await getProfile(base.id))?.profile).toEqual({ ...base.profile, ...monthly });
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect((await listProfiles()).length).toBe(1);
  });

  it.each([{ monthlyIncomeNet: -1 }, { monthlyIncomeNet: "invalid" }, {}])("rejects invalid/empty monthly draft %j without writes", async (patch) => {
    const base = await seed();
    const input = await preflight(base.id);
    writeDraft(patch);
    const before = bytesTree(root);
    const response = await applyPOST(request("apply", input), context);
    expect([400, 409]).toContain(response.status);
    expect(bytesTree(root)).toEqual(before);
  });

  it("validates server-side even with a fresh hash for an invalid draft", async () => {
    const base = await seed();
    writeDraft({ monthlyIncomeNet: -1 });
    const checked = await preflightPOST(request("preflight", { profileId: base.id, applyMode: "update" }), context);
    const data = (await checked.json()).data;
    expect(data.ok).toBe(false);
    const before = bytesTree(root);
    const response = await applyPOST(request("apply", { profileId: base.id, applyMode: "update", expectedProfileRevision: data.profileRevision, expectedDraftPatchHash: data.draftPatchHash }), context);
    expect(response.status).toBe(400);
    expect(bytesTree(root)).toEqual(before);
  });

  it("ignores nonmonthly patch fields and preserves missing monthly values", async () => {
    const base = await seed();
    writeDraft({ monthlyIncomeNet: 5_200_000, liquidAssets: 0, debts: [], goals: [] });
    const input = await preflight(base.id);
    expect((await applyPOST(request("apply", input), context)).status).toBe(200);
    expect((await getProfile(base.id))?.profile).toEqual({ ...base.profile, monthlyIncomeNet: 5_200_000 });
  });

  it.each(["target", "sibling"])("keeps P0 corruption semantics and every byte for corrupt %s", async (target) => {
    const base = await seed();
    const sibling = target === "sibling" ? await createProfile({ name: "other", profile: base.profile }) : base;
    const input = await preflight(base.id);
    fs.writeFileSync(resolveProfileRecordPath(sibling.id), "{broken");
    const before = bytesTree(root);
    for (const action of ["preflight", "apply"]) {
      const response = action === "apply" ? await applyPOST(request(action, input), context) : await preflightPOST(request(action, input), context);
      expect(response.status).toBe(500);
      expect((await response.json()).error.code).toBe("STORAGE_CORRUPT");
      expect(bytesTree(root)).toEqual(before);
    }
  });

  it("keeps the original file when the atomic replacement fails", async () => {
    const base = await seed();
    const input = await preflight(base.id);
    const before = bytesTree(root);
    vi.spyOn(fsp, "rename").mockRejectedValueOnce(Object.assign(new Error("fixture write failure"), { code: "EIO" }));
    const response = await applyPOST(request("apply", input), context);
    expect(response.status).toBe(500);
    expect(bytesTree(root)).toEqual(before);
  });

  it("cannot update another user's profile even with its revision", async () => {
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "1");
    vi.stubEnv("PLANNING_AUTH_REQUIRED", "1");
    vi.stubEnv("PLANNING_TRUST_AUTH_HEADERS", "1");
    const alice = await runWithPlanningUserScope({ userId: "alice" }, seed);
    const revision = await runWithPlanningUserScope({ userId: "alice" }, () => getProfileUpdateSnapshot(alice.id));
    await runWithPlanningUserScope({ userId: "bob" }, seed);
    const before = bytesTree(root);
    const response = await applyPOST(request("apply", { profileId: alice.id, applyMode: "update", expectedProfileRevision: revision!.revision, expectedDraftPatchHash: "untrusted" }, "bob"), context);
    expect(response.status).toBe(404);
    expect(bytesTree(root)).toEqual(before);
  });
});
