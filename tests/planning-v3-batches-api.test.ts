import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listBatchesGET } from "../src/app/api/planning/v3/transactions/batches/route";
import { POST as importCsvPOST } from "../src/app/api/planning/v3/transactions/batches/import-csv/route";
import { DELETE as deleteBatchDELETE, GET as batchDetailGET } from "../src/app/api/planning/v3/transactions/batches/[id]/route";

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

  it("POST /import-csv returns only batch meta without transaction dump", async () => {
    const response = await importCsvPOST(requestJson(
      "/api/planning/v3/transactions/batches/import-csv",
      "POST",
      {
        csrf: "test",
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
      meta?: { id?: string; rowCount?: number };
      data?: unknown;
      transactions?: unknown;
    };
    expect(payload.ok).toBe(true);
    expect(String(payload.batchId ?? "")).not.toBe("");
    expect(payload.meta?.id).toBe(payload.batchId);
    expect(Number(payload.meta?.rowCount)).toBe(2);
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
      data?: Array<{ id?: string }>;
    };
    expect(listPayload.ok).toBe(true);
    expect((listPayload.data ?? []).some((row) => row.id === batchId)).toBe(true);

    const detailResponse = await batchDetailGET(
      requestJson(`/api/planning/v3/transactions/batches/${batchId}?csrf=test`, "GET"),
      { params: Promise.resolve({ id: batchId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json() as {
      ok?: boolean;
      meta?: { id?: string };
      data?: Array<{ batchId?: string; txnId?: string }>;
    };
    expect(detailPayload.ok).toBe(true);
    expect(detailPayload.meta?.id).toBe(batchId);
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
});
