import { isSamplebankPublicAccessAllowed } from "@/lib/products/samplebankPolicy";

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
    };
  };
  meta?: {
    generatedAt?: string;
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

export function parseCatalogUrlState(searchParams: CatalogSearchParamsInput): {
  kind: CatalogKind;
  q: string;
  termMonths: string;
  minRate: string;
} {
  return {
    kind: parseCatalogKind(getCatalogParam(searchParams, "kind")),
    q: (getCatalogParam(searchParams, "q") ?? "").trim(),
    termMonths: (getCatalogParam(searchParams, "termMonths") ?? "").trim(),
    minRate: (getCatalogParam(searchParams, "minRate") ?? "").trim(),
  };
}

export function buildCatalogPresetHref(kind: CatalogKind, searchParams?: CatalogSearchParamsInput): string {
  const params = new URLSearchParams();
  params.set("kind", kind);
  for (const key of ["q", "termMonths", "minRate"]) {
    const value = (getCatalogParam(searchParams, key) ?? "").trim();
    if (value) params.set(key, value);
  }
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
  includeSamplebank: boolean;
}): string {
  const sourcesKey = input.includeSamplebank ? "finlife,datago_kdb,samplebank" : "finlife,datago_kdb";
  return [input.kind, sourcesKey, input.q.trim()].join("\u0000");
}

export function buildCatalogRequestParams(input: {
  kind: CatalogKind;
  q: string;
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
  if (input.append && input.cursor) params.set("cursor", input.cursor);
  return params;
}

export function parseCatalogResponse(json: UnifiedResponse): {
  pageItems: UnifiedItem[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  const pageItems = Array.isArray(json.data?.items)
    ? json.data.items
    : (Array.isArray(json.data?.merged) ? json.data.merged : []);
  return {
    pageItems,
    hasMore: Boolean(json.data?.pageInfo?.hasMore),
    nextCursor: typeof json.data?.pageInfo?.nextCursor === "string" ? json.data.pageInfo.nextCursor : null,
  };
}

export function buildCatalogViewModel(input: {
  rows: UnifiedItem[];
  selectedProvider: string;
  termMonths: string;
  minRate: string;
}) {
  const providers = new Map<string, { id: string; name: string }>();
  providers.set("all", { id: "all", name: "전체" });
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
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}
