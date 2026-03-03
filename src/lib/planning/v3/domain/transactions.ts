import { type AccountTransaction } from "./types";

export type V3ImportSource = {
  kind: "csv";
  fileName?: string;
  sha256?: string;
};

export type V3TransactionRecord = Omit<AccountTransaction, "source"> & {
  id: string;
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
  sha256?: string;
  total: number;
  ok: number;
  failed: number;
};
