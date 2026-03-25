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

export type StoredImportDiagnosticsSummary = {
  rows: number;
  parsed: number;
  skipped: number;
};

export type StoredImportProvenanceHandoff = Pick<V3ImportSource, "fileName"> & {
  fileNameProvided?: boolean;
};

export type StoredImportSourceBinding = {
  artifactSha256: string;
  attestedFileName: string;
  originKind: "writer-handoff";
};

export type StoredImportMetadata = {
  diagnostics: StoredImportDiagnosticsSummary;
  provenance: StoredImportProvenanceHandoff;
  sourceBinding?: StoredImportSourceBinding;
};

export type StoredImportMetadataHandoff = StoredImportMetadata;

export type StoredTransaction = AccountTransaction & {
  txnId: string;
  batchId: string;
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
  importMetadata?: StoredImportMetadata;
};
