import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as monthlyBalancesGET } from "../src/app/api/planning/v3/balances/monthly/route";
import { GET as batchSummaryGET } from "../src/app/api/planning/v3/batches/[id]/summary/route";
import { GET as getBatchOverrides, POST as postBatchOverride } from "../src/app/api/planning/v3/batches/[id]/txn-overrides/route";
import { GET as batchesGET } from "../src/app/api/planning/v3/batches/route";
import { DELETE as deleteRuleDELETE } from "../src/app/api/planning/v3/categories/rules/[id]/route";
import { GET as listRulesGET, POST as upsertRulePOST } from "../src/app/api/planning/v3/categories/rules/route";
import { POST as draftProfilePOST } from "../src/app/api/planning/v3/draft/profile/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/import/csv/route";
import { GET as profilesGET } from "../src/app/api/planning/v3/profiles/route";
import { GET as scenarioLibraryGET, POST as scenarioLibraryPOST } from "../src/app/api/planning/v3/scenarios/library/route";
import { PATCH as patchAccountOverride } from "../src/app/api/planning/v3/transactions/account-overrides/route";
import { POST as bindBatchAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";
import { GET as batchDetailGET } from "../src/app/api/planning/v3/transactions/batches/[id]/route";
import { GET as cashflowGET } from "../src/app/api/planning/v3/transactions/batches/[id]/cashflow/route";
import { GET as categorizedGET } from "../src/app/api/planning/v3/transactions/batches/[id]/categorized/route";
import { GET as listBatchesGET } from "../src/app/api/planning/v3/transactions/batches/route";
import { POST as importTransactionsCsvPOST } from "../src/app/api/planning/v3/transactions/import/csv/route";
import { PATCH as patchTransferOverride } from "../src/app/api/planning/v3/transactions/transfer-overrides/route";
import { createProfile } from "../src/lib/planning/store/profileStore";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestGet(pathname: string, refererPath: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}${refererPath}`,
    },
  });
}

function requestCrossOrigin(pathname: string, refererPath: string): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method: "GET",
    headers: {
      host: REMOTE_HOST,
      origin: EVIL_ORIGIN,
      referer: `${EVIL_ORIGIN}${refererPath}`,
    },
  });
}

function requestJson(pathname: string, method: "POST" | "PATCH", refererPath: string, body: unknown): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method,
    headers: {
      host: REMOTE_HOST,
      origin: REMOTE_ORIGIN,
      referer: `${REMOTE_ORIGIN}${refererPath}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestCrossOriginJson(pathname: string, method: "POST" | "PATCH", refererPath: string, body: unknown): Request {
  return new Request(`${REMOTE_ORIGIN}${pathname}`, {
    method,
    headers: {
      host: REMOTE_HOST,
      origin: EVIL_ORIGIN,
      referer: `${EVIL_ORIGIN}${refererPath}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as {
    ok?: boolean;
    error?: { code?: string };
  };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

describe("planning v3 user-facing remote host API contract", () => {
  let root = "";
  let accountId = "";
  let batchId = "";
  let txnId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-remote-host-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;

    const account = await createAccount({ name: "Main", kind: "checking" });
    accountId = account.id;

    await createProfile({
      name: "remote-profile",
      profile: {
        monthlyIncomeNet: 3_000_000,
        monthlyEssentialExpenses: 1_200_000,
        monthlyDiscretionaryExpenses: 400_000,
        liquidAssets: 0,
        investmentAssets: 0,
        debts: [],
        goals: [],
      },
    });

    const created = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,3000000,salary",
        "2026-01-02,-1200000,rent",
        "2026-02-01,3100000,salary",
        "2026-02-02,-60000,coffee",
        "2026-03-01,3200000,salary",
        "2026-03-02,-70000,groceries",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "remote-host.csv",
    });
    batchId = created.batch.id;

    const stored = await readBatchTransactions(batchId);
    txnId = String(stored?.transactions?.[0]?.txnId ?? "");
    expect(txnId).toBeTruthy();
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("allows same-origin remote host across transactions and draft/profile user routes", async () => {
    const listResponse = await listBatchesGET(
      requestGet("/api/planning/v3/transactions/batches?limit=10&csrf=test", "/planning/v3/transactions"),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as { ok?: boolean; data?: Array<{ id?: string }> };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((row) => row.id === batchId)).toBe(true);

    const categorizedResponse = await categorizedGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/categorized?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(categorizedResponse.status).toBe(200);

    const batchDetailResponse = await batchDetailGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(batchDetailResponse.status).toBe(200);

    const cashflowResponse = await cashflowGET(
      requestGet(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/cashflow?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(cashflowResponse.status).toBe(200);

    const balancesResponse = await monthlyBalancesGET(
      requestGet(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(batchId)}&includeTransfers=0&csrf=test`, "/planning/v3/balances"),
    );
    expect(balancesResponse.status).toBe(200);

    const batchesResponse = await batchesGET(
      requestGet("/api/planning/v3/batches?csrf=test&limit=10", "/planning/v3/batches"),
    );
    expect(batchesResponse.status).toBe(200);

    const batchSummaryResponse = await batchSummaryGET(
      requestGet(`/api/planning/v3/batches/${encodeURIComponent(batchId)}/summary?csrf=test`, `/planning/v3/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(batchSummaryResponse.status).toBe(200);

    const bindResponse = await bindBatchAccountPOST(
      requestJson(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/account`, "POST", `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`, {
        csrf: "test",
        accountId,
      }),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(bindResponse.status).toBe(200);

    const accountOverrideResponse = await patchAccountOverride(requestJson(
      "/api/planning/v3/transactions/account-overrides",
      "PATCH",
      `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`,
      {
        csrf: "test",
        batchId,
        txnId,
        accountId,
      },
    ));
    expect(accountOverrideResponse.status).toBe(200);

    const transferOverrideResponse = await patchTransferOverride(requestJson(
      "/api/planning/v3/transactions/transfer-overrides",
      "PATCH",
      `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`,
      {
        csrf: "test",
        batchId,
        txnId,
        forceTransfer: true,
      },
    ));
    expect(transferOverrideResponse.status).toBe(200);

    const batchOverrideSave = await postBatchOverride(requestJson(
      `/api/planning/v3/batches/${encodeURIComponent(batchId)}/txn-overrides`,
      "POST",
      `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`,
      {
        csrf: "test",
        txnId,
        kind: "force_income",
        categoryId: "income",
      },
    ), { params: Promise.resolve({ id: batchId }) });
    expect(batchOverrideSave.status).toBe(200);

    const batchOverrideList = await getBatchOverrides(
      requestGet(`/api/planning/v3/batches/${encodeURIComponent(batchId)}/txn-overrides?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(batchOverrideList.status).toBe(200);

    const categoryRuleSave = await upsertRulePOST(requestJson(
      "/api/planning/v3/categories/rules",
      "POST",
      "/planning/v3/categories/rules",
      {
        csrf: "test",
        id: "rule-remote-food",
        categoryId: "food",
        match: { type: "contains", value: "remote-cafe" },
        priority: 80,
        enabled: true,
      },
    ));
    expect(categoryRuleSave.status).toBe(200);

    const categoryRulesList = await listRulesGET(
      requestGet("/api/planning/v3/categories/rules?csrf=test", "/planning/v3/categories/rules"),
    );
    expect(categoryRulesList.status).toBe(200);
    const categoryRulesPayload = await categoryRulesList.json() as { ok?: boolean; items?: Array<{ id?: string }> };
    expect(categoryRulesPayload.ok).toBe(true);
    expect((categoryRulesPayload.items ?? []).some((row) => row.id === "rule-remote-food")).toBe(true);

    const categoryRuleDelete = await deleteRuleDELETE(
      requestGet("/api/planning/v3/categories/rules/rule-remote-food?csrf=test", "/planning/v3/categories/rules"),
      { params: Promise.resolve({ id: "rule-remote-food" }) },
    );
    expect(categoryRuleDelete.status).toBe(200);

    const profilesResponse = await profilesGET(
      requestGet("/api/planning/v3/profiles?csrf=test", "/planning/v3/profile/drafts"),
    );
    expect(profilesResponse.status).toBe(200);
    const profilesPayload = await profilesResponse.json() as { ok?: boolean; data?: Array<{ profileId?: string }> };
    expect(profilesPayload.ok).toBe(true);
    expect((profilesPayload.data ?? []).length).toBeGreaterThanOrEqual(1);

    const draftProfileResponse = await draftProfilePOST(requestJson(
      "/api/planning/v3/draft/profile",
      "POST",
      "/planning/v3/drafts/profile",
      {
        csrf: "test",
        source: "csv",
        batchId,
      },
    ));
    expect(draftProfileResponse.status).toBe(200);
    const draftProfilePayload = await draftProfileResponse.json() as { ok?: boolean; batchId?: string };
    expect(draftProfilePayload.ok).toBe(true);
    expect(draftProfilePayload.batchId).toBe(batchId);

    const importCsvResponse = await importCsvPOST(requestJson(
      "/api/planning/v3/import/csv",
      "POST",
      "/planning/v3/import",
      {
        csrf: "test",
        csvText: [
          "date,amount,description",
          "2026-04-01,1000000,bonus",
          "2026-04-02,-50000,lunch",
        ].join("\n"),
      },
    ));
    expect(importCsvResponse.status).toBe(200);

    const importTransactionsResponse = await importTransactionsCsvPOST(requestJson(
      "/api/planning/v3/transactions/import/csv",
      "POST",
      "/planning/v3/transactions",
      {
        csrf: "test",
        accountId,
        csvText: [
          "date,amount,description",
          "2026-05-01,500000,freelance",
          "2026-05-02,-20000,transport",
        ].join("\n"),
      },
    ));
    expect(importTransactionsResponse.status).toBe(201);

    const scenarioLibraryResponse = await scenarioLibraryGET(
      requestGet("/api/planning/v3/scenarios/library", "/planning/v3/scenarios"),
    );
    expect(scenarioLibraryResponse.status).toBe(200);
    const scenarioLibraryPayload = await scenarioLibraryResponse.json() as {
      ok?: boolean;
      data?: {
        rows?: Array<{ topicId?: string; effectiveEnabled?: boolean }>;
      };
    };
    expect(scenarioLibraryPayload.ok).toBe(true);
    const scenarioRows = scenarioLibraryPayload.data?.rows ?? [];
    expect(scenarioRows.length).toBeGreaterThan(0);

    const firstScenario = scenarioRows[0];
    expect(firstScenario?.topicId).toBeTruthy();

    const scenarioSaveResponse = await scenarioLibraryPOST(requestJson(
      "/api/planning/v3/scenarios/library",
      "POST",
      "/planning/v3/scenarios",
      {
        csrf: "test",
        items: [
          {
            topicId: String(firstScenario?.topicId ?? ""),
            enabled: !(firstScenario?.effectiveEnabled === true),
            order: 0,
          },
        ],
      },
    ));
    expect(scenarioSaveResponse.status).toBe(200);
  });

  it("blocks cross-origin access across transactions/balances GET user routes", async () => {
    await expectOriginMismatch(listBatchesGET(
      requestCrossOrigin("/api/planning/v3/transactions/batches?limit=10&csrf=test", "/planning/v3/transactions"),
    ));

    await expectOriginMismatch(categorizedGET(
      requestCrossOrigin(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/categorized?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    ));

    await expectOriginMismatch(batchDetailGET(
      requestCrossOrigin(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    ));

    await expectOriginMismatch(cashflowGET(
      requestCrossOrigin(`/api/planning/v3/transactions/batches/${encodeURIComponent(batchId)}/cashflow?csrf=test`, `/planning/v3/transactions/batches/${encodeURIComponent(batchId)}`),
      { params: Promise.resolve({ id: batchId }) },
    ));

    await expectOriginMismatch(monthlyBalancesGET(
      requestCrossOrigin(`/api/planning/v3/balances/monthly?batchId=${encodeURIComponent(batchId)}&includeTransfers=0&csrf=test`, "/planning/v3/balances"),
    ));

    await expectOriginMismatch(importCsvPOST(requestCrossOriginJson(
      "/api/planning/v3/import/csv",
      "POST",
      "/planning/v3/import",
      {
        csrf: "test",
        csvText: "date,amount,description\n2026-05-01,1000,test",
      },
    )));

    await expectOriginMismatch(importTransactionsCsvPOST(requestCrossOriginJson(
      "/api/planning/v3/transactions/import/csv",
      "POST",
      "/planning/v3/transactions",
      { csrf: "test", accountId, csvText: "date,amount,description\n2026-05-01,1000,test" },
    )));
  });
});
