import { isSamplebankPublicAccessAllowed } from "@/lib/products/samplebankPolicy";
import type { ProductFreshnessSummary } from "@/lib/sources/types";
import type {
  UnifiedDataPartialReason,
  UnifiedProviderFacetIssue,
  UnifiedProviderFacetStatus,
  UnifiedSnapshotProvenance,
} from "@/lib/sources/unifiedTypes";

export type CatalogKind = "deposit" | "saving";

export type UnifiedOption = {
  sourceId?: string;
  termMonths: number | null;
  saveTrm?: string;
  intrRate: number | null;
  intrRate2: number | null;
};

export type UnifiedItem = {
  stableId: string;
  sourceId: string;
  sourceIds?: string[];
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  badges?: string[];
  options?: UnifiedOption[];
};

export type UnifiedResponse = {
  ok?: boolean;
  data?: {
    items?: UnifiedItem[];
    merged?: UnifiedItem[];
    pageInfo?: {
      hasMore?: boolean;
      nextCursor?: string | null;
      limit?: number;
      partial?: boolean;
      partialReasons?: UnifiedDataPartialReason[];
    };
    facets?: {
      providers?: string[];
      providerStatus?: UnifiedProviderFacetStatus;
    };
    provenance?: UnifiedSnapshotProvenance;
  };
  meta?: {
    generatedAt?: string;
    freshness?: ProductFreshnessSummary;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

export type CatalogState = {
  queryKey: string;
  rows: UnifiedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  freshness: ProductFreshnessSummary | null;
  providerNames: string[];
  partialReasons: UnifiedDataPartialReason[];
  providerStatus: UnifiedProviderFacetStatus;
  provenanceFingerprint: string | null;
};

export type CatalogUrlState = {
  kind: CatalogKind;
  q: string;
  provider: string;
  termMonths: string;
  minRate: string;
};

type CatalogSearchParamsInput = Pick<URLSearchParams, "get"> | Record<string, string | string[] | undefined> | null | undefined;

function getCatalogParam(searchParams: CatalogSearchParamsInput, key: string): string | null {
  if (!searchParams) return null;
  if (typeof (searchParams as Pick<URLSearchParams, "get">).get === "function") {
    return (searchParams as Pick<URLSearchParams, "get">).get(key);
  }
  const value = (searchParams as Record<string, string | string[] | undefined>)[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function parseCatalogKind(value: string | null | undefined): CatalogKind {
  return value === "saving" ? "saving" : "deposit";
}

export function parseCatalogUrlState(searchParams: CatalogSearchParamsInput): CatalogUrlState {
  const provider = (getCatalogParam(searchParams, "provider") ?? "").trim();
  return {
    kind: parseCatalogKind(getCatalogParam(searchParams, "kind")),
    q: (getCatalogParam(searchParams, "q") ?? "").trim(),
    provider: provider || "all",
    termMonths: (getCatalogParam(searchParams, "termMonths") ?? "").trim(),
    minRate: (getCatalogParam(searchParams, "minRate") ?? "").trim(),
  };
}

export function buildCatalogUrlParams(input: CatalogUrlState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("kind", input.kind);
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.provider.trim() && input.provider !== "all") params.set("provider", input.provider.trim());
  if (input.termMonths.trim()) params.set("termMonths", input.termMonths.trim());
  if (input.minRate.trim()) params.set("minRate", input.minRate.trim());
  return params;
}

export function buildCatalogPresetHref(kind: CatalogKind, searchParams?: CatalogSearchParamsInput): string {
  const current = parseCatalogUrlState(searchParams);
  const params = buildCatalogUrlParams({ ...current, kind });
  return `/products/catalog?${params.toString()}`;
}

export function isCatalogSamplebankVisible(input?: {
  nodeEnv?: string;
  publicFlag?: string;
}): boolean {
  return isSamplebankPublicAccessAllowed(input);
}

export function buildCatalogQueryKey(input: {
  kind: CatalogKind;
  q: string;
  provider: string;
  termMonths: string;
  minRate: string;
  includeSamplebank: boolean;
}): string {
  const sourcesKey = input.includeSamplebank ? "finlife,datago_kdb,samplebank" : "finlife,datago_kdb";
  return [
    input.kind,
    sourcesKey,
    input.q.trim(),
    input.provider.trim() || "all",
    input.termMonths.trim(),
    input.minRate.trim(),
  ].join("\u0000");
}

export function buildCatalogRequestParams(input: {
  kind: CatalogKind;
  q: string;
  provider: string;
  termMonths: string;
  minRate: string;
  includeSamplebank: boolean;
  append?: boolean;
  cursor?: string | null;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", "merged");
  params.set("kind", input.kind);
  params.set("includeSources", input.includeSamplebank ? "finlife,datago_kdb,samplebank" : "finlife,datago_kdb");
  params.set("limit", "60");
  params.set("sort", "recent");
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.provider.trim() && input.provider !== "all") params.set("provider", input.provider.trim());
  if (input.termMonths.trim()) params.set("termMonths", input.termMonths.trim());
  if (input.minRate.trim()) params.set("minRate", input.minRate.trim());
  if (input.append && input.cursor) params.set("cursor", input.cursor);
  return params;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const DATA_PARTIAL_CODES = new Set<UnifiedDataPartialReason["code"]>([
  "SOURCE_QUERY_FAILED",
  "SOURCE_REFRESH_FALLBACK",
  "SCAN_PAGE_CAP",
  "SCAN_ROW_CAP",
  "CURSOR_UNAVAILABLE_RESOURCE_LIMIT",
]);

type UnifiedSourceDataPartialReason = Extract<UnifiedDataPartialReason, { sourceId: string }>;

function parseDataPartialReasons(value: unknown): UnifiedDataPartialReason[] {
  if (!Array.isArray(value)) return [];
  const reasons: UnifiedDataPartialReason[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const code = entry.code;
    const message = entry.message;
    const recovery = entry.recovery;
    if (
      typeof code !== "string"
      || !DATA_PARTIAL_CODES.has(code as UnifiedDataPartialReason["code"])
      || typeof message !== "string"
      || typeof recovery !== "string"
    ) {
      continue;
    }
    if (code === "CURSOR_UNAVAILABLE_RESOURCE_LIMIT") {
      if (
        !isRecord(entry.resource)
        || typeof entry.resource.retainedRows !== "number"
        || !Number.isFinite(entry.resource.retainedRows)
        || (entry.resource.estimatedBytes !== null
          && (typeof entry.resource.estimatedBytes !== "number" || !Number.isFinite(entry.resource.estimatedBytes)))
      ) {
        continue;
      }
      reasons.push({
        code,
        message,
        recovery,
        resource: {
          retainedRows: entry.resource.retainedRows,
          estimatedBytes: entry.resource.estimatedBytes,
        },
      });
      continue;
    }
    const sourceId = entry.sourceId;
    if (sourceId !== "finlife" && sourceId !== "datago_kdb" && sourceId !== "samplebank") continue;
    const cap: UnifiedSourceDataPartialReason["cap"] = isRecord(entry.cap)
      && (entry.cap.unit === "pages" || entry.cap.unit === "rows")
      && typeof entry.cap.limit === "number"
      && Number.isFinite(entry.cap.limit)
      ? { unit: entry.cap.unit as "pages" | "rows", limit: entry.cap.limit }
      : undefined;
    reasons.push({
      code: code as UnifiedSourceDataPartialReason["code"],
      sourceId,
      message,
      recovery,
      ...(cap ? { cap } : {}),
    });
  }
  return reasons;
}

function parseProviderFacetStatus(value: unknown): UnifiedProviderFacetStatus {
  if (!isRecord(value) || (value.state !== "complete" && value.state !== "partial")) {
    return { state: "complete", issues: [] };
  }
  const issues: UnifiedProviderFacetIssue[] = Array.isArray(value.issues)
    ? value.issues.flatMap((entry) => {
        if (
          !isRecord(entry)
          || entry.code !== "PROVIDER_FACET_FAILED"
          || (entry.sourceId !== "finlife" && entry.sourceId !== "datago_kdb" && entry.sourceId !== "samplebank")
          || typeof entry.message !== "string"
          || typeof entry.recovery !== "string"
        ) {
          return [];
        }
        return [{
          code: "PROVIDER_FACET_FAILED" as const,
          sourceId: entry.sourceId,
          message: entry.message,
          recovery: entry.recovery,
        }];
      })
    : [];
  return { state: value.state, issues };
}

function parseSnapshotProvenance(value: unknown): UnifiedSnapshotProvenance | null {
  if (
    !isRecord(value)
    || value.policy !== "pinned_snapshot"
    || typeof value.capturedAt !== "string"
    || typeof value.versionFingerprint !== "string"
    || !isRecord(value.freshness)
    || typeof value.freshness.checkedAt !== "string"
    || !Array.isArray(value.freshness.sources)
    || (value.freshness.overall !== "fresh"
      && value.freshness.overall !== "stale"
      && value.freshness.overall !== "partial"
      && value.freshness.overall !== "unavailable")
  ) {
    return null;
  }
  return value as unknown as UnifiedSnapshotProvenance;
}

export function parseCatalogResponse(json: UnifiedResponse): {
  pageItems: UnifiedItem[];
  hasMore: boolean;
  nextCursor: string | null;
  freshness: ProductFreshnessSummary | null;
  providerNames: string[];
  partial: boolean;
  partialReasons: UnifiedDataPartialReason[];
  providerStatus: UnifiedProviderFacetStatus;
  provenance: UnifiedSnapshotProvenance | null;
} {
  const pageItems = Array.isArray(json.data?.items)
    ? json.data.items
    : (Array.isArray(json.data?.merged) ? json.data.merged : []);
  return {
    pageItems,
    hasMore: Boolean(json.data?.pageInfo?.hasMore),
    nextCursor: typeof json.data?.pageInfo?.nextCursor === "string" ? json.data.pageInfo.nextCursor : null,
    freshness: json.meta?.freshness ?? null,
    providerNames: Array.isArray(json.data?.facets?.providers)
      ? json.data.facets.providers.filter((name): name is string => typeof name === "string" && name.trim().length > 0)
      : [],
    partial: json.data?.pageInfo?.partial === true,
    partialReasons: parseDataPartialReasons(json.data?.pageInfo?.partialReasons),
    providerStatus: parseProviderFacetStatus(json.data?.facets?.providerStatus),
    provenance: parseSnapshotProvenance(json.data?.provenance),
  };
}

export function formatCatalogSourceName(sourceId: string): string {
  if (sourceId === "finlife") return "금융감독원 금융상품";
  if (sourceId === "datago_kdb") return "공공데이터 예금상품";
  if (sourceId === "samplebank") return "화면 확인용 예시";
  return sourceId;
}

export function formatCatalogSourceAsOf(value: string | null): string {
  if (!value) return "기준 시각 확인 안 됨";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "기준 시각 확인 안 됨";
  return date.toLocaleString("ko-KR", { hour12: false });
}

export function buildCatalogViewModel(input: {
  rows: UnifiedItem[];
  providerNames?: string[];
  selectedProvider: string;
  termMonths: string;
  minRate: string;
}) {
  const providers = new Map<string, { id: string; name: string }>();
  providers.set("all", { id: "all", name: "전체" });
  input.providerNames?.forEach((providerName) => {
    const name = providerName.trim();
    if (name && !providers.has(name)) providers.set(name, { id: name, name });
  });
  if (input.selectedProvider !== "all" && !providers.has(input.selectedProvider)) {
    providers.set(input.selectedProvider, { id: input.selectedProvider, name: input.selectedProvider });
  }
  input.rows.forEach((row) => {
    if (!providers.has(row.providerName)) {
      providers.set(row.providerName, { id: row.providerName, name: row.providerName });
    }
  });

  const termFilter = Number(input.termMonths);
  const hasTermFilter = Number.isFinite(termFilter) && termFilter > 0;
  const minRateFilter = Number(input.minRate);
  const hasMinRateFilter = Number.isFinite(minRateFilter) && minRateFilter > 0;

  const filteredRows = input.rows.filter((item) => {
    if (input.selectedProvider !== "all" && item.providerName !== input.selectedProvider) return false;

    const options = Array.isArray(item.options) ? item.options : [];
    if (!hasTermFilter && !hasMinRateFilter) return true;
    if (options.length === 0) return false;
    return options.some((option) => {
      if (hasTermFilter && option.termMonths !== termFilter) return false;
      if (hasMinRateFilter && (option.intrRate2 ?? option.intrRate ?? Number.NEGATIVE_INFINITY) < minRateFilter) return false;
      return true;
    });
  });

  return {
    providers: Array.from(providers.values()),
    filteredRows,
  };
}

export function formatCatalogRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "금리 정보 없음";
  return `${value.toFixed(2)}%`;
}
