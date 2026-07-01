import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as draftProfilePOST } from "../src/app/api/planning/v3/draft/profile/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

import { installPlanningAuthRequiredFalseForTest } from "./planning/auth/testPlanningAuthEnv";

installPlanningAuthRequiredFalseForTest();

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4600";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;
const REMOTE_HOST = "example.com";
const REMOTE_ORIGIN = `http://${REMOTE_HOST}`;
const EVIL_ORIGIN = "http://evil.com";

function requestJson(
  body: unknown,
  options?: {
    requestOrigin?: string;
    host?: string;
    origin?: string;
    refererOrigin?: string;
  },
): Request {
  const requestOrigin = options?.requestOrigin ?? LOCAL_ORIGIN;
  const host = options?.host ?? new URL(requestOrigin).host;
  const origin = options?.origin ?? requestOrigin;
  const refererOrigin = options?.refererOrigin ?? origin;
  return new Request(`${requestOrigin}/api/planning/v3/draft/profile`, {
    method: "POST",
    headers: {
      host,
      origin,
      referer: `${refererOrigin}/planning/v3/drafts/profile`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function expectOriginMismatch(response: Response | Promise<Response>) {
  const resolved = await response;
  expect(resolved.status).toBe(403);
  const payload = await resolved.json() as { ok?: boolean; error?: { code?: string } };
  expect(payload.ok).toBe(false);
  expect(payload.error?.code).toBe("ORIGIN_MISMATCH");
}

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
  omitRowAccountId?: boolean;
  rows: Array<{
    txnId: string;
    date: string;
    amountKrw: number;
    description: string;
  }>;
}) {
  await saveBatch({
    id: input.batchId,
    createdAt: input.createdAt,
    source: "csv",
    rowCount: input.rows.length,
    accounts: [{ id: input.accountId }],
  }, input.rows.map((row) => ({
    ...row,
    batchId: input.batchId,
    ...(input.omitRowAccountId ? {} : { accountId: input.accountId }),
    source: "csv" as const,
  })));
}

describe("POST /api/planning/v3/draft/profile", () => {
  let root = "";
  let accountId = "";

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-draft-profile-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    const account = await createAccount({
      name: "Main",
      kind: "checking",
    });
    accountId = account.id;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns NO_DATA when batchId is omitted and only pure legacy batches exist", async () => {
    await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,급여",
        "2026-01-02,-500000,월세",
        "2026-02-01,2100000,급여",
        "2026-02-02,-510000,월세",
        "2026-03-01,2200000,급여",
        "2026-03-02,-520000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "a.csv",
    });

    const response = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
    }));
    expect(response.status).toBe(404);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("NO_DATA");
    expect(payload.error?.message).toBe("배치 데이터가 없습니다.");
  });

  it("returns 400 when data has fewer than 3 months", async () => {
    const batchId = "draftshort001";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-02-02T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2000000, description: "급여" },
        { txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-01-02", amountKrw: -500000, description: "월세" },
        { txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2100000, description: "급여" },
        { txnId: "dddddddddddddddddddddddd", date: "2026-02-02", amountKrw: -510000, description: "월세" },
      ],
    });

    const response = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId,
    }));
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.message).toContain("최소 3개월");
  });

  it("ignores legacy unscoped overrides and only applies batch-scoped overrides", async () => {
    const batchId = "draftoverride001";
    const txnIds = [
      "bbbbbbbbbbbbbbbbbbbbbbbb",
      "dddddddddddddddddddddddd",
      "ffffffffffffffffffffffff",
    ];
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2000000, description: "급여" },
        { txnId: txnIds[0]!, date: "2026-01-02", amountKrw: -100000, description: "마트" },
        { txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2000000, description: "급여" },
        { txnId: txnIds[1]!, date: "2026-02-02", amountKrw: -100000, description: "마트" },
        { txnId: "eeeeeeeeeeeeeeeeeeeeeeee", date: "2026-03-01", amountKrw: 2000000, description: "급여" },
        { txnId: txnIds[2]!, date: "2026-03-02", amountKrw: -100000, description: "마트" },
        { txnId: "111111111111111111111111", date: "2026-03-10", amountKrw: -300000, description: "이체" },
        { txnId: "222222222222222222222222", date: "2026-03-10", amountKrw: 300000, description: "이체" },
      ],
    });

    const baseline = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId,
      includeTransfers: 0,
    }));
    expect(baseline.status).toBe(200);
    const baselinePayload = await baseline.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };
    expect(baselinePayload.patch?.monthlyEssentialExpenses).toBe(0);

    for (const txnId of txnIds) {
      await upsertOverride(txnId, { category: "fixed" });
    }

    const legacyIgnored = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId,
      includeTransfers: 0,
    }));
    expect(legacyIgnored.status).toBe(200);
    const legacyIgnoredPayload = await legacyIgnored.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };
    expect(legacyIgnoredPayload.patch?.monthlyEssentialExpenses).toBe(0);

    for (const txnId of txnIds) {
      await upsertOverride({
        batchId,
        txnId,
        categoryId: "housing",
      });
    }

    const overridden = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId,
      includeTransfers: 0,
    }));
    expect(overridden.status).toBe(200);
    const overriddenPayload = await overridden.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };
    expect(overriddenPayload.patch?.monthlyEssentialExpenses).toBe(100000);

    const included = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId,
      includeTransfers: 1,
    }));
    expect(included.status).toBe(200);
    const includedPayload = await included.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };

    expect(includedPayload.patch?.monthlyIncomeNet).toBe(overriddenPayload.patch?.monthlyIncomeNet);
    expect(includedPayload.patch?.monthlyEssentialExpenses).toBe(overriddenPayload.patch?.monthlyEssentialExpenses);
  });

  it("allows same-origin remote host and still blocks cross-origin", async () => {
    const batchId = "draftremote001";
    await saveStoredShadowBatch({
      batchId,
      accountId,
      createdAt: "2026-03-02T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaaaaaaaaaa", date: "2026-01-01", amountKrw: 2100000, description: "급여" },
        { txnId: "bbbbbbbbbbbbbbbbbbbbbbbb", date: "2026-01-02", amountKrw: -500000, description: "월세" },
        { txnId: "cccccccccccccccccccccccc", date: "2026-02-01", amountKrw: 2200000, description: "급여" },
        { txnId: "dddddddddddddddddddddddd", date: "2026-02-02", amountKrw: -510000, description: "월세" },
        { txnId: "eeeeeeeeeeeeeeeeeeeeeeee", date: "2026-03-01", amountKrw: 2300000, description: "급여" },
        { txnId: "ffffffffffffffffffffffff", date: "2026-03-02", amountKrw: -520000, description: "월세" },
      ],
    });

    const sameOrigin = await draftProfilePOST(requestJson(
      {
        csrf: "test",
        source: "csv",
        batchId,
      },
      { requestOrigin: REMOTE_ORIGIN, host: REMOTE_HOST },
    ));
    expect(sameOrigin.status).toBe(200);
    const sameOriginPayload = await sameOrigin.json() as {
      ok?: boolean;
      batchId?: string;
    };
    expect(sameOriginPayload.ok).toBe(true);
    expect(sameOriginPayload.batchId).toBe(batchId);

    await expectOriginMismatch(draftProfilePOST(requestJson(
      {
        csrf: "test",
        source: "csv",
        batchId,
      },
      {
        requestOrigin: REMOTE_ORIGIN,
        host: REMOTE_HOST,
        origin: EVIL_ORIGIN,
        refererOrigin: EVIL_ORIGIN,
      },
    )));
  });

  it("prefers latest stored batch when batchId is omitted and stored batch exists", async () => {
    await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,급여",
        "2026-01-02,-500000,월세",
        "2026-02-01,2100000,급여",
        "2026-02-02,-510000,월세",
        "2026-03-01,2200000,급여",
        "2026-03-02,-520000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "legacy-fallback.csv",
    });

    const storedBatchId = "storedfirstbatch01";
    await saveStoredShadowBatch({
      batchId: storedBatchId,
      accountId,
      createdAt: "2026-04-05T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-02-01", amountKrw: 4000000, description: "급여" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-02-02", amountKrw: -1000000, description: "월세" },
        { txnId: "cccccccccccccccc", date: "2026-03-01", amountKrw: 4100000, description: "급여" },
        { txnId: "dddddddddddddddd", date: "2026-03-02", amountKrw: -1000000, description: "월세" },
        { txnId: "eeeeeeeeeeeeeeee", date: "2026-04-01", amountKrw: 4200000, description: "급여" },
        { txnId: "ffffffffffffffff", date: "2026-04-02", amountKrw: -1000000, description: "월세" },
      ],
    });

    const response = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      batchId?: string;
      patch?: { monthlyIncomeNet?: number };
    };
    expect(payload.ok).toBe(true);
    expect(payload.batchId).toBe(storedBatchId);
    expect(payload.patch?.monthlyIncomeNet).toBe(4100000);
  });

  it("keeps same-id coexistence draft profile on the stored-first visible batch view", async () => {
    const legacy = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,급여",
        "2026-01-02,-500000,월세",
        "2026-02-01,2100000,급여",
        "2026-02-02,-500000,월세",
        "2026-03-01,2200000,급여",
        "2026-03-02,-500000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "legacy-coexist-draft.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId,
      createdAt: "2026-04-05T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-02-01", amountKrw: 4000000, description: "급여" },
        { txnId: "bbbbbbbbbbbbbbbb", date: "2026-02-02", amountKrw: -1000000, description: "월세" },
        { txnId: "cccccccccccccccc", date: "2026-03-01", amountKrw: 4100000, description: "급여" },
        { txnId: "dddddddddddddddd", date: "2026-03-02", amountKrw: -1000000, description: "월세" },
        { txnId: "eeeeeeeeeeeeeeee", date: "2026-04-01", amountKrw: 4200000, description: "급여" },
        { txnId: "ffffffffffffffff", date: "2026-04-02", amountKrw: -1000000, description: "월세" },
      ],
    });

    const response = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId: legacy.batch.id,
    }));
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      batchId?: string;
      patch?: { monthlyIncomeNet?: number; monthlyEssentialExpenses?: number };
    };
    expect(payload.ok).toBe(true);
    expect(payload.batchId).toBe(legacy.batch.id);
    expect(payload.patch?.monthlyIncomeNet).toBe(4100000);
    expect(payload.patch?.monthlyEssentialExpenses).toBe(1000000);
  });
});
