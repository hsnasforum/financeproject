import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildLegacyTransactionMigrationDryRunReport,
} from "../src/lib/planning/v3/service/legacyTransactionMigration";
import { appendBatchFromCsv } from "../src/lib/planning/v3/service/transactionStore";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";

const ENV_KEYS = [
  "NODE_ENV",
  "PLANNING_DATA_DIR",
  "PLANNING_NAMESPACE_ENABLED",
  "PLANNING_SINGLE_USER_MODE",
] as const;

const env = process.env as Record<string, string | undefined>;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (typeof originalEnv[key] === "string") env[key] = originalEnv[key];
    else delete env[key];
  }
}

function readOptional(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function legacyBatchesPath(root: string): string {
  return path.join(root, "v3", "transactions", "batches.ndjson");
}

function legacyRecordsPath(root: string): string {
  return path.join(root, "v3", "transactions", "records.ndjson");
}

function canonicalIndexPath(root: string): string {
  return path.join(root, "planning-v3", "batches", "index.json");
}

async function createLegacyBatchFixture(accountId: string) {
  return appendBatchFromCsv({
    csvText: [
      "date,amount,description",
      "2026-01-01,1000,legacy row",
    ].join("\n"),
    accountId,
    fileName: `${accountId}.csv`,
  });
}

describe("planning v3 legacy transaction migration dry-run report", () => {
  let root = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "finance-planning-v3-legacy-migration-"));
    restoreEnv();
    env.NODE_ENV = "test";
    env.PLANNING_DATA_DIR = root;
    env.PLANNING_NAMESPACE_ENABLED = "0";
    env.PLANNING_SINGLE_USER_MODE = "0";
  });

  afterEach(() => {
    restoreEnv();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports ownerless legacy batches as quarantine and same-id canonical batches as conflicts without writes", async () => {
    const ownerless = await createLegacyBatchFixture("ownerless-account");
    const conflict = await createLegacyBatchFixture("conflict-account");
    await saveBatch(
      {
        id: conflict.batch.id,
        createdAt: "2026-01-02T00:00:00.000Z",
        source: "csv",
        rowCount: 1,
        accounts: [{ id: "stored-account" }],
      },
      [{
        txnId: "bbbbbbbbbbbb",
        batchId: conflict.batch.id,
        accountId: "stored-account",
        date: "2026-01-02",
        amountKrw: 2000,
        description: "stored row",
        source: "csv",
      }],
    );
    const beforeLegacyBatchesRaw = readOptional(legacyBatchesPath(root));
    const beforeLegacyRecordsRaw = readOptional(legacyRecordsPath(root));
    const beforeCanonicalIndexRaw = readOptional(canonicalIndexPath(root));

    const report = await buildLegacyTransactionMigrationDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    const rerun = await buildLegacyTransactionMigrationDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(rerun).toEqual(report);
    expect(readOptional(legacyBatchesPath(root))).toBe(beforeLegacyBatchesRaw);
    expect(readOptional(legacyRecordsPath(root))).toBe(beforeLegacyRecordsRaw);
    expect(readOptional(canonicalIndexPath(root))).toBe(beforeCanonicalIndexRaw);

    expect(report).toMatchObject({
      schemaVersion: 1,
      mode: "dry-run",
      generatedAt: "2026-06-28T00:00:00.000Z",
      summary: {
        legacyBatches: 2,
        ready: 0,
        conflicts: 1,
        partial: 0,
        quarantine: 1,
      },
    });

    const conflictItem = report.items.find((item) => item.batchId === conflict.batch.id);
    expect(conflictItem).toMatchObject({
      batchId: conflict.batch.id,
      status: "conflict",
      ownerEvidence: "missing",
      conflictReason: "SAME_ID_CANONICAL_BATCH",
      canonical: {
        exists: true,
        rowCount: 1,
      },
      migrationMarker: {
        schemaVersion: 1,
        batchId: conflict.batch.id,
        rowCount: 1,
      },
    });
    expect(conflictItem?.migrationMarker.checksum).toMatch(/^[a-f0-9]{64}$/);

    const quarantineItem = report.items.find((item) => item.batchId === ownerless.batch.id);
    expect(quarantineItem).toMatchObject({
      batchId: ownerless.batch.id,
      status: "quarantine",
      ownerEvidence: "missing",
      quarantineReason: "OWNER_UNKNOWN",
      accountBinding: {
        batchAccountId: "ownerless-account",
        transactionAccountIds: ["ownerless-account"],
        verified: true,
      },
      migrationMarker: {
        schemaVersion: 1,
        batchId: ownerless.batch.id,
        rowCount: 1,
      },
    });
    expect(quarantineItem?.migrationMarker.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reports malformed legacy transaction rows as partial without writes", async () => {
    const txDir = path.join(root, "v3", "transactions");
    fs.mkdirSync(txDir, { recursive: true });
    fs.writeFileSync(path.join(txDir, "batches.ndjson"), `${JSON.stringify({
      id: "batch-partial",
      createdAt: "2026-01-03T00:00:00.000Z",
      kind: "csv",
      accountId: "legacy-account",
      accountHint: "legacy-account",
      total: 1,
      ok: 1,
      failed: 0,
    })}\n`);
    fs.writeFileSync(path.join(txDir, "records.ndjson"), "{\"id\":\"broken\"");
    const beforeLegacyBatchesRaw = readOptional(legacyBatchesPath(root));
    const beforeLegacyRecordsRaw = readOptional(legacyRecordsPath(root));

    const report = await buildLegacyTransactionMigrationDryRunReport({
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(readOptional(legacyBatchesPath(root))).toBe(beforeLegacyBatchesRaw);
    expect(readOptional(legacyRecordsPath(root))).toBe(beforeLegacyRecordsRaw);
    expect(report).toMatchObject({
      summary: {
        legacyBatches: 1,
        ready: 0,
        conflicts: 0,
        partial: 1,
        quarantine: 0,
      },
    });
    const item = report.items[0];
    expect(item).toMatchObject({
      batchId: "batch-partial",
      status: "partial",
      partialReason: "LEGACY_ROW_READ_FAILED",
      ownerEvidence: "missing",
      legacy: {
        rowCount: 0,
        declaredOk: 1,
      },
      accountBinding: {
        batchAccountId: "legacy-account",
        transactionAccountIds: [],
        verified: true,
      },
      migrationMarker: {
        schemaVersion: 1,
        batchId: "batch-partial",
        rowCount: 0,
      },
    });
    expect(item?.migrationMarker.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
