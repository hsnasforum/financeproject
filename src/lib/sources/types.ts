export type UnifiedKind = "deposit" | "saving" | "loan";

export type ExternalSourceId = "datago_kdb";

export type UnifiedProviderSourceId = "samplebank";

export type UnifiedSourceId = "finlife" | ExternalSourceId | UnifiedProviderSourceId;

export type NormalizedExternalProduct = {
  sourceId: ExternalSourceId;
  kind: UnifiedKind;
  externalKey: string;
  providerNameRaw: string;
  providerNameNorm: string;
  productNameRaw: string;
  productNameNorm: string;
  summary?: string;
  rawJson: Record<string, unknown>;
};

export type SourceFreshness = {
  lastSyncedAt: string | null;
  lastAttemptAt?: string | null;
  ttlMs: number;
  ageMs: number | null;
  isFresh: boolean;
};

export type SourceStatusRow = {
  sourceId: UnifiedSourceId;
  kind: UnifiedKind;
  lastSyncedAt: string | null;
  lastAttemptAt?: string | null;
  ttlMs: number;
  ageMs: number | null;
  isFresh: boolean;
  fallbackUsed?: boolean;
  counts: number;
  lastRun?: {
    startedAt?: string;
    finishedAt?: string;
    fetchedItems?: number;
    upsertedItems?: number;
    touchedItems?: number;
    createdItems?: number;
    updatedItems?: number;
    totalCount?: number;
    resultCode?: string;
    resultMsg?: string;
  } | null;
  lastError?: {
    at?: string;
    message?: string;
  } | null;
};

export type ProductSourceFreshness = {
  sourceId: UnifiedSourceId;
  kind: UnifiedKind;
  sourceAsOf: string | null;
  checkedAt: string;
  ttlMs: number | null;
  ageMs: number | null;
  freshness: "fresh" | "stale" | "unavailable" | "sample";
  fallbackUsed: boolean;
  message: string;
};

export type ProductFreshnessSummary = {
  checkedAt: string;
  overall: "fresh" | "stale" | "partial" | "unavailable";
  sources: ProductSourceFreshness[];
};

export type ProductSourceIssue = {
  sourceId: UnifiedSourceId;
  phase: "refresh" | "query";
  code: "SOURCE_REFRESH_FAILED" | "SOURCE_QUERY_FAILED";
  fallbackUsed: boolean;
  message: string;
  recovery: string;
};

export type SyncSourceOption = "kdb" | "all";

export type FinlifeNormalizedDump = {
  schemaVersion: number;
  meta: {
    dumpedAt: string;
    kind: "deposit" | "saving" | "mortgage-loan" | "rent-house-loan" | "credit-loan";
    source: "finlife_sync_normalized_dump";
    productCount: number;
    optionCount: number;
    groupsScanned?: string[];
  };
  products: Array<{
    fin_prdt_cd: string;
    fin_co_no?: string;
    kor_co_nm?: string;
    fin_prdt_nm?: string;
    raw?: Record<string, unknown>;
    options: Array<{
      save_trm?: string;
      intr_rate?: number | null;
      intr_rate2?: number | null;
      raw?: Record<string, unknown> | null;
    }>;
  }>;
};
