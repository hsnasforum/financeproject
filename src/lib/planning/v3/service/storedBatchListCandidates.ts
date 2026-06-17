import { type ImportBatchMeta, type StoredTransaction } from "../domain/transactions";
import {
  getBatchTransactions,
  getBatchTransactionsFileModifiedAt,
  listBatchTransactionFileIds,
  listBatches as listStoredBatches,
} from "../store/batchesStore";

export type StoredBatchListCandidate = {
  meta: ImportBatchMeta;
  metadataSource: "stored" | "synthetic";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectBatchAccounts(
  transactions: StoredTransaction[],
  primaryAccountId?: string,
): NonNullable<ImportBatchMeta["accounts"]> | undefined {
  const accounts = new Map<string, { id: string }>();
  const primary = asString(primaryAccountId);
  if (primary) {
    accounts.set(primary, { id: primary });
  }
  for (const row of transactions) {
    const accountId = asString(row.accountId);
    if (!accountId || accounts.has(accountId)) continue;
    accounts.set(accountId, { id: accountId });
  }
  if (accounts.size < 1) return undefined;
  return [...accounts.values()];
}

function collectBatchMonthRange(transactions: StoredTransaction[]): { ymMin?: string; ymMax?: string } {
  const months = transactions
    .map((row) => asString(row.date).slice(0, 7))
    .filter((value) => /^\d{4}-\d{2}$/.test(value))
    .sort((left, right) => left.localeCompare(right));
  if (months.length < 1) return {};
  return {
    ymMin: months[0],
    ymMax: months[months.length - 1],
  };
}

function getLatestSyntheticBatchRowDateOrderingCreatedAt(transactions: StoredTransaction[]): string | null {
  let latestTs = Number.NEGATIVE_INFINITY;
  for (const row of transactions) {
    const date = asString(row.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const ts = Date.parse(`${date}T23:59:59.999Z`);
    if (!Number.isFinite(ts) || ts <= latestTs) continue;
    latestTs = ts;
  }
  if (!Number.isFinite(latestTs)) return null;
  return new Date(latestTs).toISOString();
}

export async function deriveSyntheticBatchOrderingCreatedAt(input: {
  batchId: string;
  transactions: StoredTransaction[];
}): Promise<string> {
  // Synthetic stored-only batches do not have trusted import metadata.
  // Ordering surrogate priority stays row-date first, then file mtime, then epoch.
  // Public createdAt exposure still stays behind the synthetic metadata boundary.
  const rowDateCreatedAt = getLatestSyntheticBatchRowDateOrderingCreatedAt(input.transactions);
  if (rowDateCreatedAt) return rowDateCreatedAt;
  const fileModifiedAt = await getBatchTransactionsFileModifiedAt(input.batchId);
  if (fileModifiedAt) return fileModifiedAt;
  return new Date(0).toISOString();
}

export function buildImportBatchMeta(input: {
  batchId: string;
  createdAt: string;
  rowCount: number;
  transactions: StoredTransaction[];
  accountId?: string;
}): ImportBatchMeta {
  const monthRange = collectBatchMonthRange(input.transactions);
  const accounts = collectBatchAccounts(input.transactions, input.accountId);
  return {
    id: input.batchId,
    createdAt: input.createdAt,
    source: "csv",
    rowCount: Math.max(0, Math.trunc(Number(input.rowCount) || 0)),
    ...(monthRange.ymMin ? { ymMin: monthRange.ymMin } : {}),
    ...(monthRange.ymMax ? { ymMax: monthRange.ymMax } : {}),
    ...(accounts ? { accounts } : {}),
  };
}

export async function listStoredBatchListCandidates(): Promise<StoredBatchListCandidate[]> {
  const [storedMeta, storedFileIds] = await Promise.all([
    listStoredBatches(),
    listBatchTransactionFileIds(),
  ]);

  const byId = new Map<string, StoredBatchListCandidate>(
    storedMeta.map((meta) => [
      meta.id,
      {
        meta,
        metadataSource: "stored" as const,
      },
    ]),
  );

  const syntheticIds = storedFileIds.filter((batchId) => !byId.has(batchId));
  if (syntheticIds.length < 1) {
    return [...byId.values()];
  }

  const syntheticRows = await Promise.all(syntheticIds.map(async (batchId) => {
    const transactions = await getBatchTransactions(batchId).catch(() => []);
    if (transactions.length < 1) return null;
    return {
      meta: buildImportBatchMeta({
        batchId,
        createdAt: await deriveSyntheticBatchOrderingCreatedAt({ batchId, transactions }),
        rowCount: transactions.length,
        transactions,
      }),
      metadataSource: "synthetic" as const,
    };
  }));

  for (const row of syntheticRows) {
    if (!row) continue;
    byId.set(row.meta.id, row);
  }

  return [...byId.values()];
}
