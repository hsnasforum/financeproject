import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPlanningV3TransactionStore } from "../../../src/lib/ops/doctorChecks/planningV3Transactions";
import { appendBatchFromCsv } from "../../../src/lib/planning/v3/service/transactionStore";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalPlanningDataDir = process.env.PLANNING_DATA_DIR;

function findCheck(checks: Awaited<ReturnType<typeof checkPlanningV3TransactionStore>>, id: string) {
  return checks.find((check) => check.id === id);
}

describe("planning v3 transaction store doctor checks", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-doctor-"));
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

  it("returns PASS for a healthy v3 transaction store fixture", async () => {
    await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-02-01,1000,salary",
        "2026-02-02,-300,lunch",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "fixture.csv",
    });

    const checks = await checkPlanningV3TransactionStore();
    const problematic = checks.filter((check) => check.status !== "PASS");

    expect(problematic).toEqual([]);
    expect(findCheck(checks, "planning-v3/batch-integrity")?.status).toBe("PASS");
  });

  it("raises issue when records NDJSON has corrupted line", async () => {
    await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-03-01,1500,income",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "broken.csv",
    });

    const recordsPath = path.join(root, "v3", "transactions", "records.ndjson");
    fs.appendFileSync(recordsPath, "{not-json}\n", "utf-8");

    const checks = await checkPlanningV3TransactionStore();
    const parseCheck = findCheck(checks, "planning-v3/records-ndjson");

    expect(parseCheck?.status).toBe("FAIL");
    expect(parseCheck?.details).toMatchObject({
      invalidLines: 1,
    });
  });

  it("raises WARN when records file size exceeds threshold", async () => {
    await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-04-01,2000,salary",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      fileName: "size.csv",
    });

    const recordsPath = path.join(root, "v3", "transactions", "records.ndjson");
    fs.appendFileSync(recordsPath, " ".repeat(2048), "utf-8");

    const checks = await checkPlanningV3TransactionStore({
      txFileWarnBytes: 128,
    });
    const sizeCheck = findCheck(checks, "planning-v3/records-size");

    expect(sizeCheck?.status).toBe("WARN");
    expect(sizeCheck?.details).toMatchObject({
      warnThresholdBytes: 128,
    });
  });
});
