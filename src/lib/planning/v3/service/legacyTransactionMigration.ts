import { createHash } from "node:crypto";
import { type AccountTransaction } from "../domain/types";
import { type V3ImportBatch } from "../domain/transactions";
import { getBatchMeta, getBatchTransactions } from "../store/batchesStore";
import {
  listBatches as listLegacyBatches,
  readBatchTransactions,
} from "./transactionStore";

export type LegacyTransactionMigrationItemStatus =
  | "ready"
  | "conflict"
  | "partial"
  | "quarantine";

export type LegacyTransactionMigrationOwnerEvidence = "missing";

export type LegacyTransactionMigrationMarker = {
  schemaVersion: 1;
  batchId: string;
  checksum: string;
  rowCount: number;
};

export type LegacyTransactionMigrationAccountBinding = {
  batchAccountId: string | null;
  transactionAccountIds: string[];
  verified: boolean;
};

export type LegacyTransactionMigrationItem = {
  batchId: string;
  status: LegacyTransactionMigrationItemStatus;
  ownerEvidence: LegacyTransactionMigrationOwnerEvidence;
  legacy: {
    createdAt: string;
    rowCount: number;
    declaredOk: number;
    declaredTotal: number;
    declaredFailed: number;
    checksum: string;
  };
  canonical: {
    exists: boolean;
    rowCount: number;
    accountIds: string[];
  };
  accountBinding: LegacyTransactionMigrationAccountBinding;
  migrationMarker: LegacyTransactionMigrationMarker;
  conflictReason?: "SAME_ID_CANONICAL_BATCH";
  partialReason?: "LEGACY_ROW_COUNT_MISMATCH" | "LEGACY_ROW_READ_FAILED";
  quarantineReason?: "OWNER_UNKNOWN";
};

export type LegacyTransactionMigrationDryRunReport = {
  schemaVersion: 1;
  mode: "dry-run";
  generatedAt: string;
  summary: {
    legacyBatches: number;
    ready: number;
    conflicts: number;
    partial: number;
    quarantine: number;
    canonicalCollisions: number;
    ownerless: number;
  };
  items: LegacyTransactionMigrationItem[];
};

