import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as preflightPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/preflight/route";
import { POST as applyPOST } from "../src/app/api/planning/v3/profile/drafts/[id]/apply/route";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";
import { createDraftFromBatch, getProfileDraft } from "../src/lib/planning/v3/store/draftStore";
import { createProfile, getProfile, listProfiles, getDefaultProfileId } from "../src/lib/planning/store/profileStore";
import { resolveProfileRecordPath } from "../src/lib/planning/store/paths";
import { simulateMonthly } from "../src/lib/planning/v2/simulateMonthly";
import { loadDashboardViewModel } from "../src/app/dashboard/_lib/dashboardViewModel";
import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";
import { resolvePlanningV3DataDir } from "../src/lib/planning/v3/store/dataDir";

installPlanningAuthRequiredFalseForTest();
function request(id: string, action: string, body: object) {
  return new Request(`http://localhost:4120/api/planning/v3/profile/drafts/${id}/${action}`, {
    method: "POST", body: JSON.stringify(body),
    headers: { host: "localhost:4120", origin: "http://localhost:4120", referer: "http://localhost:4120/planning", "content-type": "application/json" },
  });
}

function bytesTree(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, bytesTree(file));
    else result[file] = fs.readFileSync(file).toString("base64");
  }
  return result;
}

describe("transaction debt to stable profile cashflow", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-draft-debt-"));
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PLANNING_DATA_DIR", root);
    vi.stubEnv("PLANNING_NAMESPACE_ENABLED", "0");
    vi.stubEnv("PLANNING_ENCRYPTION_ENABLED", "0");
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  async function seed(hasDebt: boolean, payment = 500_000) {
    const profile = await createProfile({ name: "기존 A", profile: {
      monthlyIncomeNet: 5_000_000, monthlyEssentialExpenses: 2_000_000, monthlyDiscretionaryExpenses: 800_000,
      liquidAssets: 10_000_000, investmentAssets: 20_000_000,
      debts: hasDebt ? [{ id: "loan", name: "기존 대출", balance: 10_000_000, minimumPayment: payment, aprPct: 4 }] : [],
      goals: [{ id: "goal", name: "목표", targetAmount: 20_000_000, currentAmount: 2_000_000, targetMonth: 24, priority: 3, minimumMonthlyContribution: 0 }],
      cashflow: { rules: { phaseOverlapPolicy: "override" }, phases: [
        { id: "current", title: "현재 월 값 사용", range: { startMonth: 0, endMonth: 0 } },
        { id: "later", title: "이후 소득", range: { startMonth: 25, endMonth: 36 }, monthlyIncomeKrw: 5_500_000 },
      ] },
      tax: { regime: "KR", filingStatus: "single", dependents: 1 },
      pensionsDetailed: { regime: "KR", nationalPension: { expectedMonthlyPayoutKrw: 500_000, startAge: 65 } },
    } });
    const account = await createAccount({ name: "합성 거래", kind: "checking" });
    const batch = await importCsvToBatch({
      csvText: ["date,amount,description", "2026-08-01,5200000,salary", "2026-08-02,-2100000,rent",
        "2026-08-03,-700000,food", "2026-08-04,-500000,loan"].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" }, options: { accountId: account.id },
    });
    for (const row of batch.transactions) await upsertOverride({ batchId: batch.batchMeta.id, txnId: row.txnId,
      categoryId: row.amountKrw > 0 ? "income" : row.amountKrw === -2_100_000 ? "housing" : row.amountKrw === -700_000 ? "food" : "debt" });
    const draft = await createDraftFromBatch(batch.batchMeta.id);
    expect(await getProfileDraft(draft.id)).toEqual(draft);
    return { profile, draft };
  }

  it.each([
    { applyMode: "update", payment: 500_000 }, { applyMode: "create", payment: 500_000 },
    { applyMode: "update", payment: 300_000 }, { applyMode: "create", payment: 300_000 },
  ])("applies non-debt expenses and preserves existing profile fields ($applyMode, payment=$payment)", async ({ applyMode, payment }) => {
    const { profile: base, draft } = await seed(true, payment);
    const beforeBytes = fs.readFileSync(resolveProfileRecordPath(base.id));
    const defaultBefore = await getDefaultProfileId();
    const count = (await listProfiles()).length;
    const context = { params: Promise.resolve({ id: draft.id }) };
    const checked = await preflightPOST(request(draft.id, "preflight", { profileId: base.id, applyMode }), context);
    expect(checked.status).toBe(200);
    const check = (await checked.json()).data;
    expect(check.ok).toBe(true);
    expect(check.warnings).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "OBSERVED_DEBT_WITHOUT_PROFILE_DEBT" })]));
    expect(fs.readFileSync(resolveProfileRecordPath(base.id))).toEqual(beforeBytes);
    const response = await applyPOST(request(draft.id, "apply", { profileId: base.id, applyMode,
      expectedProfileRevision: check.profileRevision, expectedDraftPatchHash: check.draftPatchHash }), context);
    expect(response.status).toBe(200);
    const id = (await response.json()).data.profileId;
    const saved = (await getProfile(id))!;
    expect.soft(saved.profile).toEqual({ ...base.profile, monthlyIncomeNet: 5_200_000,
      monthlyEssentialExpenses: 2_100_000, monthlyDiscretionaryExpenses: 700_000 });
    expect((await listProfiles()).length).toBe(count + (applyMode === "create" ? 1 : 0));
    expect(await getDefaultProfileId()).toBe(defaultBefore);
    if (applyMode === "create") {
      expect(id).not.toBe(base.id);
      expect(fs.readFileSync(resolveProfileRecordPath(base.id))).toEqual(beforeBytes);
    } else expect(id).toBe(base.id);
    const dashboard = await loadDashboardViewModel(async () => [], async () => ({ defaultProfileId: id, profiles: [saved] }), async () => []);
    expect.soft(dashboard.currentProfile).toMatchObject({ state: "loaded", monthlyExpensesKrw: 2_800_000,
      monthlyDebtPaymentKrw: payment, monthlySurplusKrw: 2_400_000 - payment });
    const first = simulateMonthly(saved.profile, { inflation: 0, expectedReturn: 0 }, 1).timeline[0];
    expect.soft(first.operatingCashflow).toBe(2_400_000 - payment);
  });

  it.each(["update", "create", "template"] as const)("warns about unmatched observed debt and never creates a debt (%s)", async (mode) => {
    const { profile: base, draft } = await seed(false);
    const applyMode = mode === "template" ? "create" : mode;
    const target = mode === "template" ? {} : { profileId: base.id };
    const context = { params: Promise.resolve({ id: draft.id }) };
    const checked = await preflightPOST(request(draft.id, "preflight", { ...target, applyMode }), context);
    expect(checked.status).toBe(200);
    const check = (await checked.json()).data;
    expect(check.warnings).toContainEqual({ code: "OBSERVED_DEBT_WITHOUT_PROFILE_DEBT",
      message: "거래에서 부채상환이 관측됐지만 프로필에 부채가 없습니다. 적용 전 초안의 생활지출과 프로필의 부채 정보를 확인해 주세요." });
    expect(check.summary.warningCount).toBeGreaterThan(0);
    const applied = await applyPOST(request(draft.id, "apply", { ...target, applyMode,
      expectedProfileRevision: check.profileRevision, expectedDraftPatchHash: check.draftPatchHash }), context);
    expect(applied.status).toBe(200);
    const saved = (await getProfile((await applied.json()).data.profileId))!;
    expect(saved.profile.debts).toEqual([]);
    expect(saved.profile.monthlyEssentialExpenses).toBe(2_100_000);
    expect(saved.profile.monthlyDiscretionaryExpenses).toBe(700_000);
  });

  it.each([
    { mode: "update", hasDebt: true }, { mode: "create", hasDebt: true }, { mode: undefined, hasDebt: true },
    { mode: "update", hasDebt: false }, { mode: "create", hasDebt: false }, { mode: "template", hasDebt: false },
  ])("rejects an old debt-inclusive draft without any write ($mode, hasDebt=$hasDebt)", async ({ mode, hasDebt }) => {
    const { profile: base, draft } = await seed(hasDebt);
    const file = path.join(resolvePlanningV3DataDir(), "drafts", "profile", `${draft.id}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...draft, draftPatch: { ...draft.draftPatch, monthlyEssentialExpenses: 2_600_000 } }));
    const before = bytesTree(root);
    const context = { params: Promise.resolve({ id: draft.id }) };
    const input = { ...(mode === "template" ? {} : { profileId: base.id }), ...(mode ? { applyMode: mode === "template" ? "create" : mode } : {}) };
    const checked = await preflightPOST(request(draft.id, "preflight", input), context);
    expect(checked.status).toBe(200);
    const check = (await checked.json()).data;
    expect(check.ok).toBe(false);
    expect(check.errors).toContainEqual({ path: "/monthlyEssentialExpenses",
      message: "초안의 생활지출이 월별 부채상환 제외 금액과 다릅니다. 원래 거래 자료에서 새 초안을 생성한 뒤 다시 확인해 주세요." });
    expect(bytesTree(root)).toEqual(before);
    const applied = await applyPOST(request(draft.id, "apply", { ...input,
      expectedProfileRevision: check.profileRevision, expectedDraftPatchHash: check.draftPatchHash }), context);
    expect(applied.status).toBe(400);
    expect(bytesTree(root)).toEqual(before);
  });

  it.each([{}, { ymStats: {} }, { ymStats: [null] }, { ymStats: [{ debtExpenseKrw: "500000" }] }])(
    "preserves preflight for legacy partial evidence %j without inventing debt observations", async (evidence) => {
      const { profile: base, draft } = await seed(false);
      const file = path.join(resolvePlanningV3DataDir(), "drafts", "profile", `${draft.id}.json`);
      fs.writeFileSync(file, JSON.stringify({ ...draft, evidence }));
      const before = bytesTree(root);
      const checked = await preflightPOST(request(draft.id, "preflight", { profileId: base.id, applyMode: "update" }),
        { params: Promise.resolve({ id: draft.id }) });
      expect(checked.status).toBe(200);
      const check = (await checked.json()).data;
      expect(check.ok).toBe(true);
      expect(check.warnings).toEqual([]);
      expect(bytesTree(root)).toEqual(before);
    },
  );
});
