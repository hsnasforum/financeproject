import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendBatchFromCsv, listBatches, readAllTransactions, readBatch } from "../src/lib/planning/v3/service/transactionStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

const MARKER = "PII_SHOULD_NOT_LEAK";

function parseNdjson(filePath: string): Array<Record<string, unknown>> {
  const text = fs.readFileSync(filePath, "utf-8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("planning v3 transactionStore", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-tx-store-"));
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

  it("appendBatchFromCsv creates deterministic batch/index for the same input", async () => {
    const csvText = [
      "date,amount,description",
      "2026-01-01,1200,salary",
      "2026-01-02,-300,lunch",
    ].join("\n");

    const first = await appendBatchFromCsv({
      csvText,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "test.csv",
    });

    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    const recordsPath = path.join(root, "v3", "transactions", "records.ndjson");
    const firstRecords = parseNdjson(recordsPath).map((row) => ({
      id: String(row.id),
      batchId: String(row.batchId),
      date: String(row.date),
      amountKrw: Number(row.amountKrw),
      description: typeof row.description === "string" ? row.description : "",
    }));

    const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-tx-store-"));
    env.PLANNING_DATA_DIR = secondRoot;
    try {
      const second = await appendBatchFromCsv({
        csvText,
        mapping: {
          dateKey: "date",
          amountKey: "amount",
          descKey: "description",
        },
        accountId: "acc-main",
        fileName: "test.csv",
      });

      const secondRecordsPath = path.join(secondRoot, "v3", "transactions", "records.ndjson");
      const secondRecords = parseNdjson(secondRecordsPath).map((row) => ({
        id: String(row.id),
        batchId: String(row.batchId),
        date: String(row.date),
        amountKrw: Number(row.amountKrw),
        description: typeof row.description === "string" ? row.description : "",
      }));

      expect(first.batch.id).toBe(second.batch.id);
      expect(first.batch.sha256).toBe(second.batch.sha256);
      expect(first.stats).toEqual(second.stats);
      expect(firstRecords).toEqual(secondRecords);
      expect(fs.existsSync(batchesPath)).toBe(true);
      expect(fs.existsSync(recordsPath)).toBe(true);
    } finally {
      fs.rmSync(secondRoot, { recursive: true, force: true });
      env.PLANNING_DATA_DIR = root;
    }
  });

  it("redacts marker from stored records and readBatch response", async () => {
    const csvText = [
      "date,amount,description",
      `2026-02-01,1500,${MARKER} 123456789`,
    ].join("\n");

    const created = await appendBatchFromCsv({
      csvText,
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "secret.csv",
    });

    const recordsPath = path.join(root, "v3", "transactions", "records.ndjson");
    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");

    const recordsText = fs.readFileSync(recordsPath, "utf-8");
    const batchesText = fs.readFileSync(batchesPath, "utf-8");

    expect(recordsText).not.toContain(MARKER);
    expect(batchesText).not.toContain(MARKER);

    const detail = await readBatch(created.batch.id);
    expect(detail).not.toBeNull();

    const detailText = JSON.stringify(detail);
    expect(detailText).not.toContain(MARKER);
  });

  it("listBatches and readBatch remain consistent after multiple appends", async () => {
    const first = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000,a",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "a.csv",
    });

    const second = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,2000,b",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "b.csv",
    });

    const listed = await listBatches({ limit: 10 });
    const ids = listed.items.map((row) => row.id);
    expect(ids).toContain(first.batch.id);
    expect(ids).toContain(second.batch.id);

    const detail = await readBatch(second.batch.id);
    expect(detail).not.toBeNull();
    expect(detail?.batch.id).toBe(second.batch.id);
    expect(detail?.stats.total).toBe(second.batch.total);
    expect((detail?.sample ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps imports idempotent for the same CSV in the same store", async () => {
    const csvText = [
      "date,amount,description",
      "2026-05-01,3000000,salary",
      "2026-05-02,-1200000,rent",
      "2026-05-03,-300000,food",
    ].join("\n");

    const first = await appendBatchFromCsv({
      csvText,
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "same.csv",
    });
    const second = await appendBatchFromCsv({
      csvText,
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "same.csv",
    });

    expect(second.batch.id).toBe(first.batch.id);
    expect(first.stats.stored).toBe(3);
    expect(second.stats.stored).toBe(0);
    expect(second.stats.deduped).toBe(3);

    const all = await readAllTransactions();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((row) => row.txnId)).size).toBe(3);
  });

  it("dedupes overlapping-period imports across different batches", async () => {
    const first = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-06-01,3000000,salary",
        "2026-06-02,-1000000,rent",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "first.csv",
    });

    const second = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-06-01,3000000, salary ",
        "2026-06-02,-1000000,Rent!!",
        "2026-06-03,-200000,coffee",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "second.csv",
    });

    expect(second.batch.id).not.toBe(first.batch.id);
    expect(second.stats.stored).toBe(1);
    expect(second.stats.deduped).toBe(2);

    const all = await readAllTransactions();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((row) => row.txnId)).size).toBe(3);
  });
});
