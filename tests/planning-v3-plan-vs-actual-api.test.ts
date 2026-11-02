import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as runsGET } from "../src/app/api/planning/v2/runs/route";
import { GET as draftGET } from "../src/app/api/planning/v3/profile/drafts/[id]/route";
import { createProfile } from "../src/lib/planning/store/profileStore";
import { createRun } from "../src/lib/planning/store/runStore";
import { resolveProfileRunMetaPath } from "../src/lib/planning/store/paths";
import { runWithPlanningUserScope } from "../src/lib/planning/store/userScope";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";
import { createDraftFromBatch } from "../src/lib/planning/v3/store/draftStore";
import { comparePlanVsActual } from "../src/lib/planning/v3/service/planVsActual";
import { buildResultDtoV1FromRunRecord } from "../src/lib/planning/v2/resultDto";

function bytes(root: string): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? Object.entries(bytes(file)) : [[file, fs.readFileSync(file).toString("base64")]];
  }));
}
function request(url: string, user = "actual-owner") {
  return new Request(`http://localhost:4120${url}`, { headers: {
    host: "localhost:4120", origin: "http://localhost:4120", "x-planning-user-id": user,
  } });
}

describe("actual comparison existing API scope and no-write", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-plan-actual-"));
    for (const [key, value] of Object.entries({ NODE_ENV: "test", PLANNING_DATA_DIR: root,
      PLANNING_NAMESPACE_ENABLED: "1", PLANNING_AUTH_REQUIRED: "1", PLANNING_TRUST_AUTH_HEADERS: "1", PLANNING_ENCRYPTION_ENABLED: "0" })) vi.stubEnv(key, value);
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it("reads only the owner's same-profile plan and draft without changing any stored bytes", async () => {
    const seed = await runWithPlanningUserScope({ userId: "actual-owner" }, async () => {
      const profile = await createProfile({ name: "A", profile: { monthlyIncomeNet: 9_000_000, monthlyEssentialExpenses: 1,
        monthlyDiscretionaryExpenses: 2, liquidAssets: 0, investmentAssets: 0, debts: [], goals: [] } });
      const resultDto = buildResultDtoV1FromRunRecord({ createdAt: "2026-01-15T00:00:00Z", outputs: {
        simulate: { timeline: [{ income: 5_000_000, expenses: 2_800_000, debtPayment: 500_000 }] },
      } });
      const run = await createRun({ profileId: profile.id, createdAt: "2026-01-15T00:00:00Z", overallStatus: "SUCCESS",
        input: { horizonMonths: 24 }, meta: {}, outputs: { resultDto } });
      await createRun({ profileId: "other-profile", createdAt: "2026-01-31T00:00:00Z", overallStatus: "SUCCESS",
        input: { horizonMonths: 24 }, meta: {}, outputs: { resultDto } });
      const account = await createAccount({ name: "거래", kind: "checking" });
      const batch = await importCsvToBatch({ csvText: ["date,amount,description", "2026-02-01,5200000,income",
        "2026-02-02,-2100000,rent", "2026-02-03,-700000,food", "2026-02-04,-500000,debt"].join("\n"),
        mapping: { dateKey: "date", amountKey: "amount", descKey: "description" }, options: { accountId: account.id } });
      for (const row of batch.transactions) await upsertOverride({ batchId: batch.batchMeta.id, txnId: row.txnId,
        categoryId: row.amountKrw > 0 ? "income" : row.amountKrw === -2_100_000 ? "housing" : row.amountKrw === -700_000 ? "food" : "debt" });
      const draft = await createDraftFromBatch(batch.batchMeta.id);
      return { profile, run, draft, file: resolveProfileRunMetaPath(profile.id, run.id), resultDto };
    });
    await runWithPlanningUserScope({ userId: "other-owner" }, () => createRun({ profileId: seed.profile.id,
      createdAt: "2026-01-31T00:00:00Z", overallStatus: "SUCCESS", input: { horizonMonths: 24 }, meta: {}, outputs: { resultDto: seed.resultDto } }));
    const before = bytes(root);
    const response = await runsGET(request(`/api/planning/v2/runs?profileId=${seed.profile.id}`));
    expect(response.status).toBe(200);
    const listed = (await response.json()).data;
    expect(listed.map((run: { id: string }) => run.id)).toEqual([seed.run.id]);
    const detail = await draftGET(request(`/api/planning/v3/profile/drafts/${seed.draft.id}`), { params: Promise.resolve({ id: seed.draft.id }) });
    expect(detail.status).toBe(200);
    const loaded = (await detail.json()).data;
    expect(comparePlanVsActual(seed.profile.id, loaded.evidence, listed)).toMatchObject({ status: "ready",
      plan: { incomeKrw: 5_000_000 }, actual: { incomeKrw: 5_200_000, operatingCashflowKrw: 1_900_000 } });
    const foreign = await draftGET(request(`/api/planning/v3/profile/drafts/${seed.draft.id}`, "other-owner"), { params: Promise.resolve({ id: seed.draft.id }) });
    expect(foreign.status).toBe(404);
    expect(bytes(root)).toEqual(before);

    // A legacy raw-only record must be projected without manufacturing missing fields or writing it back.
    const legacy = JSON.parse(fs.readFileSync(seed.file, "utf8"));
    legacy.outputs = { simulate: { timeline: [{ income: 5_000_000, cash: 100 }] } };
    fs.writeFileSync(seed.file, JSON.stringify(legacy));
    const beforeLegacyRead = bytes(root);
    const legacyResponse = await runsGET(request(`/api/planning/v2/runs?profileId=${seed.profile.id}`));
    expect(legacyResponse.status).toBe(200);
    expect(comparePlanVsActual(seed.profile.id, loaded.evidence, (await legacyResponse.json()).data))
      .toEqual({ status: "missing-plan-metrics" });
    expect(bytes(root)).toEqual(beforeLegacyRead);

    legacy.outputs.resultDto = { ...seed.resultDto, timeline: { points: [{ label: "start", monthIndex: 0,
      incomeKrw: 0, expensesKrw: 0, debtPaymentKrw: 0 }] } };
    fs.writeFileSync(seed.file, JSON.stringify(legacy));
    const materializedBefore = bytes(root);
    const materializedResponse = await runsGET(request(`/api/planning/v2/runs?profileId=${seed.profile.id}`));
    expect(materializedResponse.status).toBe(200);
    expect(comparePlanVsActual(seed.profile.id, loaded.evidence, (await materializedResponse.json()).data))
      .toEqual({ status: "missing-plan-metrics" });
    expect(bytes(root)).toEqual(materializedBefore);
  });
});
