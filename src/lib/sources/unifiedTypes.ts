import type { QueryMode } from "@/lib/sources/search";
import type { UnifiedSourceId } from "@/lib/sources/types";
import type { DepositProtectionMode, UnifiedOptionView } from "@/lib/sources/unifiedEnrichPolicy";

export class UnifiedInputError extends Error {}

export type EnrichSourceId = "datago_kdb";

export type UnifiedMode = "merged" | "integrated";

export type UnifiedProductView = {
  stableId: string;
  sourceId: UnifiedSourceId;
  sourceIds?: UnifiedSourceId[];
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
    kdbMatched?: boolean;
  };
  options?: UnifiedOptionView[];
  /** Internal-only recommendation projection. Public unified routes never request this field. */
  recommendDetail?: {
    finPrdtCd: string;
    finCoNo?: string;
    productRaw: Record<string, unknown>;
    options: Array<{
      saveTrm?: string;
      intrRate: number | null;
      intrRate2: number | null;
      raw: Record<string, unknown>;
    }>;
    sourceUpdatedAt: string;
  };
  match?: {
    method: string;
    confidence: number;
    internalProductId: number | null;
    canonicalFinPrdtCd?: string;
    evidence?: Record<string, unknown>;
  };
};

export type UnifiedPageInfo = {
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
  sourceId?: UnifiedSourceId;
};

export type UnifiedResult = {
  kind: "deposit" | "saving";
  sources: Record<string, { count: number }>;
  merged: UnifiedProductView[];
  items: UnifiedProductView[];
  extras?: {
    kdbOnly?: UnifiedProductView[];
  };
  diagnostics?: {
    providerIndex: {
      finlifeProviders: number;
      kdbProvidersIndexed: number;
    };
    matchSummary: {
      kdb: { byExact: number; byNormalized: number; byFuzzy: number; none: number };
    };
    unmatchedProviders: Array<{ providerName: string; count: number }>;
    notes: string[];
  };
  pageInfo: UnifiedPageInfo;
};

export type UnifiedProductsInput = {
  kind: "deposit" | "saving";
  mode?: UnifiedMode;
  includeSources: UnifiedSourceId[];
  sourceId: UnifiedSourceId | null;
  cursor: string | null;
  q: string | null;
  refresh: boolean;
  onlyNew: boolean;
  changedSince: string | null;
  includeTimestamps: boolean;
  /** Server-internal flag used only by the recommendation pipeline. */
  includeRecommendDetail?: boolean;
  limit: number;
  sort: "recent" | "name";
  qMode: QueryMode;
  enrichSources?: EnrichSourceId[];
  depositProtection?: DepositProtectionMode;
  includeKdbOnly?: boolean;
  debug?: boolean;
};
