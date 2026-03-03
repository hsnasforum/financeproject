import { type AccountTransaction } from "./types";

export type V3ImportSource = {
  kind: "csv";
  fileName?: string;
  sha256?: string;
};

export type V3TransactionRecord = Omit<AccountTransaction, "source"> & {
  id: string;
  txnId: string;
  batchId: string;
  createdAt: string;
  source: "csv";
  sourceInfo?: V3ImportSource;
};

export type V3ImportBatch = {
  id: string;
  createdAt: string;
  kind: "csv";
  fileName?: string;
  accountId?: string;
  accountHint?: string;
  sha256?: string;
  total: number;
  ok: number;
  failed: number;
};

export type ImportBatchMeta = {
  id: string;
  createdAt: string;
  source: "csv";
  rowCount: number;
  ymMin?: string;
  ymMax?: string;
  accounts?: Array<{
    id: string;
    name?: string;
  }>;
};

export type StoredTransaction = AccountTransaction & {
  txnId: string;
  batchId: string;
};