type LegacyTransactionMigrationDryRunOptions = {
  generatedAt?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGeneratedAt(value: string | undefined): string {
  const raw = asString(value);
  const timestamp = Date.parse(raw);
  if (raw && Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  return new Date().toISOString();
}

function stableTransactionPayload(row: AccountTransaction): Record<string, unknown> {
  return {
    txnId: asString(row.txnId),
    accountId: asString(row.accountId),
    date: row.date,
    amountKrw: row.amountKrw,
    description: asString(row.description),
    source: row.source,
    category: asString(row.category),
    categoryId: asString(row.categoryId),
    kind: asString(row.kind),
    matchedRuleId: asString(row.matchedRuleId),
    classificationReason: asString(row.classificationReason),
    rowIndex: row.meta?.rowIndex ?? null,
  };
}

function compareTransactions(left: AccountTransaction, right: AccountTransaction): number {
  const leftTxnId = asString(left.txnId);
  const rightTxnId = asString(right.txnId);
  if (leftTxnId !== rightTxnId) return leftTxnId.localeCompare(rightTxnId);
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  if (left.amountKrw !== right.amountKrw) return left.amountKrw - right.amountKrw;
  return asString(left.description).localeCompare(asString(right.description));
}

function checksumTransactions(rows: AccountTransaction[]): string {
  const stableRows = [...rows]
    .sort(compareTransactions)
    .map((row) => stableTransactionPayload(row));
  return createHash("sha256")
    .update(JSON.stringify(stableRows))
    .digest("hex");
}

function uniqueSortedAccountIds(rows: AccountTransaction[]): string[] {
  return [...new Set(rows.map((row) => asString(row.accountId)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function buildAccountBinding(batch: V3ImportBatch, rows: AccountTransaction[]): LegacyTransactionMigrationAccountBinding {
  const batchAccountId = asString(batch.accountId) || null;
  const transactionAccountIds = uniqueSortedAccountIds(rows);
  const verified = Boolean(batchAccountId)
    && transactionAccountIds.every((accountId) => accountId === batchAccountId);
  return {
    batchAccountId,
    transactionAccountIds,
    verified,
  };
}

async function listAllLegacyBatches(): Promise<V3ImportBatch[]> {
  const all: V3ImportBatch[] = [];
  let cursor: string | undefined;

  do {
    const page = await listLegacyBatches({
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);

  return all.sort((left, right) => left.id.localeCompare(right.id));
}

async function buildDryRunItem(batch: V3ImportBatch): Promise<LegacyTransactionMigrationItem> {
  const legacyReadResult = await readBatchTransactions(batch.id)
    .then((value) => ({ value, readFailed: false }))
    .catch(() => ({ value: null, readFailed: true }));
  const legacyRead = legacyReadResult.value;
  const transactions = legacyRead?.transactions ?? [];
  const checksum = checksumTransactions(transactions);
  const canonicalMeta = await getBatchMeta(batch.id);
  const canonicalTransactions = await getBatchTransactions(batch.id);
  const canonicalAccountIds = [
    ...new Set([
      ...(canonicalMeta?.accounts ?? []).map((account) => asString(account.id)),
      ...canonicalTransactions.map((row) => asString(row.accountId)),
    ].filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));
  const canonicalExists = Boolean(canonicalMeta) || canonicalTransactions.length > 0;
  const rowCount = transactions.length;
  const migrationMarker: LegacyTransactionMigrationMarker = {
    schemaVersion: 1,
    batchId: batch.id,
    checksum,
    rowCount,
  };
  const base: Omit<LegacyTransactionMigrationItem, "status"> = {
    batchId: batch.id,
    ownerEvidence: "missing",
    legacy: {
      createdAt: batch.createdAt,
      rowCount,
      declaredOk: batch.ok,
      declaredTotal: batch.total,
      declaredFailed: batch.failed,
      checksum,
    },
    canonical: {
      exists: canonicalExists,
      rowCount: canonicalMeta?.rowCount ?? canonicalTransactions.length,
      accountIds: canonicalAccountIds,
    },
    accountBinding: buildAccountBinding(batch, transactions),
    migrationMarker,
  };

  if (canonicalExists) {
    return {
      ...base,
      status: "conflict",
      conflictReason: "SAME_ID_CANONICAL_BATCH",
    };
  }

  if (legacyReadResult.readFailed) {
    return {
      ...base,
      status: "partial",
      partialReason: "LEGACY_ROW_READ_FAILED",
    };
  }

  if (rowCount !== batch.ok) {
    return {
      ...base,
      status: "partial",
      partialReason: "LEGACY_ROW_COUNT_MISMATCH",
    };
  }

  return {
    ...base,
    status: "quarantine",
    quarantineReason: "OWNER_UNKNOWN",
  };
}

export async function buildLegacyTransactionMigrationDryRunReport(
  options: LegacyTransactionMigrationDryRunOptions = {},
): Promise<LegacyTransactionMigrationDryRunReport> {
  const batches = await listAllLegacyBatches();
  const items = (await Promise.all(batches.map((batch) => buildDryRunItem(batch))))
    .sort((left, right) => left.batchId.localeCompare(right.batchId));

  return {
    schemaVersion: 1,
    mode: "dry-run",
    generatedAt: normalizeGeneratedAt(options.generatedAt),
    summary: {
      legacyBatches: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      conflicts: items.filter((item) => item.status === "conflict").length,
      partial: items.filter((item) => item.status === "partial").length,
      quarantine: items.filter((item) => item.status === "quarantine").length,
      canonicalCollisions: items.filter((item) => item.conflictReason === "SAME_ID_CANONICAL_BATCH").length,
      ownerless: items.filter((item) => item.ownerEvidence === "missing").length,
    },
    items,
  };
}
