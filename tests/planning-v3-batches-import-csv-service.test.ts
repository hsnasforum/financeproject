import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCsvToBatch } from "../src/lib/planning/v3/service/importCsvToBatch";
import { getBatchSummary } from "../src/lib/planning/v3/service/getBatchSummary";
import { getBatchTransactions } from "../src/lib/planning/v3/store/batchesStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

describe("planning v3 importCsvToBatch sanitize mode", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-batches-import-csv-service-"));
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

  it("drops description fields when sanitizeTextFields=true", async () => {
    const imported = await importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-03-01,1000,SECRET_PII_SHOULD_NOT_LEAK",
        "2026-03-02,-200,lunch",
      ].join("\n"),
      sanitizeTextFields: true,
    });

    const stored = await getBatchTransactions(imported.batchMeta.id);
    expect(stored.every((row) => row.description === undefined)).toBe(true);

    const filePath = path.join(root, "planning-v3", "batches", `${imported.batchMeta.id}.ndjson`);
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw.includes("SECRET_PII_SHOULD_NOT_LEAK")).toBe(false);
    expect(raw.includes("\"description\"")).toBe(false);
  });

  it("parses deterministic transactions for the same fixture", async () => {
    const csvText = [
      "date,amount,description",
      "2026-03-01,1000,alpha",
      "2026-03-01,1000, alpha ",
      "2026-03-02,-200,beta",
    ].join("\n");
    const first = await importCsvToBatch({ csvText, sanitizeTextFields: true });
    const second = await importCsvToBatch({ csvText, sanitizeTextFields: true });

    const normalize = (rows: typeof first.transactions) => rows.map((row) => ({
      txnId: row.txnId,
      date: row.date,
      amountKrw: row.amountKrw,
      batchId: row.batchId,
      hasDescription: row.description !== undefined,
    }));

    expect(normalize(first.transactions)).toEqual(normalize(second.transactions));
    expect(normalize(first.transactions)).toEqual([
      { txnId: first.transactions[0]?.txnId, date: "2026-03-01", amountKrw: 1000, batchId: first.batchMeta.id, hasDescription: false },
      { txnId: first.transactions[1]?.txnId, date: "2026-03-02", amountKrw: -200, batchId: first.batchMeta.id, hasDescription: false },
    ]);
  });

  it("builds deterministic summary from sanitized batch", async () => {
    const imported = await importCsvToBatch({
      csvText: [
        "date,amount,description",
        "2026-03-01,3000000,salary",
        "2026-03-02,-1200000,rent",
        "2026-03-03,-500000,transfer out",
        "2026-03-03,500000,transfer in",
      ].join("\n"),
      sanitizeTextFields: true,
    });

    const summaryA = await getBatchSummary(imported.batchMeta.id);
    const summaryB = await getBatchSummary(imported.batchMeta.id);
    expect(summaryA).toStrictEqual(summaryB);
    expect(summaryA.totals).toEqual({
      incomeKrw: 3000000,
      expenseKrw: 1200000,
      transferKrw: 1000000,
    });
  });
});

