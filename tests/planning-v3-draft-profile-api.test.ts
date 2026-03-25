import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as draftProfilePOST } from "../src/app/api/planning/v3/draft/profile/route";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { buildTxnId } from "../src/lib/planning/v3/service/txnId";
import { createAccount } from "../src/lib/planning/v3/store/accountsStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

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

  it("uses latest batch when batchId is omitted", async () => {
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
    const second = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-02-01,3000000,급여",
        "2026-02-02,-600000,월세",
        "2026-03-01,3100000,급여",
        "2026-03-02,-610000,월세",
        "2026-04-01,3200000,급여",
        "2026-04-02,-620000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "b.csv",
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
    expect(payload.batchId).toBe(second.batch.id);
    expect(typeof payload.patch?.monthlyIncomeNet).toBe("number");
  });

  it("returns 400 when data has fewer than 3 months", async () => {
    const batch = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,급여",
        "2026-01-02,-500000,월세",
        "2026-02-01,2100000,급여",
        "2026-02-02,-510000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "short.csv",
    });

    const response = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId: batch.batch.id,
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
    const batch = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2000000,급여",
        "2026-01-02,-100000,마트",
        "2026-02-01,2000000,급여",
        "2026-02-02,-100000,마트",
        "2026-03-01,2000000,급여",
        "2026-03-02,-100000,마트",
        "2026-03-10,-300000,이체",
        "2026-03-10,300000,이체",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "override.csv",
    });

    const baseline = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId: batch.batch.id,
      includeTransfers: 0,
    }));
    expect(baseline.status).toBe(200);
    const baselinePayload = await baseline.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };
    expect(baselinePayload.patch?.monthlyEssentialExpenses).toBe(0);

    const txnIds: string[] = [];
    for (const dateIso of ["2026-01-02", "2026-02-02", "2026-03-02"]) {
      const txnId = buildTxnId({
        dateIso,
        amountKrw: -100_000,
        descNorm: "마트",
        accountId,
      });
      txnIds.push(txnId);
      await upsertOverride(txnId, { category: "fixed" });
    }

    const legacyIgnored = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId: batch.batch.id,
      includeTransfers: 0,
    }));
    expect(legacyIgnored.status).toBe(200);
    const legacyIgnoredPayload = await legacyIgnored.json() as {
      patch?: { monthlyEssentialExpenses?: number; monthlyIncomeNet?: number };
    };
    expect(legacyIgnoredPayload.patch?.monthlyEssentialExpenses).toBe(0);

    for (const txnId of txnIds) {
      await upsertOverride({
        batchId: batch.batch.id,
        txnId,
        categoryId: "housing",
      });
    }

    const overridden = await draftProfilePOST(requestJson({
      csrf: "test",
      source: "csv",
      batchId: batch.batch.id,
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
      batchId: batch.batch.id,
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
    const batch = await appendBatchFromCsv({
      accountId,
      csvText: [
        "date,amount,description",
        "2026-01-01,2100000,급여",
        "2026-01-02,-500000,월세",
        "2026-02-01,2200000,급여",
        "2026-02-02,-510000,월세",
        "2026-03-01,2300000,급여",
        "2026-03-02,-520000,월세",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "remote-host.csv",
    });

    const sameOrigin = await draftProfilePOST(requestJson(
      {
        csrf: "test",
        source: "csv",
        batchId: batch.batch.id,
      },
      { requestOrigin: REMOTE_ORIGIN, host: REMOTE_HOST },
    ));
    expect(sameOrigin.status).toBe(200);
    const sameOriginPayload = await sameOrigin.json() as {
      ok?: boolean;
      batchId?: string;
    };
    expect(sameOriginPayload.ok).toBe(true);
    expect(sameOriginPayload.batchId).toBe(batch.batch.id);

    await expectOriginMismatch(draftProfilePOST(requestJson(
      {
        csrf: "test",
        source: "csv",
        batchId: batch.batch.id,
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
