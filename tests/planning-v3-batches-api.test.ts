import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listBatchesGET } from "../src/app/api/planning/v3/transactions/batches/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";
import { DELETE as deleteBatchDELETE, GET as batchDetailGET } from "../src/app/api/planning/v3/transactions/batches/[id]/route";
import { POST as bindBatchAccountPOST } from "../src/app/api/planning/v3/transactions/batches/[id]/account/route";
import { appendBatchFromCsv, readBatchTransactions } from "../src/lib/planning/v3/service/transactionStore";
import {
  classifyHistoricalNoMarkerProvenanceEvidence,
  getStoredFirstLegacyDetailFallbackClass,
  getStoredFirstLegacyDetailSummaryRetentionWindow,
  getStoredFirstPublicCreatedAtString,
  hasHistoricalNoMarkerVisibleFileNameCompatBridge,
  hasHybridRetainedVisibleFileNameCompatBridge,
  hasStoredFirstReadOnlySourceBindingCandidate,
  isOldStoredMetaImportMetadataGap,
  loadStoredFirstBatchTransactions,
} from "../src/lib/planning/v3/transactions/store";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import { upsertOverride } from "../src/lib/planning/v3/store/txnOverridesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const LOCAL_HOST = "localhost:4200";
const LOCAL_ORIGIN = `http://${LOCAL_HOST}`;

