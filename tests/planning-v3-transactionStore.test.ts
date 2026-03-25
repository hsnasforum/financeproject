import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveBatch } from "../src/lib/planning/v3/store/batchesStore";
import {
  buildSameIdCoexistenceVerifiedSuccessResponseShell,
  runSameIdCoexistencePostWriteSuccessSplitWorker,
  verifySameIdCoexistencePostWriteVisibleBinding,
} from "../src/lib/planning/v3/transactions/store";
import {
  appendBatchFromCsv,
  buildSameIdCoexistenceUserFacingInternalFailure,
  buildSameIdCoexistenceOperatorEvidenceSnapshot,
  buildSameIdCoexistenceOperatorRepairPayload,
  classifySameIdCoexistencePostWriteFailure,
  compareStoredPreWriteSnapshotToCurrentBinding,
  listBatches,
  readAllTransactions,
  readBatch,
  readStoredCurrentBatchBindingEvidence,
  runSameIdCoexistenceStoredThenLegacyRouteLocalSequence,
  runSameIdCoexistenceSecondaryFailureRouteLocalWorker,
  summarizeSameIdCoexistenceLegacySecondWriteError,
  toSameIdCoexistenceUserFacingInternalFailure,
  updateBatchAccount,
  verifyLegacyBatchAccountAppendPostWrite,
} from "../src/lib/planning/v3/service/transactionStore";

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

  it("verifies parsed committed legacy batch account append", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-07-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "verify.csv",
    });

    await updateBatchAccount(created.batch.id, "acc-next");

    const verified = await verifyLegacyBatchAccountAppendPostWrite({
      batchId: created.batch.id,
      accountId: "acc-next",
    });

    expect(verified.status).toBe("parsed-row-committed");
    expect(verified.latestParsedBatch?.id).toBe(created.batch.id);
    expect(verified.latestParsedBatch?.accountId).toBe("acc-next");
    expect(verified.latestParsedBatch?.accountHint).toBe("acc-next");
  });

  it("flags malformed tail even when a parsed latest row exists", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-08-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "malformed.csv",
    });

    await updateBatchAccount(created.batch.id, "acc-next");

    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    fs.appendFileSync(batchesPath, '{"id":"broken"');

    const verified = await verifyLegacyBatchAccountAppendPostWrite({
      batchId: created.batch.id,
      accountId: "acc-next",
    });

    expect(verified.status).toBe("malformed-tail");
    expect(verified.latestParsedBatch?.id).toBe(created.batch.id);
    expect(verified.latestParsedBatch?.accountId).toBe("acc-next");
    expect(verified.latestParsedBatch?.accountHint).toBe("acc-next");
  });

  it("returns no committed row observed when the expected batch binding is absent", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-09-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "missing.csv",
    });

    const verified = await verifyLegacyBatchAccountAppendPostWrite({
      batchId: created.batch.id,
      accountId: "acc-next",
    });

    expect(verified.status).toBe("no-committed-row-observed");
    expect(verified.latestParsedBatch?.id).toBe(created.batch.id);
    expect(verified.latestParsedBatch?.accountId).toBe("acc-main");
    expect(verified.latestParsedBatch?.accountHint).toBe("acc-main");
  });

  it("classifies parsed committed legacy verification as repair required", () => {
    const outcome = classifySameIdCoexistencePostWriteFailure({
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      legacyVerification: {
        status: "parsed-row-committed",
      },
    });

    expect(outcome).toEqual({
      outcome: "repair-required",
      reason: "legacy-parsed-row-committed",
      successAllowed: false,
    });
  });

  it("classifies malformed tail verification as repair required", () => {
    const outcome = classifySameIdCoexistencePostWriteFailure({
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      legacyVerification: {
        status: "malformed-tail",
      },
    });

    expect(outcome).toEqual({
      outcome: "repair-required",
      reason: "legacy-malformed-tail",
      successAllowed: false,
    });
  });

  it("keeps no committed row observed conservative when rollback succeeded", () => {
    const outcome = classifySameIdCoexistencePostWriteFailure({
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      legacyVerification: {
        status: "no-committed-row-observed",
      },
    });

    expect(outcome).toEqual({
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
    });
  });

  it("treats missing stored rollback attempt as repair required", () => {
    const outcome = classifySameIdCoexistencePostWriteFailure({
      storedRollbackAttempted: false,
      storedRollbackSucceeded: false,
      legacyVerification: {
        status: "no-committed-row-observed",
      },
    });

    expect(outcome).toEqual({
      outcome: "repair-required",
      reason: "stored-rollback-not-attempted",
      successAllowed: false,
    });
  });

  it("builds operator evidence snapshot for repair required parsed commit", () => {
    const snapshot = buildSameIdCoexistenceOperatorEvidenceSnapshot({
      batchId: "b_test_commit",
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedCurrentBindingAccountId: "acc-current",
      legacyVerification: {
        status: "parsed-row-committed",
        latestParsedBatch: {
          id: "b_test_commit",
          createdAt: "2026-10-01T00:00:00.000Z",
          kind: "csv",
          total: 1,
          ok: 1,
          failed: 0,
          accountId: "acc-next",
          accountHint: "acc-next",
        },
      },
    });

    expect(snapshot).toEqual({
      batchId: "b_test_commit",
      targetAccountId: "acc-next",
      outcome: "repair-required",
      reason: "legacy-parsed-row-committed",
      successAllowed: false,
      rollback: {
        attempted: true,
        succeeded: true,
      },
      legacyVerification: {
        status: "parsed-row-committed",
        noWriteProof: "not-proven",
        latestParsedBatch: {
          id: "b_test_commit",
          createdAt: "2026-10-01T00:00:00.000Z",
          accountId: "acc-next",
          accountHint: "acc-next",
        },
      },
      storedCurrentBinding: {
        accountId: "acc-current",
      },
    });
    expect(snapshot).not.toHaveProperty("rawTail");
  });

  it("builds operator evidence snapshot for malformed tail repair required", () => {
    const snapshot = buildSameIdCoexistenceOperatorEvidenceSnapshot({
      batchId: "b_test_tail",
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      legacyVerification: {
        status: "malformed-tail",
      },
    });

    expect(snapshot).toEqual({
      batchId: "b_test_tail",
      targetAccountId: "acc-next",
      outcome: "repair-required",
      reason: "legacy-malformed-tail",
      successAllowed: false,
      rollback: {
        attempted: true,
        succeeded: true,
      },
      legacyVerification: {
        status: "malformed-tail",
        noWriteProof: "not-proven",
      },
    });
  });

  it("builds operator evidence snapshot for rollback recovery unproven", () => {
    const snapshot = buildSameIdCoexistenceOperatorEvidenceSnapshot({
      batchId: "b_test_unknown",
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedCurrentBindingAccountId: null,
      legacyVerification: {
        status: "no-committed-row-observed",
        latestParsedBatch: {
          id: "b_test_unknown",
          createdAt: "2026-11-01T00:00:00.000Z",
          kind: "csv",
          total: 1,
          ok: 1,
          failed: 0,
          accountId: "acc-prev",
          accountHint: "acc-prev",
        },
      },
    });

    expect(snapshot).toEqual({
      batchId: "b_test_unknown",
      targetAccountId: "acc-next",
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
      rollback: {
        attempted: true,
        succeeded: true,
      },
      legacyVerification: {
        status: "no-committed-row-observed",
        noWriteProof: "not-proven",
        latestParsedBatch: {
          id: "b_test_unknown",
          createdAt: "2026-11-01T00:00:00.000Z",
          accountId: "acc-prev",
          accountHint: "acc-prev",
        },
      },
      storedCurrentBinding: {
        accountId: null,
      },
    });
  });

  it("runs route-local worker with parsed committed legacy verification", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-12-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-commit.csv",
    });

    await updateBatchAccount(created.batch.id, "acc-next");

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedCurrentBindingAccountId: "acc-main",
    });

    expect(result.legacyVerification.status).toBe("parsed-row-committed");
    expect(result.failure).toEqual({
      outcome: "repair-required",
      reason: "legacy-parsed-row-committed",
      successAllowed: false,
    });
    expect(result.operatorEvidence.outcome).toBe("repair-required");
    expect(result.operatorEvidence.reason).toBe("legacy-parsed-row-committed");
    expect(result.operatorEvidence.legacyVerification.status).toBe("parsed-row-committed");
  });

  it("runs route-local worker with malformed tail verification", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-01-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-tail.csv",
    });

    await updateBatchAccount(created.batch.id, "acc-next");
    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    fs.appendFileSync(batchesPath, '{"id":"broken"');

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
    });

    expect(result.legacyVerification.status).toBe("malformed-tail");
    expect(result.failure).toEqual({
      outcome: "repair-required",
      reason: "legacy-malformed-tail",
      successAllowed: false,
    });
    expect(result.operatorEvidence.outcome).toBe("repair-required");
    expect(result.operatorEvidence.legacyVerification.status).toBe("malformed-tail");
  });

  it("runs route-local worker with rollback recovery unproven verification", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-02-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-unproven.csv",
    });

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
    });

    expect(result.legacyVerification.status).toBe("no-committed-row-observed");
    expect(result.failure).toEqual({
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
    });
    expect(result.operatorEvidence.outcome).toBe("rollback-recovery-unproven");
    expect(result.operatorEvidence.legacyVerification.status).toBe("no-committed-row-observed");
    expect(result.operatorEvidence).not.toHaveProperty("storedCurrentBinding");
  });

  it("runs route-local worker with rollback not attempted", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-03-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-no-rollback.csv",
    });

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: false,
      storedRollbackSucceeded: false,
    });

    expect(result.legacyVerification.status).toBe("no-committed-row-observed");
    expect(result.failure).toEqual({
      outcome: "repair-required",
      reason: "stored-rollback-not-attempted",
      successAllowed: false,
    });
    expect(result.operatorEvidence.outcome).toBe("repair-required");
    expect(result.operatorEvidence.reason).toBe("stored-rollback-not-attempted");
  });

  it("runs route-local worker with rollback failed", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-04-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-rollback-failed.csv",
    });

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: false,
    });

    expect(result.legacyVerification.status).toBe("no-committed-row-observed");
    expect(result.failure).toEqual({
      outcome: "repair-required",
      reason: "stored-rollback-failed",
      successAllowed: false,
    });
    expect(result.operatorEvidence.outcome).toBe("repair-required");
    expect(result.operatorEvidence.reason).toBe("stored-rollback-failed");
  });

  it("reads stored current binding evidence from stored meta", async () => {
    await saveBatch(
      {
        id: "b_stored_meta",
        createdAt: "2027-05-01T00:00:00.000Z",
        source: "csv",
        rowCount: 0,
        accounts: [{ id: "acc-stored" }],
      },
      [],
    );

    const evidence = await readStoredCurrentBatchBindingEvidence("b_stored_meta");

    expect(evidence).toEqual({
      accountId: "acc-stored",
    });
  });

  it("auto-includes stored current binding evidence in route-local worker", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-06-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-auto-stored.csv",
    });

    await saveBatch(
      {
        id: created.batch.id,
        createdAt: "2027-06-01T00:00:00.000Z",
        source: "csv",
        rowCount: 0,
        accounts: [{ id: "acc-stored" }],
      },
      [],
    );

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
    });

    expect(result.failure).toEqual({
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
    });
    expect(result.operatorEvidence.storedCurrentBinding).toEqual({
      accountId: "acc-stored",
    });
  });

  it("compares stored pre-write snapshot when current binding matches", () => {
    const compared = compareStoredPreWriteSnapshotToCurrentBinding({
      preWriteAccountId: "acc-stored",
      currentBinding: { accountId: "acc-stored" },
    });

    expect(compared).toEqual({
      status: "matched-prewrite",
      preWriteAccountId: "acc-stored",
      currentAccountId: "acc-stored",
    });
  });

  it("compares stored pre-write snapshot when current binding drifted", () => {
    const compared = compareStoredPreWriteSnapshotToCurrentBinding({
      preWriteAccountId: "acc-before",
      currentBinding: { accountId: "acc-after" },
    });

    expect(compared).toEqual({
      status: "drifted-from-prewrite",
      preWriteAccountId: "acc-before",
      currentAccountId: "acc-after",
    });
  });

  it("returns snapshot missing when pre-write snapshot is absent", () => {
    const compared = compareStoredPreWriteSnapshotToCurrentBinding({
      currentBinding: { accountId: "acc-current" },
    });

    expect(compared).toEqual({
      status: "snapshot-missing",
      preWriteAccountId: null,
      currentAccountId: "acc-current",
    });
  });

  it("returns drifted from prewrite when current binding is missing", () => {
    const compared = compareStoredPreWriteSnapshotToCurrentBinding({
      preWriteAccountId: "acc-before",
      currentBinding: null,
    });

    expect(compared).toEqual({
      status: "drifted-from-prewrite",
      preWriteAccountId: "acc-before",
      currentAccountId: null,
    });
  });

  it("adds optional stored pre-write compare to route-local worker", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-07-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "worker-prewrite-compare.csv",
    });

    await saveBatch(
      {
        id: created.batch.id,
        createdAt: "2027-07-01T00:00:00.000Z",
        source: "csv",
        rowCount: 0,
        accounts: [{ id: "acc-stored" }],
      },
      [],
    );

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedPreWriteAccountId: "acc-main",
    });

    expect(result.failure).toEqual({
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
    });
    expect(result.storedPreWriteCompare).toEqual({
      status: "drifted-from-prewrite",
      preWriteAccountId: "acc-main",
      currentAccountId: "acc-stored",
    });
  });

  it("builds operator repair payload for repair required worker result", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-08-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "payload-repair.csv",
    });

    await updateBatchAccount(created.batch.id, "acc-next");

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedCurrentBindingAccountId: "acc-main",
      storedPreWriteAccountId: "acc-main",
    });
    const payload = buildSameIdCoexistenceOperatorRepairPayload(result);

    expect(payload).toEqual({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      outcome: "repair-required",
      reason: "legacy-parsed-row-committed",
      successAllowed: false,
      rollback: {
        attempted: true,
        succeeded: true,
      },
      legacyVerification: {
        status: "parsed-row-committed",
        noWriteProof: "not-proven",
        latestParsedBatch: {
          id: created.batch.id,
          createdAt: result.operatorEvidence.legacyVerification.latestParsedBatch?.createdAt ?? "",
          accountId: "acc-next",
          accountHint: "acc-next",
        },
      },
      storedCurrentBinding: {
        accountId: "acc-main",
      },
      storedPreWriteCompare: {
        status: "matched-prewrite",
        preWriteAccountId: "acc-main",
        currentAccountId: "acc-main",
      },
    });
    expect(payload).not.toHaveProperty("rawTail");
    expect(payload).not.toHaveProperty("filePath");
  });

  it("builds operator repair payload for rollback recovery unproven worker result", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2027-09-01,1000,a",
      ].join("\n"),
      mapping: { dateKey: "date", amountKey: "amount", descKey: "description" },
      accountId: "acc-main",
      fileName: "payload-unproven.csv",
    });

    await saveBatch(
      {
        id: created.batch.id,
        createdAt: "2027-09-01T00:00:00.000Z",
        source: "csv",
        rowCount: 0,
        accounts: [{ id: "acc-stored" }],
      },
      [],
    );

    const result = await runSameIdCoexistenceSecondaryFailureRouteLocalWorker({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      storedRollbackAttempted: true,
      storedRollbackSucceeded: true,
      storedPreWriteAccountId: "acc-before",
    });
    const payload = buildSameIdCoexistenceOperatorRepairPayload(result);

    expect(payload).toEqual({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      outcome: "rollback-recovery-unproven",
      reason: "legacy-no-committed-row-observed",
      successAllowed: false,
      rollback: {
        attempted: true,
        succeeded: true,
      },
      legacyVerification: {
        status: "no-committed-row-observed",
        noWriteProof: "not-proven",
        latestParsedBatch: {
          id: created.batch.id,
          createdAt: created.batch.createdAt,
          accountId: "acc-main",
          accountHint: "acc-main",
        },
      },
      storedCurrentBinding: {
        accountId: "acc-stored",
      },
      storedPreWriteCompare: {
        status: "drifted-from-prewrite",
        preWriteAccountId: "acc-before",
        currentAccountId: "acc-stored",
      },
    });
    expect(payload).not.toHaveProperty("rawTail");
    expect(payload).not.toHaveProperty("filePath");
  });

  it("records successful stored then legacy write trace for same-id coexistence sequencing", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
        "2026-01-02,-200,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "coexistence.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: created.batch.createdAt,
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-stored-before" }, { id: "acc-fallback" }],
    }, []);

    const result = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
    });

    expect(result).toMatchObject({
      status: "writes-completed",
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      trace: {
        storedPreWriteAccountId: "acc-stored-before",
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
        },
        legacyWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
          updatedTransactionCount: 2,
        },
        storedRollback: {
          attempted: false,
          succeeded: false,
          accountIdAfterRollback: null,
        },
      },
    });

    const storedCurrent = await readStoredCurrentBatchBindingEvidence(created.batch.id);
    expect(storedCurrent).toEqual({ accountId: "acc-next" });

    const verification = await verifySameIdCoexistencePostWriteVisibleBinding({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
    });
    expect(verification).toEqual({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      currentVisibleAccountId: "acc-next",
      status: "visible-binding-matched",
    });

    const legacyCurrent = await readBatch(created.batch.id);
    expect(legacyCurrent?.batch.accountId).toBe("acc-next");
  });

  it("summarizes legacy second write errors conservatively", () => {
    const summary = summarizeSameIdCoexistenceLegacySecondWriteError(
      new Error(`/tmp/secret/batches.ndjson append failed\nstack`),
    );

    expect(summary).toEqual({
      stage: "legacy-second-write",
      code: "legacy-second-write-failed",
      message: "기존 배치 append 저장에 실패했습니다.",
    });
    expect(summary).not.toHaveProperty("stack");
    expect(JSON.stringify(summary)).not.toContain("/tmp/secret");
    expect(JSON.stringify(summary)).not.toContain("batches.ndjson");
  });

  it("maps repair-required secondary failure to a route-safe INTERNAL envelope", () => {
    const failure = toSameIdCoexistenceUserFacingInternalFailure({
      status: "secondary-failure",
      batchId: "batch-1",
      targetAccountId: "acc-next",
      trace: {
        storedPreWriteAccountId: "acc-before",
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
        },
        legacyWrite: {
          attempted: true,
          succeeded: false,
          accountIdAfterWrite: null,
          updatedTransactionCount: 0,
        },
        storedRollback: {
          attempted: true,
          succeeded: false,
          accountIdAfterRollback: null,
        },
      },
      legacySecondWriteError: {
        stage: "legacy-second-write",
        code: "legacy-second-write-failed",
        message: "batches.ndjson /tmp/secret stack",
      },
      secondaryFailureWorkerInput: {
        batchId: "batch-1",
        targetAccountId: "acc-next",
        storedRollbackAttempted: true,
        storedRollbackSucceeded: false,
        storedPreWriteAccountId: "acc-before",
      },
      secondaryFailure: {
        legacyVerification: {
          status: "parsed-row-committed",
          latestParsedBatch: {
            id: "batch-1",
            createdAt: "2026-03-22T00:00:00.000Z",
            kind: "csv",
            total: 1,
            ok: 1,
            failed: 0,
            accountId: "acc-next",
            accountHint: "acc-next",
          },
        },
        failure: {
          outcome: "repair-required",
          reason: "legacy-parsed-row-committed",
          successAllowed: false,
        },
        operatorEvidence: {
          batchId: "batch-1",
          targetAccountId: "acc-next",
          outcome: "repair-required",
          reason: "legacy-parsed-row-committed",
          successAllowed: false,
          rollback: {
            attempted: true,
            succeeded: false,
          },
          legacyVerification: {
            status: "parsed-row-committed",
            noWriteProof: "not-proven",
          },
          storedCurrentBinding: {
            accountId: "acc-next",
          },
        },
      },
      operatorRepairPayload: {
        batchId: "batch-1",
        targetAccountId: "acc-next",
        outcome: "repair-required",
        reason: "legacy-parsed-row-committed",
        successAllowed: false,
        rollback: {
          attempted: true,
          succeeded: false,
        },
        legacyVerification: {
          status: "parsed-row-committed",
          noWriteProof: "not-proven",
        },
        storedCurrentBinding: {
          accountId: "acc-next",
        },
      },
    });

    expect(failure).toEqual({
      code: "INTERNAL",
      message: "배치 계좌 연결에 실패했습니다.",
      successAllowed: false,
    });
    expect(JSON.stringify(failure)).not.toContain("repair-required");
    expect(JSON.stringify(failure)).not.toContain("/tmp/secret");
    expect(JSON.stringify(failure)).not.toContain("batches.ndjson");
  });

  it("records rollback trace and secondary failure payload when legacy second write fails", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
        "2026-01-02,-200,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "coexistence.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: created.batch.createdAt,
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-stored-before" }],
    }, []);

    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    const originalAppendFile = fsPromises.appendFile.bind(fsPromises);
    const appendSpy = vi.spyOn(fsPromises, "appendFile").mockImplementation(async (filePath, data, options) => {
      if (String(filePath) === batchesPath) {
        throw new Error("legacy append failed");
      }
      return originalAppendFile(filePath, data, options);
    });

    try {
      const result = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
        batchId: created.batch.id,
        targetAccountId: "acc-next",
      });

      expect(result.status).toBe("secondary-failure");
      if (result.status !== "secondary-failure") {
        throw new Error("expected secondary failure sequencing result");
      }

      expect(result.trace).toEqual({
        storedPreWriteAccountId: "acc-stored-before",
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
        },
        legacyWrite: {
          attempted: true,
          succeeded: false,
          accountIdAfterWrite: null,
          updatedTransactionCount: 0,
        },
        storedRollback: {
          attempted: true,
          succeeded: true,
          accountIdAfterRollback: "acc-stored-before",
        },
      });
      expect(result.legacySecondWriteError).toEqual({
        stage: "legacy-second-write",
        code: "legacy-second-write-failed",
        message: "기존 배치 append 저장에 실패했습니다.",
      });
      expect(result.secondaryFailureWorkerInput).toEqual({
        batchId: created.batch.id,
        targetAccountId: "acc-next",
        storedRollbackAttempted: true,
        storedRollbackSucceeded: true,
        storedPreWriteAccountId: "acc-stored-before",
      });
      expect(result.secondaryFailure.failure).toEqual({
        outcome: "rollback-recovery-unproven",
        reason: "legacy-no-committed-row-observed",
        successAllowed: false,
      });
      expect(result.operatorRepairPayload).toEqual({
        batchId: created.batch.id,
        targetAccountId: "acc-next",
        outcome: "rollback-recovery-unproven",
        reason: "legacy-no-committed-row-observed",
        successAllowed: false,
        rollback: {
          attempted: true,
          succeeded: true,
        },
        legacyVerification: {
          status: "no-committed-row-observed",
          noWriteProof: "not-proven",
          latestParsedBatch: {
            id: created.batch.id,
            createdAt: created.batch.createdAt,
            accountId: "acc-main",
            accountHint: "acc-main",
          },
        },
        storedCurrentBinding: {
          accountId: "acc-stored-before",
        },
        storedPreWriteCompare: {
          status: "matched-prewrite",
          preWriteAccountId: "acc-stored-before",
          currentAccountId: "acc-stored-before",
        },
      });
      expect(JSON.stringify(result.legacySecondWriteError)).not.toContain("batches.ndjson");
      expect(JSON.stringify(result.legacySecondWriteError)).not.toContain("stack");
    } finally {
      appendSpy.mockRestore();
    }

    const storedCurrent = await readStoredCurrentBatchBindingEvidence(created.batch.id);
    expect(storedCurrent).toEqual({ accountId: "acc-stored-before" });

    const legacyCurrent = await readBatch(created.batch.id);
    expect(legacyCurrent?.batch.accountId).toBe("acc-main");
  });

  it("maps rollback-recovery-unproven sequencing result to a route-safe INTERNAL envelope", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "coexistence.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: created.batch.createdAt,
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-stored-before" }],
    }, []);

    const batchesPath = path.join(root, "v3", "transactions", "batches.ndjson");
    const originalAppendFile = fsPromises.appendFile.bind(fsPromises);
    const appendSpy = vi.spyOn(fsPromises, "appendFile").mockImplementation(async (filePath, data, options) => {
      if (String(filePath) === batchesPath) {
        throw new Error("legacy append failed");
      }
      return originalAppendFile(filePath, data, options);
    });

    try {
      const result = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
        batchId: created.batch.id,
        targetAccountId: "acc-next",
      });

      expect(result.status).toBe("secondary-failure");
      if (result.status !== "secondary-failure") {
        throw new Error("expected secondary failure sequencing result");
      }

      const failure = toSameIdCoexistenceUserFacingInternalFailure(result);
      expect(failure).toEqual({
        code: "INTERNAL",
        message: "배치 계좌 연결에 실패했습니다.",
        successAllowed: false,
      });
      expect(JSON.stringify(failure)).not.toContain("rollback-recovery-unproven");
      expect(JSON.stringify(failure)).not.toContain("legacy-second-write");
      expect(JSON.stringify(failure)).not.toContain("not-proven");
    } finally {
      appendSpy.mockRestore();
    }
  });

  it("detects drifted post-write visible binding when stored-first account stays on another value", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "coexistence-drifted.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: created.batch.createdAt,
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-stored-before" }],
    }, []);

    const verification = await verifySameIdCoexistencePostWriteVisibleBinding({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
    });

    expect(verification).toEqual({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
      currentVisibleAccountId: "acc-stored-before",
      status: "visible-binding-drifted",
    });
  });

  it("detects missing post-write visible binding when stored-first reader has no account binding", async () => {
    const batchId = "stored-only-missing-binding";
    await saveBatch({
      id: batchId,
      createdAt: "2026-03-22T00:00:00.000Z",
      source: "csv",
      rowCount: 0,
    }, []);

    const verification = await verifySameIdCoexistencePostWriteVisibleBinding({
      batchId,
      targetAccountId: "acc-next",
    });

    expect(verification).toEqual({
      batchId,
      targetAccountId: "acc-next",
      currentVisibleAccountId: null,
      status: "visible-binding-missing",
    });
  });

  it("splits writes-completed into verified success candidate when visible binding matches", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
        "2026-01-02,-200,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-main",
      fileName: "coexistence-success-split.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: created.batch.createdAt,
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-stored-before" }],
    }, []);

    const sequencing = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
    });

    expect(sequencing.status).toBe("writes-completed");
    if (sequencing.status !== "writes-completed") {
      throw new Error("expected writes-completed sequencing result");
    }

    const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
    expect(split).toEqual({
      status: "verified-success-candidate",
      sequence: sequencing,
      verification: {
        batchId: created.batch.id,
        targetAccountId: "acc-next",
        currentVisibleAccountId: "acc-next",
        status: "visible-binding-matched",
      },
    });
  });

  it("builds verified-success response shell from reloaded stored-first batch shell and legacy updated count", async () => {
    const created = await appendBatchFromCsv({
      csvText: [
        "date,amount,description",
        "2026-01-01,1000,salary",
        "2026-01-02,-200,coffee",
      ].join("\n"),
      mapping: {
        dateKey: "date",
        amountKey: "amount",
        descKey: "description",
      },
      accountId: "acc-legacy",
      fileName: "coexistence-response-shell.csv",
    });

    await saveBatch({
      id: created.batch.id,
      createdAt: "2026-03-22T00:00:00.000Z",
      source: "csv",
      rowCount: 3,
      accounts: [{ id: "acc-stored-before" }],
    }, []);

    const sequencing = await runSameIdCoexistenceStoredThenLegacyRouteLocalSequence({
      batchId: created.batch.id,
      targetAccountId: "acc-next",
    });
    expect(sequencing.status).toBe("writes-completed");
    if (sequencing.status !== "writes-completed") {
      throw new Error("expected writes-completed sequencing result");
    }

    const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
    expect(split.status).toBe("verified-success-candidate");
    if (split.status !== "verified-success-candidate") {
      throw new Error("expected verified-success-candidate split result");
    }

    const responseShell = await buildSameIdCoexistenceVerifiedSuccessResponseShell(split);
    expect(responseShell).toEqual({
      batch: {
        id: created.batch.id,
        createdAt: "2026-03-22T00:00:00.000Z",
        kind: "csv",
        total: 2,
        ok: 2,
        failed: 0,
        fileName: "coexistence-response-shell.csv",
        accountId: "acc-next",
        accountHint: "acc-next",
      },
      updatedTransactionCount: 2,
    });
  });

  it("keeps verified success candidate when visible binding matches even if legacy updated count is zero", async () => {
    const sequencing = {
      status: "writes-completed" as const,
      batchId: "batch-zero-count-success",
      targetAccountId: "acc-main",
      trace: {
        storedPreWriteAccountId: "acc-stored-before",
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-main",
        },
        legacyWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-main",
          updatedTransactionCount: 0,
        },
        storedRollback: {
          attempted: false,
          succeeded: false,
          accountIdAfterRollback: null,
        },
      },
    };

    await saveBatch({
      id: sequencing.batchId,
      createdAt: "2026-03-22T00:00:00.000Z",
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-main" }],
    }, []);

    const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
    expect(split).toEqual({
      status: "verified-success-candidate",
      sequence: sequencing,
      verification: {
        batchId: sequencing.batchId,
        targetAccountId: "acc-main",
        currentVisibleAccountId: "acc-main",
        status: "visible-binding-matched",
      },
    });

    if (split.status !== "verified-success-candidate") {
      throw new Error("expected verified-success-candidate split result");
    }

    const responseShell = await buildSameIdCoexistenceVerifiedSuccessResponseShell(split);
    expect(responseShell.updatedTransactionCount).toBe(0);
    expect(responseShell.batch.accountId).toBe("acc-main");
    expect(responseShell.batch.accountHint).toBe("acc-main");
  });

  it("keeps writes-completed on conservative failure when visible binding verification drifts", async () => {
    const sequencing = {
      status: "writes-completed" as const,
      batchId: "batch-drifted",
      targetAccountId: "acc-next",
      trace: {
        storedPreWriteAccountId: "acc-before",
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
        },
        legacyWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
          updatedTransactionCount: 1,
        },
        storedRollback: {
          attempted: false,
          succeeded: false,
          accountIdAfterRollback: null,
        },
      },
    };

    await saveBatch({
      id: sequencing.batchId,
      createdAt: "2026-03-22T00:00:00.000Z",
      source: "csv",
      rowCount: 0,
      accounts: [{ id: "acc-other" }],
    }, []);

    const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
    expect(split).toEqual({
      status: "visible-verification-failed",
      sequence: sequencing,
      verification: {
        batchId: sequencing.batchId,
        targetAccountId: "acc-next",
        currentVisibleAccountId: "acc-other",
        status: "visible-binding-drifted",
      },
      userFacingFailure: buildSameIdCoexistenceUserFacingInternalFailure(),
    });
  });

  it("keeps writes-completed on conservative failure when visible binding is missing", async () => {
    const sequencing = {
      status: "writes-completed" as const,
      batchId: "batch-missing",
      targetAccountId: "acc-next",
      trace: {
        storedPreWriteAccountId: null,
        storedWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
        },
        legacyWrite: {
          attempted: true,
          succeeded: true,
          accountIdAfterWrite: "acc-next",
          updatedTransactionCount: 0,
        },
        storedRollback: {
          attempted: false,
          succeeded: false,
          accountIdAfterRollback: null,
        },
      },
    };

    await saveBatch({
      id: sequencing.batchId,
      createdAt: "2026-03-22T00:00:00.000Z",
      source: "csv",
      rowCount: 0,
    }, []);

    const split = await runSameIdCoexistencePostWriteSuccessSplitWorker(sequencing);
    expect(split).toEqual({
      status: "visible-verification-failed",
      sequence: sequencing,
      verification: {
        batchId: sequencing.batchId,
        targetAccountId: "acc-next",
        currentVisibleAccountId: null,
        status: "visible-binding-missing",
      },
      userFacingFailure: buildSameIdCoexistenceUserFacingInternalFailure(),
    });
  });
});