function requestJson(url: string, method: "GET" | "POST" | "DELETE", body?: unknown): Request {
  return new Request(`${LOCAL_ORIGIN}${url}`, {
    method,
    headers: {
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
      referer: `${LOCAL_ORIGIN}/planning/v3/import`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function saveStoredShadowBatch(input: {
  batchId: string;
  accountId: string;
  createdAt: string;
  rowCount?: number;
  importMetadata?: {
    diagnostics: {
      rows: number;
      parsed: number;
      skipped: number;
    };
    provenance?: {
      fileName?: string;
      fileNameProvided?: boolean;
    };
    sourceBinding?: {
      artifactSha256: string;
      attestedFileName: string;
      originKind: "writer-handoff";
    };
  };
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
    rowCount: input.rowCount ?? input.rows.length,
    accounts: [{ id: input.accountId }],
    ...(input.importMetadata ? { importMetadata: input.importMetadata } : {}),
  }, input.rows.map((row) => ({
    ...row,
    batchId: input.batchId,
    ...(input.omitRowAccountId ? {} : { accountId: input.accountId }),
    source: "csv" as const,
  })));
}

function saveStoredTransactionsOnly(input: {
  batchId: string;
  fileModifiedAt?: string;
  rows: Array<{
    txnId: string;
    date: string;
    amountKrw: number;
    description: string;
    accountId?: string;
  }>;
}) {
  const root = String(env.PLANNING_DATA_DIR ?? "");
  const filePath = path.join(root, "planning-v3", "batches", `${input.batchId}.ndjson`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const body = input.rows.map((row) => JSON.stringify({
    ...row,
    batchId: input.batchId,
    source: "csv",
  })).join("\n");
  fs.writeFileSync(filePath, body ? `${body}\n` : "", "utf8");
  if (input.fileModifiedAt) {
    const modifiedAt = new Date(input.fileModifiedAt);
    fs.utimesSync(filePath, modifiedAt, modifiedAt);
  }
}

describe("planning v3 batches APIs", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batches-api-"));
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;

    if (typeof originalPlanningDataDir === "string") env.PLANNING_DATA_DIR = originalPlanningDataDir;
    else delete env.PLANNING_DATA_DIR;

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("POST /import-csv accepts optional fileName and returns only batch meta without transaction dump", async () => {
    const response = await importCsvPOST(requestJson(
      "/api/planning/v3/transactions/batches/import-csv",
      "POST",
      {
        csrf: "test",
        fileName: "bootstrap-input.csv",
        csvText: [
          "date,amount,description",
          "2026-03-01,1200000,salary",
          "2026-03-02,-10000,coffee",
        ].join("\n"),
      },
    ));

    expect(response.status).toBe(201);
    const payload = await response.json() as {
      ok?: boolean;
      batchId?: string;
      meta?: { id?: string; rowCount?: number; fileName?: unknown; importMetadata?: unknown };
      data?: unknown;
      transactions?: unknown;
    };
    expect(payload.ok).toBe(true);
    expect(String(payload.batchId ?? "")).not.toBe("");
    expect(payload.meta?.id).toBe(payload.batchId);
    expect(Number(payload.meta?.rowCount)).toBe(2);
    expect(payload.meta?.fileName).toBeUndefined();
    expect(payload.meta?.importMetadata).toBeUndefined();
    expect(payload.data).toBeUndefined();
    expect(payload.transactions).toBeUndefined();
  });

  it("list/detail/delete APIs work end-to-end for stored batches", async () => {
    const created = await importCsvPOST(requestJson(
      "/api/planning/v3/transactions/batches/import-csv",
      "POST",
      {
        csrf: "test",
        csvText: [
          "date,amount,description",
          "2026-04-01,2100000,salary",
          "2026-04-02,-15000,lunch",
        ].join("\n"),
      },
    ));
    const createdPayload = await created.json() as {
      batchId?: string;
    };
    const batchId = String(createdPayload.batchId ?? "");
    expect(batchId).not.toBe("");

    const listResponse = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=10&csrf=test", "GET"),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      data?: Array<{ id?: string; importMetadata?: unknown }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((row) => row.id === batchId)).toBe(true);
    expect((listPayload.data ?? []).find((row) => row.id === batchId)?.importMetadata).toBeUndefined();

    const detailResponse = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json() as {
      ok?: boolean;
      meta?: { id?: string; importMetadata?: unknown };
      data?: Array<{ batchId?: string; txnId?: string }>;
    };
    expect(detailPayload.ok).toBe(true);
    expect(detailPayload.meta?.id).toBe(batchId);
    expect(detailPayload.meta?.importMetadata).toBeUndefined();
    expect(Array.isArray(detailPayload.data)).toBe(true);
    expect((detailPayload.data ?? []).every((row) => row.batchId === batchId)).toBe(true);
    expect((detailPayload.data ?? []).every((row) => typeof row.txnId === "string" && row.txnId.length > 0)).toBe(true);

    const deleteResponse = await deleteBatchDELETE(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "DELETE"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json() as { ok?: boolean; deleted?: boolean };
    expect(deletePayload.ok).toBe(true);
    expect(deletePayload.deleted).toBe(true);
  });

  it("transactions batch list keeps merged public createdAt when stored meta shadows legacy batch", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-08-01,2100000,salary",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "list-created-at-shadow.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-main",
      createdAt: "2026-08-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-08-05", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=10&csrf=test", "GET"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      items?: Array<{ id?: string; createdAt?: string }>;
      data?: Array<{ id?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect((payload.items ?? []).find((row) => row.id === legacy.batch.id)?.createdAt).toBe("2026-08-10T00:00:00.000Z");
    expect((payload.data ?? []).find((row) => row.id === legacy.batch.id)?.createdAt).toBe("2026-08-10T00:00:00.000Z");
  });

  it("transactions batch list expression keeps hidden public createdAt as an empty string", () => {
    expect(getStoredFirstPublicCreatedAtString({
      createdAt: "2026-08-10T00:00:00.000Z",
      policy: { metadataSource: "synthetic" },
    })).toBe("");
  });

  it("transactions batch list discovers synthetic stored-only ndjson batches without an index entry", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticlist001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-09-01",
          amountKrw: 15000,
          description: "bonus",
        },
      ],
    });

    const response = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=20&csrf=test", "GET"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      items?: Array<{ id?: string; createdAt?: string; total?: number }>;
      data?: Array<{ id?: string; createdAt?: string; rowCount?: number }>;
    };
    expect(payload.ok).toBe(true);
    expect((payload.items ?? []).find((row) => row.id === "syntheticlist001")).toEqual(
      expect.objectContaining({
        id: "syntheticlist001",
        createdAt: "",
        total: 1,
      }),
    );
    expect((payload.data ?? []).find((row) => row.id === "syntheticlist001")).toEqual(
      expect.objectContaining({
        id: "syntheticlist001",
        createdAt: "",
        rowCount: 1,
      }),
    );
  });

  it("transactions batch list synthetic batch also resolves in batch detail with the same hidden createdAt boundary", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticlistdetail001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-09-01",
          amountKrw: 15000,
          description: "bonus",
        },
        {
          txnId: "bbbbbbbbbbbbbbbb",
          accountId: "acc-synthetic",
          date: "2026-09-02",
          amountKrw: -5000,
          description: "snack",
        },
      ],
    });

    const listResponse = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=20&csrf=test", "GET"),
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await listResponse.json() as {
      ok?: boolean;
      items?: Array<{ id?: string; createdAt?: string }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.items ?? []).find((row) => row.id === "syntheticlistdetail001")?.createdAt).toBe("");

    const detailResponse = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/syntheticlistdetail001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "syntheticlistdetail001" }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json() as {
      ok?: boolean;
      batch?: { id?: string; createdAt?: string; total?: number };
      meta?: { id?: string; createdAt?: string; rowCount?: number };
      stats?: { total?: number; ok?: number; failed?: number; inferredMonths?: number };
    };
    expect(detailPayload.ok).toBe(true);
    expect(detailPayload.batch).toEqual(expect.objectContaining({
      id: "syntheticlistdetail001",
      createdAt: "",
      total: 2,
    }));
    expect(detailPayload.meta).toEqual(expect.objectContaining({
      id: "syntheticlistdetail001",
      rowCount: 2,
    }));
    expect(detailPayload.meta?.createdAt).toBeUndefined();
    expect(detailPayload.stats).toEqual(expect.objectContaining({
      total: 2,
      ok: 2,
      failed: 0,
      inferredMonths: 1,
    }));
  });

  it("synthetic stored-only batch can be deleted from the command surface once it is discoverable in list", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticdelete001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-09-01",
          amountKrw: 15000,
          description: "bonus",
        },
      ],
    });

    const listed = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=20&csrf=test", "GET"),
    );
    expect(listed.status).toBe(200);
    const listedPayload = await listed.json() as {
      items?: Array<{ id?: string }>;
    };
    expect((listedPayload.items ?? []).some((row) => row.id === "syntheticdelete001")).toBe(true);

    const deleted = await deleteBatchDELETE(
      requestJson("/api/planning/v3/transactions/batches/syntheticdelete001?csrf=test", "DELETE"),
      { params: Promise.resolve({ id: "syntheticdelete001" }) },
    );
    expect(deleted.status).toBe(200);
    const deletedPayload = await deleted.json() as { ok?: boolean; deleted?: boolean };
    expect(deletedPayload.ok).toBe(true);
    expect(deletedPayload.deleted).toBe(true);

    const detailAfterDelete = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/syntheticdelete001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "syntheticdelete001" }) },
    );
    expect(detailAfterDelete.status).toBe(404);
  });

  it("synthetic stored-only batch delete guards when the same batch id still resolves through the legacy batch owner", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-09-01,15000,legacy bonus",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "synthetic-delete-collision.csv",
    });

    saveStoredTransactionsOnly({
      batchId: legacy.batch.id,
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-09-02",
          amountKrw: 17000,
          description: "stored shadow bonus",
        },
      ],
    });

    const deleted = await deleteBatchDELETE(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "DELETE"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(deleted.status).toBe(400);
    const deletedPayload = await deleted.json() as {
      ok?: boolean;
      deleted?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(deletedPayload.ok).toBe(false);
    expect(deletedPayload.deleted).toBeUndefined();
    expect(deletedPayload.error?.code).toBe("INPUT");
    expect(deletedPayload.error?.message).toBe("같은 ID의 기존 배치가 남아 있어 지금 삭제하면 저장 파일만 제거됩니다.");

    const detailAfterGuard = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(detailAfterGuard.status).toBe(200);
  });

  it("stored meta batch delete guards when the same batch id still resolves through the legacy batch owner", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-09-01,15000,legacy bonus",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "stored-meta-delete-collision.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-09-10T00:00:00.000Z",
      rows: [
        {
          txnId: "bbbbbbbbbbbbbbbb",
          date: "2026-09-02",
          amountKrw: 17000,
          description: "stored shadow bonus",
        },
      ],
    });

    const deleted = await deleteBatchDELETE(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "DELETE"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(deleted.status).toBe(400);
    const deletedPayload = await deleted.json() as {
      ok?: boolean;
      deleted?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(deletedPayload.ok).toBe(false);
    expect(deletedPayload.deleted).toBeUndefined();
    expect(deletedPayload.error?.code).toBe("INPUT");
    expect(deletedPayload.error?.message).toBe("같은 ID의 기존 배치가 남아 있어 지금 삭제하면 저장된 배치 정보와 파일만 제거됩니다.");

    const detailAfterGuard = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(detailAfterGuard.status).toBe(200);
    const detailPayload = await detailAfterGuard.json() as {
      batch?: { createdAt?: string; total?: number };
    };
    expect(detailPayload.batch).toEqual(expect.objectContaining({
      createdAt: "2026-09-10T00:00:00.000Z",
      total: 1,
    }));
  });

  it("pure legacy batch delete returns an explicit boundary guard instead of NO_DATA", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-09-01,15000,legacy bonus",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "pure-legacy-delete-boundary.csv",
    });

    const deleted = await deleteBatchDELETE(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "DELETE"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(deleted.status).toBe(400);
    const deletedPayload = await deleted.json() as {
      ok?: boolean;
      deleted?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(deletedPayload.ok).toBe(false);
    expect(deletedPayload.deleted).toBeUndefined();
    expect(deletedPayload.error?.code).toBe("INPUT");
    expect(deletedPayload.error?.message).toBe("기존 배치만 남아 있는 경우 이 삭제 경로는 지원하지 않습니다.");

    const detailAfterGuard = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(detailAfterGuard.status).toBe(200);
    const detailPayload = await detailAfterGuard.json() as {
      batch?: { fileName?: string; total?: number };
    };
    expect(detailPayload.batch).toEqual(expect.objectContaining({
      fileName: "pure-legacy-delete-boundary.csv",
      total: 1,
    }));
  });

  it("synthetic stored-only batch account binding returns an explicit unsupported guard instead of NO_DATA", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticaccount001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          date: "2026-09-01",
          amountKrw: 15000,
          description: "bonus",
        },
      ],
    });

    const response = await bindBatchAccountPOST(
      requestJson("/api/planning/v3/transactions/batches/syntheticaccount001/account", "POST", {
        csrf: "test",
        accountId: "acc-main",
      }),
      { params: Promise.resolve({ id: "syntheticaccount001" }) },
    );
    expect(response.status).toBe(400);
    const payload = await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("INPUT");
    expect(payload.error?.message).toBe("저장 메타가 없는 배치는 아직 계좌 연결을 지원하지 않습니다.");
  });

  it("transactions batch list orders synthetic stored-only batches by latest row date instead of id fallback", async () => {
    saveStoredTransactionsOnly({
      batchId: "synthetic_z_early",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaab",
          accountId: "acc-synthetic",
          date: "2026-09-01",
          amountKrw: 15000,
          description: "older bonus",
        },
      ],
    });
    saveStoredTransactionsOnly({
      batchId: "synthetic_a_late",
      rows: [
        {
          txnId: "bbbbbbbbbbbbbbbb",
          accountId: "acc-synthetic",
          date: "2099-01-05",
          amountKrw: 18000,
          description: "newer bonus",
        },
      ],
    });

    const response = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=20&csrf=test", "GET"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      items?: Array<{ id?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(
      (payload.items ?? [])
        .filter((row) => row.id === "synthetic_a_late" || row.id === "synthetic_z_early")
        .map((row) => row.id),
    ).toEqual(["synthetic_a_late", "synthetic_z_early"]);
    expect((payload.items ?? []).find((row) => row.id === "synthetic_a_late")?.createdAt).toBe("");
    expect((payload.items ?? []).find((row) => row.id === "synthetic_z_early")?.createdAt).toBe("");
  });

  it("transactions batch list falls back from invalid row dates to file stat ordering before epoch", async () => {
    saveStoredTransactionsOnly({
      batchId: "synthetic_z_invalid_early",
      fileModifiedAt: "2026-01-01T00:00:00.000Z",
      rows: [
        {
          txnId: "cccccccccccccccc",
          accountId: "acc-synthetic",
          date: "2026-13-40",
          amountKrw: 15000,
          description: "older invalid bonus",
        },
      ],
    });
    saveStoredTransactionsOnly({
      batchId: "synthetic_a_invalid_late",
      fileModifiedAt: "2099-01-05T00:00:00.000Z",
      rows: [
        {
          txnId: "dddddddddddddddd",
          accountId: "acc-synthetic",
          date: "2026-99-99",
          amountKrw: 18000,
          description: "newer invalid bonus",
        },
      ],
    });

    const response = await listBatchesGET(
      requestJson("/api/planning/v3/transactions/batches?limit=20&csrf=test", "GET"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok?: boolean;
      items?: Array<{ id?: string; createdAt?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(
      (payload.items ?? [])
        .filter((row) => row.id === "synthetic_a_invalid_late" || row.id === "synthetic_z_invalid_early")
        .map((row) => row.id),
    ).toEqual(["synthetic_a_invalid_late", "synthetic_z_invalid_early"]);
    expect((payload.items ?? []).find((row) => row.id === "synthetic_a_invalid_late")?.createdAt).toBe("");
    expect((payload.items ?? []).find((row) => row.id === "synthetic_z_invalid_early")?.createdAt).toBe("");
  });

  it("batch detail ignores legacy unscoped override and applies batch-scoped override", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,-15000,lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "detail-boundary.csv",
    });
    const batchId = created.batch.id;
    const loaded = await readBatchTransactions(batchId);
    const txnId = String(loaded?.transactions?.[0]?.txnId ?? "");
    expect(txnId).not.toBe("");

    await upsertOverride(txnId, { kind: "income" });
    const legacyIgnored = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(legacyIgnored.status).toBe(200);
    const legacyPayload = await legacyIgnored.json() as {
      batch?: { fileName?: string };
      sample?: Array<{ descMasked?: string }>;
      transactions?: Array<{ txnId?: string; kind?: string }>;
    };
    expect(legacyPayload.batch?.fileName).toBe("detail-boundary.csv");
    expect(legacyPayload.sample?.[0]?.descMasked).toBe("lunch");
    expect((legacyPayload.transactions ?? []).find((row) => row.txnId === txnId)?.kind).toBe("expense");

    await upsertOverride({
      batchId,
      txnId,
      kind: "income",
    });
    const scopedApplied = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(scopedApplied.status).toBe(200);
    const scopedPayload = await scopedApplied.json() as {
      transactions?: Array<{ txnId?: string; kind?: string }>;
    };
    expect((scopedPayload.transactions ?? []).find((row) => row.txnId === txnId)?.kind).toBe("income");
  });

  it("batch detail narrows shell and stats total and ok to visible rows while keeping failed and fileName fallback", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "detaillegacycount001",
      createdAt: "2026-04-03T00:00:00.000Z",
      kind: "csv",
      fileName: "detail-legacy-count.csv",
      total: 7,
      ok: 6,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "detail-legacy-count-t1",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        batchId: "detaillegacycount001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-01",
        amountKrw: 1200000,
        description: "salary",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "detail-legacy-count-t2",
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        batchId: "detaillegacycount001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-02",
        amountKrw: -10000,
        description: "coffee",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detaillegacycount001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detaillegacycount001" }) },
    );
    const loaded = await loadStoredFirstBatchTransactions("detaillegacycount001");
    expect(loaded).not.toBeNull();
    expect(getStoredFirstLegacyDetailFallbackClass(loaded!)).toBe("pure-legacy");
    expect(isOldStoredMetaImportMetadataGap(loaded!)).toBe(false);
    expect(getStoredFirstLegacyDetailSummaryRetentionWindow(loaded!)).toEqual({
      fallbackClass: "pure-legacy",
      retainsLegacyBatchFailed: true,
      retainsLegacyStatsFailedViaBatchAlias: true,
      retainsLegacyBatchFileName: true,
    });
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: {
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      stats?: {
        total?: number;
        ok?: number;
        failed?: number;
        inferredMonths?: number;
      };
      transactions?: Array<{ accountId?: string }>;
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      fileName: "detail-legacy-count.csv",
      total: 3,
      ok: 2,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 3,
      ok: 2,
      failed: 1,
      inferredMonths: 1,
    }));
    expect(payload.transactions).toHaveLength(2);
  });

  it("helper classifies hybrid stored meta without importMetadata as old stored meta gap while detail output stays unchanged", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "detailoldstoredgap001",
      createdAt: "2026-04-03T00:00:00.000Z",
      kind: "csv",
      fileName: "legacy-gap-detail.csv",
      total: 7,
      ok: 6,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "detail-old-gap-t1",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        batchId: "detailoldstoredgap001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-01",
        amountKrw: 1200000,
        description: "salary",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "detail-old-gap-t2",
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        batchId: "detailoldstoredgap001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-02",
        amountKrw: -10000,
        description: "coffee",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    await saveStoredShadowBatch({
      batchId: "detailoldstoredgap001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      rowCount: 3,
      rows: [
        { txnId: "cccccccccccccccc", date: "2026-04-05", amountKrw: 9000, description: "stale" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailoldstoredgap001");
    expect(loaded).not.toBeNull();
    expect(getStoredFirstLegacyDetailFallbackClass(loaded!)).toBe("old-stored-meta-importMetadata-gap");
    expect(isOldStoredMetaImportMetadataGap(loaded!)).toBe(true);
    expect(classifyHistoricalNoMarkerProvenanceEvidence(loaded!)).toEqual({
      subset: "origin-fundamentally-unresolved",
      fallbackClass: "old-stored-meta-importMetadata-gap",
      importMetadataState: "missing",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "blank",
      legacyFileNameState: "present",
    });
    expect(hasHistoricalNoMarkerVisibleFileNameCompatBridge(loaded!)).toBe(true);
    expect(getStoredFirstLegacyDetailSummaryRetentionWindow(loaded!)).toEqual({
      fallbackClass: "old-stored-meta-importMetadata-gap",
      retainsLegacyBatchFailed: true,
      retainsLegacyStatsFailedViaBatchAlias: true,
      retainsLegacyBatchFileName: true,
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detailoldstoredgap001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detailoldstoredgap001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: {
        createdAt?: string;
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      stats?: {
        total?: number;
        ok?: number;
        failed?: number;
        inferredMonths?: number;
      };
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      createdAt: "2026-04-10T00:00:00.000Z",
      fileName: "legacy-gap-detail.csv",
      total: 3,
      ok: 2,
      failed: 1,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 3,
      ok: 2,
      failed: 1,
      inferredMonths: 1,
    }));
  });

  it("batch detail prefers stored importMetadata for failed and fileName before legacy summary in hybrid fallback", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "detailstoredowner001",
      createdAt: "2026-04-03T00:00:00.000Z",
      kind: "csv",
      fileName: "legacy-detail.csv",
      total: 3,
      ok: 2,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "detail-stored-owner-t1",
        txnId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        batchId: "detailstoredowner001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-01",
        amountKrw: 1200000,
        description: "salary",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "detail-stored-owner-t2",
        txnId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        batchId: "detailstoredowner001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-02",
        amountKrw: -10000,
        description: "coffee",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    await saveStoredShadowBatch({
      batchId: "detailstoredowner001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      rowCount: 3,
      importMetadata: {
        diagnostics: {
          rows: 3,
          parsed: 2,
          skipped: 0,
        },
        provenance: {
          fileName: "stored-detail.csv",
        },
      },
      rows: [
        { txnId: "cccccccccccccccc", date: "2026-04-05", amountKrw: 9000, description: "stale" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailstoredowner001");
    expect(loaded).not.toBeNull();
    expect(getStoredFirstLegacyDetailFallbackClass(loaded!)).toBe("hybrid-legacy-summary-retained");
    expect(classifyHistoricalNoMarkerProvenanceEvidence(loaded!)).toEqual({
      subset: "marker-missing-but-otherwise-stable",
      fallbackClass: "hybrid-legacy-summary-retained",
      importMetadataState: "present",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "present",
      legacyFileNameState: "present",
    });
    expect(hasHistoricalNoMarkerVisibleFileNameCompatBridge(loaded!)).toBe(false);
    expect(hasHybridRetainedVisibleFileNameCompatBridge(loaded!)).toBe(false);
    expect(getStoredFirstLegacyDetailSummaryRetentionWindow(loaded!)).toEqual({
      fallbackClass: "hybrid-legacy-summary-retained",
      retainsLegacyBatchFailed: false,
      retainsLegacyStatsFailedViaBatchAlias: false,
      retainsLegacyBatchFileName: false,
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detailstoredowner001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detailstoredowner001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: {
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      stats?: {
        total?: number;
        ok?: number;
        failed?: number;
        inferredMonths?: number;
      };
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      fileName: "stored-detail.csv",
      total: 2,
      ok: 2,
      failed: 0,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 2,
      ok: 2,
      failed: 0,
      inferredMonths: 1,
    }));
  });

  it("sourceBinding read-only candidate helper returns true for complete writer-handoff subset", async () => {
    await saveStoredShadowBatch({
      batchId: "detailsourcebinding001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      importMetadata: {
        diagnostics: {
          rows: 2,
          parsed: 2,
          skipped: 0,
        },
        provenance: {
          fileNameProvided: true,
          fileName: "source-binding-detail.csv",
        },
        sourceBinding: {
          artifactSha256: "a".repeat(64),
          attestedFileName: "source-binding-detail.csv",
          originKind: "writer-handoff",
        },
      },
      rows: [
        { txnId: "abababababababab", date: "2026-04-05", amountKrw: 9000, description: "candidate" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailsourcebinding001");
    expect(loaded).not.toBeNull();
    expect(hasStoredFirstReadOnlySourceBindingCandidate(loaded!)).toBe(true);
  });

  it("sourceBinding read-only candidate helper returns false when sourceBinding is absent", async () => {
    await saveStoredShadowBatch({
      batchId: "detailsourcebindingabsent001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      importMetadata: {
        diagnostics: {
          rows: 2,
          parsed: 2,
          skipped: 0,
        },
        provenance: {
          fileNameProvided: true,
          fileName: "source-binding-absent.csv",
        },
      },
      rows: [
        { txnId: "cdcdcdcdcdcdcdcd", date: "2026-04-05", amountKrw: 9000, description: "candidate" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailsourcebindingabsent001");
    expect(loaded).not.toBeNull();
    expect(hasStoredFirstReadOnlySourceBindingCandidate(loaded!)).toBe(false);
  });

  it("sourceBinding read-only candidate helper returns false for partial or invalid bindings", () => {
    const partial = {
      meta: {
        id: "sourcebindingpartial001",
        createdAt: "2026-04-10T00:00:00.000Z",
        source: "csv" as const,
        rowCount: 1,
        importMetadata: {
          diagnostics: {
            rows: 1,
            parsed: 1,
            skipped: 0,
          },
          provenance: {
            fileName: "candidate.csv",
          },
          sourceBinding: {
            artifactSha256: "short",
            attestedFileName: "candidate.csv",
            originKind: "writer-handoff" as const,
          },
        },
      },
    };
    const mismatched = {
      meta: {
        id: "sourcebindingmismatch001",
        createdAt: "2026-04-10T00:00:00.000Z",
        source: "csv" as const,
        rowCount: 1,
        importMetadata: {
          diagnostics: {
            rows: 1,
            parsed: 1,
            skipped: 0,
          },
          provenance: {
            fileName: "candidate.csv",
          },
          sourceBinding: {
            artifactSha256: "b".repeat(64),
            attestedFileName: "other.csv",
            originKind: "writer-handoff" as const,
          },
        },
      },
    };

    expect(hasStoredFirstReadOnlySourceBindingCandidate(partial as never)).toBe(false);
    expect(hasStoredFirstReadOnlySourceBindingCandidate(mismatched as never)).toBe(false);
  });

  it("batch detail keeps stored failed but bridges fileName from legacy summary when hybrid retained provenance is blank", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "detailstoredblankprov001",
      createdAt: "2026-04-03T00:00:00.000Z",
      kind: "csv",
      fileName: "legacy-blank-provenance-detail.csv",
      total: 3,
      ok: 2,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "detail-stored-blank-prov-t1",
        txnId: "dddddddddddddddddddddddd",
        batchId: "detailstoredblankprov001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-01",
        amountKrw: 1200000,
        description: "salary",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "detail-stored-blank-prov-t2",
        txnId: "eeeeeeeeeeeeeeeeeeeeeeee",
        batchId: "detailstoredblankprov001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-02",
        amountKrw: -10000,
        description: "coffee",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    await saveStoredShadowBatch({
      batchId: "detailstoredblankprov001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      rowCount: 3,
      importMetadata: {
        diagnostics: {
          rows: 3,
          parsed: 2,
          skipped: 0,
        },
        provenance: {},
      },
      rows: [
        { txnId: "ffffffffffffffff", date: "2026-04-05", amountKrw: 9000, description: "stale" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailstoredblankprov001");
    expect(loaded).not.toBeNull();
    expect(getStoredFirstLegacyDetailFallbackClass(loaded!)).toBe("hybrid-legacy-summary-retained");
    expect(classifyHistoricalNoMarkerProvenanceEvidence(loaded!)).toEqual({
      subset: "origin-fundamentally-unresolved",
      fallbackClass: "hybrid-legacy-summary-retained",
      importMetadataState: "present",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "blank",
      legacyFileNameState: "present",
    });
    expect(hasHistoricalNoMarkerVisibleFileNameCompatBridge(loaded!)).toBe(true);
    expect(hasHybridRetainedVisibleFileNameCompatBridge(loaded!)).toBe(true);
    expect(getStoredFirstLegacyDetailSummaryRetentionWindow(loaded!)).toEqual({
      fallbackClass: "hybrid-legacy-summary-retained",
      retainsLegacyBatchFailed: false,
      retainsLegacyStatsFailedViaBatchAlias: false,
      retainsLegacyBatchFileName: true,
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detailstoredblankprov001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detailstoredblankprov001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: {
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      stats?: {
        total?: number;
        ok?: number;
        failed?: number;
        inferredMonths?: number;
      };
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      fileName: "legacy-blank-provenance-detail.csv",
      total: 2,
      ok: 2,
      failed: 0,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 2,
      ok: 2,
      failed: 0,
      inferredMonths: 1,
    }));
  });

  it("hybrid retained visible fileName compat bridge predicate stays false when both stored and legacy provenance are blank", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "detailstoredblankboth001",
      createdAt: "2026-04-03T00:00:00.000Z",
      kind: "csv",
      total: 3,
      ok: 2,
      failed: 1,
      accountId: "acc-legacy",
      accountHint: "acc-legacy",
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), [
      JSON.stringify({
        id: "detail-stored-blank-both-t1",
        txnId: "111111111111111111111111",
        batchId: "detailstoredblankboth001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-01",
        amountKrw: 1200000,
        description: "salary",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 2 },
      }),
      JSON.stringify({
        id: "detail-stored-blank-both-t2",
        txnId: "222222222222222222222222",
        batchId: "detailstoredblankboth001",
        createdAt: "2026-04-03T00:00:00.000Z",
        date: "2026-04-02",
        amountKrw: -10000,
        description: "coffee",
        accountId: "acc-legacy",
        source: "csv",
        meta: { rowIndex: 3 },
      }),
    ].join("\n") + "\n");

    await saveStoredShadowBatch({
      batchId: "detailstoredblankboth001",
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      rowCount: 3,
      importMetadata: {
        diagnostics: {
          rows: 3,
          parsed: 2,
          skipped: 0,
        },
        provenance: {},
      },
      rows: [
        { txnId: "3333333333333333", date: "2026-04-05", amountKrw: 9000, description: "stale" },
      ],
    });

    const loaded = await loadStoredFirstBatchTransactions("detailstoredblankboth001");
    expect(loaded).not.toBeNull();
    expect(getStoredFirstLegacyDetailFallbackClass(loaded!)).toBe("hybrid-legacy-summary-retained");
    expect(classifyHistoricalNoMarkerProvenanceEvidence(loaded!)).toEqual({
      subset: "origin-fundamentally-unresolved",
      fallbackClass: "hybrid-legacy-summary-retained",
      importMetadataState: "present",
      fileNameProvidedState: "missing",
      storedProvenanceFileNameState: "blank",
      legacyFileNameState: "blank",
    });
    expect(hasHistoricalNoMarkerVisibleFileNameCompatBridge(loaded!)).toBe(false);
    expect(hasHybridRetainedVisibleFileNameCompatBridge(loaded!)).toBe(false);
    expect(getStoredFirstLegacyDetailSummaryRetentionWindow(loaded!)).toEqual({
      fallbackClass: "hybrid-legacy-summary-retained",
      retainsLegacyBatchFailed: false,
      retainsLegacyStatsFailedViaBatchAlias: false,
      retainsLegacyBatchFileName: false,
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detailstoredblankboth001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detailstoredblankboth001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: {
        fileName?: string;
        total?: number;
        ok?: number;
        failed?: number;
        accountId?: string;
        accountHint?: string;
      };
      stats?: {
        total?: number;
        ok?: number;
        failed?: number;
        inferredMonths?: number;
      };
    };
    expect(payload.batch?.fileName).toBeUndefined();
    expect(payload.batch).toEqual(expect.objectContaining({
      total: 2,
      ok: 2,
      failed: 0,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 2,
      ok: 2,
      failed: 0,
      inferredMonths: 1,
    }));
  });

  it("batch detail preserves detailed category ids instead of collapsing them to unknown", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,-15000,lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "detail-category.csv",
    });
    const batchId = created.batch.id;
    const loaded = await readBatchTransactions(batchId);
    const txnId = String(loaded?.transactions?.[0]?.txnId ?? "");
    expect(txnId).not.toBe("");

    await upsertOverride({
      batchId,
      txnId,
      categoryId: "health",
    });

    const response = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      transactions?: Array<{ txnId?: string; category?: string; categoryId?: string }>;
    };
    const row = (payload.transactions ?? []).find((item) => item.txnId === txnId);
    expect(row?.category).toBe("health");
    expect(row?.categoryId).toBe("health");
  });

  it("batch detail prefers stored snapshot when stored and legacy batches share same id", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,-15000,lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "detail-stored-first.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-04-10T00:00:00.000Z",
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-04-05", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: { createdAt?: string; total?: number; accountId?: string; accountHint?: string };
      sample?: Array<{ amountKrw?: number; descMasked?: string }>;
      stats?: { total?: number; ok?: number; failed?: number; inferredMonths?: number };
      monthsSummary?: Array<{
        ym?: string;
        incomeKrw?: number;
        expenseKrw?: number;
        netKrw?: number;
        txCount?: number;
      }>;
      accountMonthlyNet?: Array<{ accountId?: string; ym?: string; netKrw?: number; txCount?: number }>;
      meta?: { id?: string; rowCount?: number };
      data?: Array<{ amountKrw?: number; description?: string; batchId?: string }>;
      transactions?: Array<{ amountKrw?: number; kind?: string }>;
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      createdAt: "2026-04-10T00:00:00.000Z",
      total: 1,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.sample).toEqual([
      expect.objectContaining({ amountKrw: 9000, descMasked: "bonus" }),
    ]);
    expect(payload.stats).toEqual(expect.objectContaining({ total: 1, ok: 1, failed: 0, inferredMonths: 1 }));
    expect(payload.monthsSummary).toEqual([
      expect.objectContaining({
        ym: "2026-04",
        incomeKrw: 9000,
        expenseKrw: 0,
        netKrw: 9000,
        txCount: 1,
      }),
    ]);
    expect(payload.accountMonthlyNet).toEqual([
      expect.objectContaining({
        accountId: "acc-stored",
        ym: "2026-04",
        netKrw: 9000,
        txCount: 1,
      }),
    ]);
    expect(payload.meta?.id).toBe(legacy.batch.id);
    expect(payload.meta?.rowCount).toBe(1);
    expect(payload.data).toEqual([
      expect.objectContaining({
        batchId: legacy.batch.id,
        amountKrw: 9000,
        description: "bonus",
      }),
    ]);
    expect(payload.transactions?.[0]?.kind).toBe("income");
  });

  it("stored-only batch detail reads failed and fileName from persisted importMetadata owner", async () => {
    const created = await importCsvPOST(requestJson(
      "/api/planning/v3/transactions/batches/import-csv",
      "POST",
      {
        csrf: "test",
        fileName: "stored-owner-detail.csv",
        csvText: [
          "date,amount,description",
          "2026-04-01,1000,ok",
          "2026-13-01,200,invalid-date",
        ].join("\n"),
      },
    ));
    expect(created.status).toBe(201);
    const createdPayload = await created.json() as { batchId?: string };
    const batchId = String(createdPayload.batchId ?? "");
    expect(batchId).not.toBe("");

    const response = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: { fileName?: string; total?: number; ok?: number; failed?: number };
      stats?: { total?: number; ok?: number; failed?: number; inferredMonths?: number };
      meta?: { importMetadata?: unknown; rowCount?: number };
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      fileName: "stored-owner-detail.csv",
      total: 1,
      ok: 1,
      failed: 1,
    }));
    expect(payload.stats).toEqual(expect.objectContaining({
      total: 1,
      ok: 1,
      failed: 1,
      inferredMonths: 1,
    }));
    expect(payload.meta?.importMetadata).toBeUndefined();
    expect(payload.meta?.rowCount).toBe(1);
  });

  it("batch detail keeps same-id coexistence visible binding stored-first while raw rows stay legacy during hybrid fallback", async () => {
    const legacy = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-05-01,3000000,salary",
        "2026-05-02,-500000,rent",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "detail-hybrid.csv",
    });

    await saveStoredShadowBatch({
      batchId: legacy.batch.id,
      accountId: "acc-stored",
      createdAt: "2026-05-10T00:00:00.000Z",
      rowCount: 3,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-05-05", amountKrw: 9000, description: "stale" },
      ],
    });

    const response = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${legacy.batch.id}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: legacy.batch.id }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: { createdAt?: string; fileName?: string; total?: number; accountId?: string; accountHint?: string };
      sample?: Array<{ amountKrw?: number; descMasked?: string }>;
      stats?: { total?: number; ok?: number; failed?: number; inferredMonths?: number };
      accountMonthlyNet?: Array<{ accountId?: string; ym?: string; netKrw?: number; txCount?: number }>;
      transactions?: Array<{ txnId?: string; accountId?: string; amountKrw?: number }>;
      meta?: { createdAt?: string; rowCount?: number; accounts?: Array<{ id?: string }> };
      data?: Array<{ amountKrw?: number; description?: string; accountId?: string }>;
    };
    expect(payload.batch).toEqual(expect.objectContaining({
      createdAt: "2026-05-10T00:00:00.000Z",
      fileName: "detail-hybrid.csv",
      total: 2,
      accountId: "acc-stored",
      accountHint: "acc-stored",
    }));
    expect(payload.sample).toEqual([
      expect.objectContaining({ dateIso: "2026-05-01", amountKrw: 3000000 }),
      expect.objectContaining({ amountKrw: -500000, descMasked: "rent" }),
    ]);
    expect(payload.stats).toEqual(expect.objectContaining({ total: 2, ok: 2, failed: 0 }));
    expect(payload.stats?.inferredMonths).toBe(1);
    expect(payload.accountMonthlyNet).toEqual([
      expect.objectContaining({
        accountId: "acc-stored",
        ym: "2026-05",
        netKrw: 2500000,
        txCount: 2,
      }),
    ]);
    expect(payload.transactions).toEqual([
      expect.objectContaining({ txnId: expect.any(String), accountId: "acc-stored", amountKrw: 3000000 }),
      expect.objectContaining({ txnId: expect.any(String), accountId: "acc-stored", amountKrw: -500000 }),
    ]);
    expect(payload.transactions?.every((row) => row.accountId === "acc-stored")).toBe(true);
    expect(payload.meta).toEqual(expect.objectContaining({
      createdAt: "2026-05-10T00:00:00.000Z",
      rowCount: 3,
      accounts: [expect.objectContaining({ id: "acc-stored" })],
    }));
    expect(payload.data).toHaveLength(2);
    expect(payload.data?.every((row) => row.accountId === "acc-legacy")).toBe(true);
    expect((payload.data ?? []).map((row) => row.amountKrw).sort((a, b) => Number(a) - Number(b))).toEqual([
      -500000,
      3000000,
    ]);
  });

  it("batch detail downgrades batch/meta createdAt under the shared public createdAt boundary when only stored rows exist without stored meta", async () => {
    saveStoredTransactionsOnly({
      batchId: "syntheticdetail001",
      rows: [
        {
          txnId: "aaaaaaaaaaaaaaaa",
          accountId: "acc-synthetic",
          date: "2026-06-01",
          amountKrw: 15000,
          description: "bonus",
        },
      ],
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/syntheticdetail001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "syntheticdetail001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      batch?: { createdAt?: string; total?: number };
      sample?: Array<{ amountKrw?: number; descMasked?: string }>;
      stats?: { total?: number; ok?: number; failed?: number; inferredMonths?: number };
      meta?: { id?: string; createdAt?: string; rowCount?: number };
    };
    expect(payload.batch?.createdAt).toBe("");
    expect(payload.batch?.total).toBe(1);
    expect(payload.sample).toEqual([
      expect.objectContaining({ amountKrw: 15000, descMasked: "bonus" }),
    ]);
    expect(payload.stats).toEqual(expect.objectContaining({ total: 1, ok: 1, failed: 0, inferredMonths: 1 }));
    expect(payload.meta?.id).toBe("syntheticdetail001");
    expect(payload.meta?.rowCount).toBe(1);
    expect(payload.meta?.createdAt).toBeUndefined();
  });

  it("batch detail keeps raw data rows but derives projections from bound rows when stored rows omit accountId", async () => {
    await saveStoredShadowBatch({
      batchId: "detailbinding001",
      accountId: "acc-bound",
      createdAt: "2026-07-10T00:00:00.000Z",
      omitRowAccountId: true,
      rows: [
        { txnId: "aaaaaaaaaaaaaaaa", date: "2026-07-01", amountKrw: 9000, description: "bonus" },
      ],
    });

    const response = await batchDetailGET(
      requestJson("/api/planning/v3/transactions/batches/detailbinding001?csrf=test", "GET"),
      { params: Promise.resolve({ id: "detailbinding001" }) },
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as {
      sample?: Array<{ amountKrw?: number; descMasked?: string }>;
      accountMonthlyNet?: Array<{ accountId?: string; ym?: string; netKrw?: number; txCount?: number }>;
      transactions?: Array<{ txnId?: string; accountId?: string }>;
      data?: Array<{ txnId?: string; accountId?: string }>;
    };
    expect(payload.sample).toEqual([
      expect.objectContaining({ amountKrw: 9000, descMasked: "bonus" }),
    ]);
    expect(payload.accountMonthlyNet).toEqual([
      expect.objectContaining({
        accountId: "acc-bound",
        ym: "2026-07",
        netKrw: 9000,
        txCount: 1,
      }),
    ]);
    expect(payload.transactions).toEqual([
      expect.objectContaining({
        txnId: "aaaaaaaaaaaaaaaa",
        accountId: "acc-bound",
      }),
    ]);
    expect(payload.transactions?.[0]?.accountId).toBe("acc-bound");
    expect(payload.data?.[0]?.txnId).toBe("aaaaaaaaaaaaaaaa");
    expect(payload.data?.[0]?.accountId).toBeUndefined();
    expect(payload.data?.[0]?.accountId).not.toBe(payload.transactions?.[0]?.accountId);
  });
});
