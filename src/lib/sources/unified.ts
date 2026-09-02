import { prisma } from "@/lib/db/prisma";
import { buildNormFilter, normalizeSearchQuery, type QueryMode } from "@/lib/sources/search";
import { decodeUnifiedCursor, encodeUnifiedCursor } from "@/lib/sources/unifiedCursor";
import { normalizeProviderName } from "@/lib/sources/providerName";
import { type ProductSourceIssue, type UnifiedSourceId } from "@/lib/sources/types";
import {
  DEFAULT_UNIFIED_SOURCE_LOADERS,
  buildFinlifeOptions,
  buildKdbOptions,
  getSamplebankMergedItems,
  getUnifiedSourceLoader,
  type UnifiedSourcePage,
  type UnifiedSourceLoader,
  type UnifiedSourceLoaderMap,
} from "@/lib/sources/unifiedLoaders";
import {
  applyDepositProtectionOnViews,
  buildStableUnifiedId,
  integrateCanonicalWithMatches,
  mergeUnifiedCatalogRows,
  stripUnifiedRecentSortAt,
  type DepositProtectionMode,
  type UnifiedMergeItem,
} from "@/lib/sources/unifiedEnrichPolicy";
import {
  UnifiedInputError,
  type UnifiedDataPartialReason,
  type EnrichSourceId,
  type UnifiedProductView,
  type UnifiedProductsInput,
  type UnifiedProviderFacetIssue,
  type UnifiedProviderFacetStatus,
  type UnifiedResult,
} from "@/lib/sources/unifiedTypes";

export { UnifiedInputError } from "@/lib/sources/unifiedTypes";
export type {
  EnrichSourceId,
  UnifiedMode,
  UnifiedPageInfo,
  UnifiedProductView,
  UnifiedProductsInput,
  UnifiedRequestInterruptionReason,
  UnifiedResult,
} from "@/lib/sources/unifiedTypes";

const MATCH_CONFIDENCE_THRESHOLD = 0.92;
const CATALOG_SCAN_MAX_PAGES = 20;
const CATALOG_SCAN_MAX_ROWS = 20_000;
const CATALOG_CURSOR_TTL_MS = 2 * 60 * 1000;
const CATALOG_CURSOR_MAX_ENTRIES = 128;

type CatalogSnapshot = {
  signature: string;
  createdAt: number;
  kind: "deposit" | "saving";
  sources: Record<string, { count: number }>;
  items: UnifiedProductView[];
  providers: string[];
  partialReasons: UnifiedDataPartialReason[];
  providerStatus: UnifiedProviderFacetStatus;
  sourceIssues?: ProductSourceIssue[];
};

type CatalogCursorState = {
  snapshot: CatalogSnapshot;
  offset: number;
  nextCursor: string | null;
};

const catalogCursorStates = new Map<number, CatalogCursorState>();
let nextCatalogCursorId = 1;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

function pruneCatalogCursorStates(now = Date.now()): void {
  for (const [id, state] of catalogCursorStates) {
    if (now - state.snapshot.createdAt > CATALOG_CURSOR_TTL_MS) catalogCursorStates.delete(id);
  }
  while (catalogCursorStates.size >= CATALOG_CURSOR_MAX_ENTRIES) {
    const oldestId = catalogCursorStates.keys().next().value as number | undefined;
    if (oldestId === undefined) break;
    catalogCursorStates.delete(oldestId);
  }
}

function allocateCatalogCursor(state: Omit<CatalogCursorState, "nextCursor">): string {
  pruneCatalogCursorStates();
  while (catalogCursorStates.has(nextCatalogCursorId)) nextCatalogCursorId += 1;
  const id = nextCatalogCursorId;
  nextCatalogCursorId = nextCatalogCursorId >= Number.MAX_SAFE_INTEGER ? 1 : nextCatalogCursorId + 1;
  catalogCursorStates.set(id, { ...state, nextCursor: null });
  return encodeUnifiedCursor({ id });
}

function catalogSnapshotSignature(input: UnifiedProductsInput, normalizedLimit: number): string {
  return JSON.stringify({
    kind: input.kind,
    mode: input.mode ?? "merged",
    includeSources: uniqueIncludedSources(input.includeSources),
    q: input.q?.trim() ?? "",
    provider: input.provider?.trim() ?? "",
    termMonths: input.termMonths ?? null,
    minRate: input.minRate ?? null,
    refresh: input.refresh,
    onlyNew: input.onlyNew,
    changedSince: input.changedSince,
    includeTimestamps: input.includeTimestamps,
    limit: normalizedLimit,
    sort: input.sort,
    qMode: input.qMode,
    depositProtection: input.depositProtection ?? "any",
  });
}

function catalogPageFromSnapshot(input: {
  snapshot: CatalogSnapshot;
  offset: number;
  limit: number;
  state?: CatalogCursorState;
}): UnifiedResult {
  const items = input.snapshot.items.slice(input.offset, input.offset + input.limit);
  const hasMore = input.offset + input.limit < input.snapshot.items.length;
  let nextCursor: string | null = null;
  if (hasMore) {
    nextCursor = input.state?.nextCursor ?? allocateCatalogCursor({
      snapshot: input.snapshot,
      offset: input.offset + input.limit,
    });
    if (input.state && input.state.nextCursor === null) input.state.nextCursor = nextCursor;
  }

  return {
    kind: input.snapshot.kind,
    sources: input.snapshot.sources,
    merged: items,
    items,
    facets: {
      providers: input.snapshot.providers,
      providerStatus: input.snapshot.providerStatus,
    },
    pageInfo: {
      hasMore,
      nextCursor,
      limit: input.limit,
      ...(input.snapshot.partialReasons.length > 0
        ? {
            partial: true,
            partialReasons: input.snapshot.partialReasons,
          }
        : {}),
    },
    ...(input.snapshot.sourceIssues ? { sourceIssues: input.snapshot.sourceIssues } : {}),
  };
}

function normalizeEnrichSources(input: EnrichSourceId[] | undefined): EnrichSourceId[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const picked = new Set<EnrichSourceId>();
  for (const sourceId of input) {
    if (sourceId === "datago_kdb") picked.add(sourceId);
  }
  return [...picked];
}

function withUnknownDepositProtectionSignals(items: UnifiedProductView[]): UnifiedProductView[] {
  return items.map((item) => ({
    ...item,
    signals: {
      ...(item.signals ?? {}),
      depositProtection: item.signals?.depositProtection ?? "unknown",
    },
  }));
}

function applyDepositProtectionToResult(result: UnifiedResult, mode: DepositProtectionMode): UnifiedResult {
  if (result.kind !== "deposit" || mode === "any") return result;
  const items = applyDepositProtectionOnViews({ items: result.items, mode });
  return {
    ...result,
    items,
    merged: items,
    pageInfo: {
      ...result.pageInfo,
      hasMore: mode === "require" && items.length === 0 ? false : result.pageInfo.hasMore,
    },
  };
}

async function enrichFinlifeDepositItems(input: {
  items: UnifiedProductView[];
  enrichSources: EnrichSourceId[];
  depositProtection: DepositProtectionMode;
  includeKdbOnly: boolean;
  q: string | null;
  qMode: QueryMode;
  includeTimestamps: boolean;
  debug: boolean;
}): Promise<{ items: UnifiedProductView[]; extras?: { kdbOnly?: UnifiedProductView[] }; diagnostics?: UnifiedResult["diagnostics"] }> {
  const enrichSources = normalizeEnrichSources(input.enrichSources);
  if (input.items.length === 0) return { items: input.items };
  if (enrichSources.length === 0) {
    return {
      items: applyDepositProtectionOnViews({
        items: withUnknownDepositProtectionSignals(input.items),
        mode: input.depositProtection,
      }),
    };
  }

  const finPrdtCdList = [...new Set(input.items.map((item) => item.externalKey).filter(Boolean))];
  if (finPrdtCdList.length === 0) {
    return {
      items: applyDepositProtectionOnViews({
        items: withUnknownDepositProtectionSignals(input.items),
        mode: input.depositProtection,
      }),
    };
  }

  const products = await prisma.product.findMany({
    where: {
      kind: "deposit",
      finPrdtCd: { in: finPrdtCdList },
    },
    select: {
      id: true,
      finPrdtCd: true,
      providerNameNorm: true,
      productNameNorm: true,
      raw: true,
    },
  });
  if (products.length === 0) {
    return {
      items: applyDepositProtectionOnViews({
        items: withUnknownDepositProtectionSignals(input.items),
        mode: input.depositProtection,
      }),
    };
  }

  const codeByProductId = new Map<number, string>();
  const productIds: number[] = [];
  const finlifeMetaByCode = new Map<string, { providerNorm: string; productNorm: string; providerRaw: string }>();
  for (const row of products) {
    codeByProductId.set(row.id, row.finPrdtCd);
    productIds.push(row.id);
    const raw = (row.raw as Record<string, unknown> | null) ?? null;
    const providerRaw = typeof raw?.kor_co_nm === "string" ? raw.kor_co_nm : "";
    finlifeMetaByCode.set(row.finPrdtCd, {
      providerNorm: normalizeProviderName(row.providerNameNorm ?? providerRaw),
      productNorm: (row.productNameNorm ?? "").trim().toLowerCase(),
      providerRaw: providerRaw || (row.providerNameNorm ?? ""),
    });
  }

  const matches = await prisma.externalProductMatch.findMany({
    where: {
      confidence: { gte: MATCH_CONFIDENCE_THRESHOLD },
      internalProductId: { in: productIds },
      externalProduct: {
        is: {
          kind: "deposit",
          sourceId: { in: enrichSources },
        },
      },
    },
    select: {
      internalProductId: true,
      externalProductId: true,
      externalProduct: {
        select: {
          sourceId: true,
        },
      },
    },
  });

  const kdbMatchedCodes = new Set<string>();
  const matchedKdbExternalIds = new Set<number>();
  const kdbMethodByCode = new Map<string, "byExact" | "byNormalized" | "byFuzzy" | "none">();
  for (const row of matches) {
    if (typeof row.internalProductId !== "number") continue;
    const code = codeByProductId.get(row.internalProductId);
    if (!code) continue;
    if (row.externalProduct.sourceId === "datago_kdb") {
      kdbMatchedCodes.add(code);
      matchedKdbExternalIds.add(row.externalProductId);
      kdbMethodByCode.set(code, "byExact");
    }
  }

  const externalRows = await prisma.externalProduct.findMany({
    where: {
      kind: "deposit",
      sourceId: { in: enrichSources },
    },
    select: {
      id: true,
      sourceId: true,
      providerNameRaw: true,
      providerNameNorm: true,
      productNameNorm: true,
    },
  });

  const providerNormSetBySource = {
    datago_kdb: new Set<string>(),
  };
  const kdbRowsByProviderNorm = new Map<string, Array<{ id: number; productNorm: string }>>();
  for (const row of externalRows) {
    const normalizedProvider = normalizeProviderName(row.providerNameNorm || row.providerNameRaw);
    if (!normalizedProvider) continue;
    providerNormSetBySource.datago_kdb.add(normalizedProvider);
    const bucket = kdbRowsByProviderNorm.get(normalizedProvider) ?? [];
    bucket.push({ id: row.id, productNorm: row.productNameNorm });
    kdbRowsByProviderNorm.set(normalizedProvider, bucket);
  }

  for (const code of finPrdtCdList) {
    const meta = finlifeMetaByCode.get(code);
    if (!meta) continue;

    if (enrichSources.includes("datago_kdb") && !kdbMatchedCodes.has(code)) {
      const candidates = kdbRowsByProviderNorm.get(meta.providerNorm) ?? [];
      if (candidates.length > 0) {
        const strictHit = candidates.some((c) => c.productNorm === meta.productNorm && c.productNorm.length > 0);
        const fuzzyHit = !strictHit && candidates.some((c) => {
          if (!c.productNorm || c.productNorm.length < 4 || meta.productNorm.length < 4) return false;
          return c.productNorm.includes(meta.productNorm) || meta.productNorm.includes(c.productNorm);
        });
        if (strictHit || fuzzyHit) {
          kdbMatchedCodes.add(code);
          kdbMethodByCode.set(code, strictHit ? "byNormalized" : "byFuzzy");
        } else {
          kdbMethodByCode.set(code, "none");
        }
      } else {
        kdbMethodByCode.set(code, "none");
      }
    }
  }

  const integrated = integrateCanonicalWithMatches({
    canonicalItems: input.items,
    isKdbMatched: (item) => kdbMatchedCodes.has(item.externalKey),
    depositProtectionMode: input.depositProtection,
  });
  const filtered = integrated.items;

  if (!input.includeKdbOnly || !enrichSources.includes("datago_kdb")) {
    if (!input.debug) return { items: filtered };
    const unmatchedCount = new Map<string, number>();
    for (const item of filtered) {
      if (item.signals?.kdbMatched) continue;
      const key = item.providerName || "-";
      unmatchedCount.set(key, (unmatchedCount.get(key) ?? 0) + 1);
    }
    const unmatchedProviders = [...unmatchedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([providerName, count]) => ({ providerName, count }));

    const matchSummary = {
      kdb: { byExact: 0, byNormalized: 0, byFuzzy: 0, none: 0 },
    };
    for (const code of finPrdtCdList) {
      matchSummary.kdb[kdbMethodByCode.get(code) ?? "none"] += 1;
    }
    const notes: string[] = [];
    if (providerNormSetBySource.datago_kdb.size === 0) notes.push("KDB 인덱스가 비어 있어 매칭 후보가 부족합니다.");
    if (matchSummary.kdb.byExact + matchSummary.kdb.byNormalized + matchSummary.kdb.byFuzzy === 0 && providerNormSetBySource.datago_kdb.size > 0) {
      notes.push("KDB 매칭이 0건입니다. 상품명 정규화 또는 동기화 범위를 확인하세요.");
    }

    return {
      items: filtered,
      diagnostics: {
        providerIndex: {
          finlifeProviders: new Set(input.items.map((item) => normalizeProviderName(item.providerName))).size,
          kdbProvidersIndexed: providerNormSetBySource.datago_kdb.size,
        },
        matchSummary,
        unmatchedProviders,
        notes,
      },
    };
  }

  const qNorm = normalizeSearchQuery(input.q ?? "");
  const qFilter = buildNormFilter(["providerNameNorm", "productNameNorm"], qNorm, input.qMode);
  const kdbOnlyRows = await prisma.externalProduct.findMany({
    where: {
      sourceId: "datago_kdb",
      kind: "deposit",
      id: { notIn: [...matchedKdbExternalIds] },
      ...qFilter,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      externalKey: true,
      providerNameRaw: true,
      productNameRaw: true,
      summary: true,
      firstSeenAt: true,
      lastSeenAt: true,
      updatedAt: true,
      rawJson: true,
    },
  });

  const kdbOnly: UnifiedProductView[] = kdbOnlyRows.map((row) => {
    const raw = (row.rawJson as Record<string, unknown> | null) ?? null;
    const hit = typeof raw?.hitIrtCndCone === "string" ? raw.hitIrtCndCone : "";
    const term = typeof raw?.prdJinTrmCone === "string" ? raw.prdJinTrmCone : "";
    const summaryLine = [row.summary, hit ? `최고금리: ${hit}` : "", term ? `가입기간: ${term}` : ""].filter(Boolean).join(" / ");
    return {
      stableId: buildStableUnifiedId({
        sourceId: "datago_kdb",
        externalKey: row.externalKey,
      }),
      sourceId: "datago_kdb",
      kind: "deposit",
      externalKey: row.externalKey,
      providerName: row.providerNameRaw,
      productName: row.productNameRaw,
      summary: summaryLine || undefined,
      badges: ["KDB_ONLY"],
      signals: {
        depositProtection: "matched",
      },
      options: buildKdbOptions(row.rawJson),
      firstSeenAt: input.includeTimestamps ? row.firstSeenAt.toISOString() : undefined,
      lastSeenAt: input.includeTimestamps ? row.lastSeenAt.toISOString() : undefined,
      updatedAt: input.includeTimestamps ? row.updatedAt.toISOString() : undefined,
    };
  });

  const result: { items: UnifiedProductView[]; extras?: { kdbOnly?: UnifiedProductView[] }; diagnostics?: UnifiedResult["diagnostics"] } = {
    items: filtered,
    extras: { kdbOnly },
  };
  if (input.debug) {
    const unmatchedCount = new Map<string, number>();
    for (const item of filtered) {
      if (item.signals?.kdbMatched) continue;
      const key = item.providerName || "-";
      unmatchedCount.set(key, (unmatchedCount.get(key) ?? 0) + 1);
    }
    const unmatchedProviders = [...unmatchedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([providerName, count]) => ({ providerName, count }));
    const matchSummary = {
      kdb: { byExact: 0, byNormalized: 0, byFuzzy: 0, none: 0 },
    };
    for (const code of finPrdtCdList) {
      matchSummary.kdb[kdbMethodByCode.get(code) ?? "none"] += 1;
    }
    const notes: string[] = [];
    if (providerNormSetBySource.datago_kdb.size === 0) notes.push("KDB 인덱스가 비어 있어 매칭 후보가 부족합니다.");
    if (matchSummary.kdb.byExact + matchSummary.kdb.byNormalized + matchSummary.kdb.byFuzzy === 0 && providerNormSetBySource.datago_kdb.size > 0) {
      notes.push("KDB 매칭이 0건입니다. 상품명 정규화 또는 동기화 범위를 확인하세요.");
    }
    result.diagnostics = {
      providerIndex: {
        finlifeProviders: new Set(input.items.map((item) => normalizeProviderName(item.providerName))).size,
        kdbProvidersIndexed: providerNormSetBySource.datago_kdb.size,
      },
      matchSummary,
      unmatchedProviders,
      notes,
    };
  }

  return result;
}

function normalizeUnifiedLimit(limit: number): number {
  return Math.min(1000, Math.max(1, Math.trunc(limit)));
}

function hasCatalogFilters(input: Pick<UnifiedProductsInput, "provider" | "termMonths" | "minRate">): boolean {
  return Boolean(
    input.provider?.trim()
    || (typeof input.termMonths === "number" && Number.isFinite(input.termMonths) && input.termMonths > 0)
    || (typeof input.minRate === "number" && Number.isFinite(input.minRate) && input.minRate > 0),
  );
}

function filterCatalogItems(
  items: UnifiedProductView[],
  input: Pick<UnifiedProductsInput, "provider" | "termMonths" | "minRate">,
): UnifiedProductView[] {
  if (!hasCatalogFilters(input)) return items;
  const provider = input.provider?.trim() ?? "";
  const termMonths = typeof input.termMonths === "number" && Number.isFinite(input.termMonths) && input.termMonths > 0
    ? Math.trunc(input.termMonths)
    : null;
  const minRate = typeof input.minRate === "number" && Number.isFinite(input.minRate) && input.minRate > 0
    ? input.minRate
    : null;

  return items.filter((item) => {
    if (provider && item.providerName !== provider) return false;
    if (termMonths === null && minRate === null) return true;
    const options = Array.isArray(item.options) ? item.options : [];
    return options.some((option) => {
      if (termMonths !== null && option.termMonths !== termMonths) return false;
      const rate = option.intrRate2 ?? option.intrRate;
      if (minRate !== null && (rate === null || !Number.isFinite(rate) || rate < minRate)) return false;
      return true;
    });
  });
}

function uniqueIncludedSources(includeSources: UnifiedSourceId[]): UnifiedSourceId[] {
  return [...new Set(includeSources)];
}

function sourceResultFromPage(kind: "deposit" | "saving", page: UnifiedSourcePage): UnifiedResult {
  return {
    kind,
    sources: { [page.sourceId]: { count: page.count } },
    merged: page.items,
    items: page.items,
    pageInfo: page.pageInfo,
  };
}

function scanCapReason(input: {
  sourceId: UnifiedSourceId;
  unit: "pages" | "rows";
  limit: number;
}): UnifiedDataPartialReason {
  const countLabel = input.unit === "pages"
    ? `${input.limit.toLocaleString("ko-KR")}페이지`
    : `${input.limit.toLocaleString("ko-KR")}개 행`;
  return {
    code: input.unit === "pages" ? "SCAN_PAGE_CAP" : "SCAN_ROW_CAP",
    sourceId: input.sourceId,
    cap: { unit: input.unit, limit: input.limit },
    message: `조회 안전을 위해 이 원천은 ${countLabel}까지 확인하고 중단했습니다. 이후 상품은 결과에 포함되지 않았습니다.`,
    recovery: "기관, 기간 또는 금리 조건을 더 좁혀 다시 조회해 주세요.",
  };
}

async function queryAllSourcePages(
  loader: UnifiedSourceLoader,
  query: Parameters<UnifiedSourceLoader["query"]>[0],
): Promise<UnifiedSourcePage> {
  const items: UnifiedProductView[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let count = 0;
  let lastSourceId = loader.sourceId;

  for (let pageIndex = 0; pageIndex < CATALOG_SCAN_MAX_PAGES; pageIndex += 1) {
    throwIfAborted(query.signal);
    const page = await loader.query({ ...query, cursor });
    throwIfAborted(query.signal);
    lastSourceId = page.sourceId;
    count += page.items.length;
    const availableRows = Math.max(0, CATALOG_SCAN_MAX_ROWS - items.length);
    items.push(...page.items.slice(0, availableRows));
    const rowsTruncated = page.items.length > availableRows;
    const rowLimitReached = rowsTruncated || (items.length >= CATALOG_SCAN_MAX_ROWS && page.pageInfo.hasMore);
    if (!page.pageInfo.hasMore) {
      const partialReasons = rowsTruncated
        ? [scanCapReason({ sourceId: page.sourceId, unit: "rows", limit: CATALOG_SCAN_MAX_ROWS })]
        : [];
      return {
        sourceId: page.sourceId,
        count,
        items,
        pageInfo: {
          hasMore: false,
          nextCursor: null,
          limit: query.limit,
          sourceId: page.sourceId,
          ...(partialReasons.length > 0
            ? {
                partial: true,
                partialReasons,
              }
            : {}),
        },
      };
    }

    if (rowLimitReached || pageIndex + 1 >= CATALOG_SCAN_MAX_PAGES) {
      const partialReason = scanCapReason({
        sourceId: page.sourceId,
        unit: rowLimitReached ? "rows" : "pages",
        limit: rowLimitReached ? CATALOG_SCAN_MAX_ROWS : CATALOG_SCAN_MAX_PAGES,
      });
      return {
        sourceId: page.sourceId,
        count,
        items,
        pageInfo: {
          hasMore: true,
          nextCursor: page.pageInfo.nextCursor,
          limit: query.limit,
          sourceId: page.sourceId,
          partial: true,
          partialReasons: [partialReason],
        },
      };
    }

    const nextCursor = page.pageInfo.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new UnifiedInputError(`상품 원천 ${page.sourceId}의 cursor가 진행되지 않습니다.`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    sourceId: lastSourceId,
    count,
    items,
    pageInfo: {
      hasMore: true,
      nextCursor: cursor,
      limit: query.limit,
      sourceId: lastSourceId,
      partial: true,
      partialReasons: [scanCapReason({
        sourceId: lastSourceId,
        unit: "pages",
        limit: CATALOG_SCAN_MAX_PAGES,
      })],
    },
  };
}

function sourceIssue(input: {
  sourceId: UnifiedSourceId;
  phase: ProductSourceIssue["phase"];
  error: unknown;
  log?: boolean;
}): ProductSourceIssue {
  if (input.log !== false) {
    console.error("[unified] product source unavailable", {
      sourceId: input.sourceId,
      phase: input.phase,
      message: input.error instanceof Error ? input.error.message : "unknown",
    });
  }
  if (input.phase === "refresh") {
    return {
      sourceId: input.sourceId,
      phase: input.phase,
      code: "SOURCE_REFRESH_FAILED",
      fallbackUsed: true,
      message: "최신 데이터 갱신에 실패해 이전에 저장된 상품을 표시합니다.",
      recovery: "가입 전 금융회사 공시에서 최신 금리와 조건을 다시 확인해 주세요.",
    };
  }
  return {
    sourceId: input.sourceId,
    phase: input.phase,
    code: "SOURCE_QUERY_FAILED",
    fallbackUsed: false,
    message: "이 원천의 상품 데이터를 불러오지 못해 후보가 누락되었습니다. 다른 원천의 결과만 표시합니다.",
    recovery: "잠시 후 다시 조회하거나 원천 상태를 확인해 주세요.",
  };
}

function sourcePartialReason(issue: ProductSourceIssue): UnifiedDataPartialReason {
  return {
    code: issue.phase === "refresh" ? "SOURCE_REFRESH_FALLBACK" : "SOURCE_QUERY_FAILED",
    sourceId: issue.sourceId,
    message: issue.message,
    recovery: issue.recovery,
  };
}

function providerFacetIssue(sourceId: UnifiedSourceId): UnifiedProviderFacetIssue {
  return {
    code: "PROVIDER_FACET_FAILED",
    sourceId,
    message: "전체 제공 기관 목록을 불러오지 못해 현재 조회된 상품의 기관만 표시합니다.",
    recovery: "잠시 후 다시 조회해 전체 기관 목록을 확인해 주세요.",
  };
}

function withPartialReasons(
  pageInfo: UnifiedResult["pageInfo"],
  reasons: UnifiedDataPartialReason[],
): UnifiedResult["pageInfo"] {
  const combined = [...(pageInfo.partialReasons ?? []), ...reasons];
  if (combined.length === 0) return pageInfo;
  return {
    ...pageInfo,
    partial: true,
    partialReasons: combined,
  };
}

async function refreshSourceSafely(input: {
  loader: UnifiedSourceLoader | undefined;
  sourceId: UnifiedSourceId;
  kind: "deposit" | "saving";
  refresh: boolean;
  issues: ProductSourceIssue[];
  partialReasons: UnifiedDataPartialReason[];
}): Promise<void> {
  if (!input.loader) throw new UnifiedInputError(`지원하지 않는 sourceId입니다: ${input.sourceId}`);
  try {
    const outcome = await input.loader.refreshIfNeeded({ kind: input.kind, refresh: input.refresh });
    if (outcome?.fallbackUsed) {
      const issue = sourceIssue({
        sourceId: input.sourceId,
        phase: "refresh",
        error: null,
        log: false,
      });
      input.issues.push(issue);
      input.partialReasons.push(sourcePartialReason(issue));
    }
  } catch (error) {
    const issue = sourceIssue({ sourceId: input.sourceId, phase: "refresh", error });
    input.issues.push(issue);
    input.partialReasons.push(sourcePartialReason(issue));
  }
}

export async function getUnifiedProductsWithLoaders(
  input: UnifiedProductsInput,
  loaders: UnifiedSourceLoaderMap = DEFAULT_UNIFIED_SOURCE_LOADERS,
): Promise<UnifiedResult> {
  const {
    kind,
    mode = "merged",
    includeSources,
    sourceId,
    cursor,
    q,
    provider = null,
    termMonths = null,
    minRate = null,
    refresh,
    onlyNew,
    changedSince,
    includeTimestamps,
    includeRecommendDetail = false,
    limit,
    sort,
    qMode,
    enrichSources = [],
    depositProtection = "any",
    includeKdbOnly = false,
    debug = false,
  } = input;
  const normalizedLimit = normalizeUnifiedLimit(limit);
  const catalogFiltersActive = hasCatalogFilters({ provider, termMonths, minRate });
  if (catalogFiltersActive && (mode !== "merged" || sourceId !== null)) {
    throw new UnifiedInputError("카탈로그 필터는 merged 다중 원천 조회에서만 사용할 수 있습니다.");
  }
  const sourceQuery = {
    kind,
    q,
    onlyNew,
    changedSince,
    includeTimestamps,
    includeRecommendDetail,
    sort,
    qMode,
    debug,
    provider,
    termMonths,
    minRate,
    signal: input.signal,
  };
  const catalogSignature = catalogSnapshotSignature(input, normalizedLimit);

  if (catalogFiltersActive && cursor) {
    throwIfAborted(input.signal);
    pruneCatalogCursorStates();
    const decoded = decodeUnifiedCursor(cursor);
    const state = decoded ? catalogCursorStates.get(decoded.id) : undefined;
    if (!state || state.snapshot.signature !== catalogSignature) {
      throw new UnifiedInputError("상품 필터 cursor가 만료되었거나 현재 조건과 일치하지 않습니다.");
    }
    return catalogPageFromSnapshot({
      snapshot: state.snapshot,
      offset: state.offset,
      limit: normalizedLimit,
      state,
    });
  }

  if (mode === "integrated") {
    if (!includeSources.includes("finlife")) {
      throw new UnifiedInputError("Integrated mode requires finlife as canonical source.");
    }
    if (cursor) {
      throw new UnifiedInputError("Cursor pagination is not supported in integrated mode.");
    }

    const sourceIssues: ProductSourceIssue[] = [];
    const partialReasons: UnifiedDataPartialReason[] = [];
    const finlifeLoader = getUnifiedSourceLoader(loaders, "finlife");
    await refreshSourceSafely({
      loader: finlifeLoader,
      sourceId: "finlife",
      kind,
      refresh,
      issues: sourceIssues,
      partialReasons,
    });
    if (includeSources.includes("datago_kdb")) {
      const kdbLoader = getUnifiedSourceLoader(loaders, "datago_kdb");
      await refreshSourceSafely({
        loader: kdbLoader,
        sourceId: "datago_kdb",
        kind,
        refresh,
        issues: sourceIssues,
        partialReasons,
      });
    }

    const canonicalPage = await finlifeLoader.query({
      ...sourceQuery,
      cursor: null,
      limit: normalizedLimit,
    });
    const canonical = sourceResultFromPage(kind, canonicalPage);

    if (kind !== "deposit") {
      return {
        ...canonical,
        ...(sourceIssues.length > 0 ? { sourceIssues } : {}),
        pageInfo: {
          hasMore: false,
          nextCursor: null,
          limit,
          ...(partialReasons.length > 0
            ? {
                partial: true,
                partialReasons,
              }
            : {}),
        },
      };
    }

    const enrichSourceSet = new Set<EnrichSourceId>();
    if (includeSources.includes("datago_kdb")) enrichSourceSet.add("datago_kdb");
    let enriched: Awaited<ReturnType<typeof enrichFinlifeDepositItems>>;
    try {
      enriched = await enrichFinlifeDepositItems({
        items: canonical.items,
        enrichSources: [...enrichSourceSet],
        depositProtection,
        includeKdbOnly,
        q,
        qMode,
        includeTimestamps,
        debug,
      });
    } catch (error) {
      if (!includeSources.includes("datago_kdb")) throw error;
      const issue = sourceIssue({ sourceId: "datago_kdb", phase: "query", error });
      sourceIssues.push(issue);
      partialReasons.push(sourcePartialReason(issue));
      enriched = { items: canonical.items };
    }

    const sourceCounts = { ...canonical.sources };
    sourceCounts.finlife = { count: enriched.items.length };
    if (includeSources.includes("datago_kdb")) {
      sourceCounts.datago_kdb = { count: enriched.extras?.kdbOnly?.length ?? 0 };
    }

    return {
      ...canonical,
      sources: sourceCounts,
      items: enriched.items,
      merged: enriched.items,
      extras: enriched.extras,
      diagnostics: enriched.diagnostics,
      ...(sourceIssues.length > 0 ? { sourceIssues } : {}),
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit,
        ...(partialReasons.length > 0
          ? {
              partial: true,
              partialReasons,
            }
          : {}),
      },
    };
  }

  const mergedCursor = cursor && !sourceId ? decodeUnifiedCursor(cursor) : null;
  if (cursor && !sourceId && !mergedCursor) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  if (sourceId) {
    if (!includeSources.includes(sourceId) || includeSources.length !== 1) {
      throw new UnifiedInputError("Cursor pagination requires single sourceId.");
    }
    const loader = getUnifiedSourceLoader(loaders, sourceId);
    const sourceIssues: ProductSourceIssue[] = [];
    const partialReasons: UnifiedDataPartialReason[] = [];
    await refreshSourceSafely({
      loader,
      sourceId,
      kind,
      refresh,
      issues: sourceIssues,
      partialReasons,
    });
    const page = await loader.query({
      ...sourceQuery,
      cursor,
      limit,
    });
    const base = sourceResultFromPage(kind, page);

    if (sourceId === "finlife" && kind === "deposit" && enrichSources.length > 0) {
      const enriched = await enrichFinlifeDepositItems({
        items: base.items,
        enrichSources,
        depositProtection,
        includeKdbOnly,
        q,
        qMode,
        includeTimestamps,
        debug,
      });
      return {
        ...base,
        items: enriched.items,
        merged: enriched.items,
        extras: enriched.extras,
        diagnostics: enriched.diagnostics,
        ...(sourceIssues.length > 0 ? { sourceIssues } : {}),
        pageInfo: withPartialReasons(base.pageInfo, partialReasons),
      };
    }

    const result = applyDepositProtectionToResult({
      ...base,
      pageInfo: withPartialReasons(base.pageInfo, partialReasons),
    }, depositProtection);
    return sourceIssues.length > 0 ? { ...result, sourceIssues } : result;
  }

  const sourceMap: Record<string, { count: number }> = {};
  const merged: UnifiedProductView[] = [];
  const sourceIssues: ProductSourceIssue[] = [];
  const partialReasons: UnifiedDataPartialReason[] = [];
  const providerFacetIssues: UnifiedProviderFacetIssue[] = [];
  const providerNames = new Set<string>();
  let loadedSources = 0;
  for (const includedSourceId of uniqueIncludedSources(includeSources)) {
    throwIfAborted(input.signal);
    const loader = getUnifiedSourceLoader(loaders, includedSourceId);
    await refreshSourceSafely({
      loader,
      sourceId: includedSourceId,
      kind,
      refresh,
      issues: sourceIssues,
      partialReasons,
    });
    let sourceItems: UnifiedProductView[] = [];
    try {
      const page = catalogFiltersActive
        ? await queryAllSourcePages(loader, {
            ...sourceQuery,
            cursor: null,
            limit: Math.min(1000, Math.max(200, normalizedLimit)),
          })
        : await loader.query({
            ...sourceQuery,
            cursor: null,
            limit: normalizedLimit,
          });
      sourceMap[page.sourceId] = { count: page.count };
      merged.push(...page.items);
      sourceItems = page.items;
      partialReasons.push(...(page.pageInfo.partialReasons ?? []));
      loadedSources += 1;
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw error;
      sourceMap[includedSourceId] = { count: 0 };
      const issue = sourceIssue({ sourceId: includedSourceId, phase: "query", error });
      sourceIssues.push(issue);
      partialReasons.push(sourcePartialReason(issue));
    }

    try {
      const names = loader.listProviderNames
        ? await loader.listProviderNames({ kind, signal: input.signal })
        : sourceItems.map((item) => item.providerName);
      for (const name of names) {
        const normalized = name.trim();
        if (normalized) providerNames.add(normalized);
      }
    } catch (error) {
      if (input.signal?.aborted || isAbortError(error)) throw error;
      providerFacetIssues.push(providerFacetIssue(includedSourceId));
      console.error("[unified] provider facet unavailable", {
        sourceId: includedSourceId,
        message: error instanceof Error ? error.message : "unknown",
      });
      for (const item of sourceItems) {
        const normalized = item.providerName.trim();
        if (normalized) providerNames.add(normalized);
      }
    }
  }

  if (loadedSources === 0) {
    throw new Error("모든 상품 데이터 소스를 불러오지 못했습니다.");
  }

  const deduped = mergeUnifiedCatalogRows({
    items: merged,
    sort,
  }) as UnifiedProductView[];
  const protectedItems = kind === "deposit"
    ? applyDepositProtectionOnViews({ items: deduped, mode: depositProtection })
    : deduped;
  const filteredItems = filterCatalogItems(protectedItems, { provider, termMonths, minRate });

  const sortedProviders = [...providerNames].sort((left, right) => left.localeCompare(right, "ko"));
  const providerStatus: UnifiedProviderFacetStatus = providerFacetIssues.length > 0
    ? { state: "partial", issues: providerFacetIssues }
    : { state: "complete", issues: [] };
  if (catalogFiltersActive) {
    const snapshot: CatalogSnapshot = {
      signature: catalogSignature,
      createdAt: Date.now(),
      kind,
      sources: sourceMap,
      items: filteredItems,
      providers: sortedProviders,
      partialReasons,
      providerStatus,
      ...(sourceIssues.length > 0 ? { sourceIssues } : {}),
    };
    return catalogPageFromSnapshot({
      snapshot,
      offset: 0,
      limit: normalizedLimit,
    });
  }

  const offset = mergedCursor?.id ?? 0;
  const sliced = filteredItems.slice(offset, offset + normalizedLimit);
  const hasMore = offset + normalizedLimit < filteredItems.length;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: offset + normalizedLimit }) : null;

  return {
    kind,
    sources: sourceMap,
    merged: sliced,
    items: sliced,
    facets: { providers: sortedProviders, providerStatus },
    pageInfo: {
      hasMore,
      nextCursor,
      limit,
      ...(partialReasons.length > 0
        ? {
            partial: true,
            partialReasons,
          }
        : {}),
    },
    ...(sourceIssues.length > 0 ? { sourceIssues } : {}),
  };
}

export async function getUnifiedProducts(input: UnifiedProductsInput): Promise<UnifiedResult> {
  const result = await getUnifiedProductsWithLoaders(input);
  const stripItems = (items: UnifiedProductView[] | undefined): UnifiedProductView[] | undefined =>
    items?.map((item) => stripUnifiedRecentSortAt(item));
  return {
    ...result,
    items: stripItems(result.items) ?? [],
    merged: stripItems(result.merged) ?? [],
    ...(result.extras
      ? {
          extras: {
            ...result.extras,
            ...(result.extras.kdbOnly
              ? { kdbOnly: stripItems(result.extras.kdbOnly) }
              : {}),
          },
        }
      : {}),
  };
}

type UnifiedLookupTarget = {
  sourceId: "finlife" | "datago_kdb" | "samplebank";
  externalKey: string;
};

function normalizeDatagoLookupKey(value: string): string {
  let out = value.trim();
  while (out.toLowerCase().startsWith("datago_kdb:")) {
    out = out.slice("datago_kdb:".length).trim();
  }
  if (out.toUpperCase().startsWith("KDB:")) {
    out = out.slice("KDB:".length).trim();
  }
  return out;
}

function parseUnifiedLookupId(id: string): UnifiedLookupTarget {
  const raw = id.trim();
  if (!raw) {
    throw new UnifiedInputError("id는 필수입니다.");
  }

  const separator = raw.indexOf(":");
  if (separator < 0) {
    return {
      sourceId: "finlife",
      externalKey: raw,
    };
  }

  const sourceId = raw.slice(0, separator).trim().toLowerCase();
  const externalKey = raw.slice(separator + 1).trim();
  if (!externalKey) {
    throw new UnifiedInputError("id 형식이 올바르지 않습니다.");
  }
  if (sourceId !== "finlife" && sourceId !== "datago_kdb" && sourceId !== "samplebank") {
    throw new UnifiedInputError("id source는 finlife 또는 datago_kdb 또는 samplebank 이어야 합니다.");
  }

  const normalizedExternal = sourceId === "datago_kdb" ? normalizeDatagoLookupKey(externalKey) : externalKey;
  if (!normalizedExternal) {
    throw new UnifiedInputError("id 형식이 올바르지 않습니다.");
  }
  return {
    sourceId,
    externalKey: normalizedExternal,
  };
}

function buildDatagoSummary(summary: string | null | undefined, rawJson: unknown): string | undefined {
  const raw = (rawJson as Record<string, unknown> | null) ?? null;
  const hit = typeof raw?.hitIrtCndCone === "string" ? raw.hitIrtCndCone : "";
  const term = typeof raw?.prdJinTrmCone === "string" ? raw.prdJinTrmCone : "";
  const merged = [summary ?? "", hit ? `최고금리: ${hit}` : "", term ? `가입기간: ${term}` : ""]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" / ");
  return merged || undefined;
}

function buildFinlifeItemFromProductRow(
  row: {
    finPrdtCd: string;
    kind: string;
    name: string | null;
    raw: unknown;
    createdAt: Date;
    updatedAt: Date;
    provider: { name: string } | null;
    options: Array<{ saveTrm: string | null; intrRate: number | null; intrRate2: number | null }>;
  },
  includeTimestamps: boolean,
): UnifiedProductView {
  const raw = (row.raw as Record<string, unknown> | null) ?? null;
  const providerNameRaw = typeof raw?.kor_co_nm === "string" ? raw.kor_co_nm : "";
  const productNameRaw = typeof raw?.fin_prdt_nm === "string" ? raw.fin_prdt_nm : "";
  const summary = typeof raw?.spcl_cnd === "string"
    ? raw.spcl_cnd
    : (typeof raw?.join_way === "string" ? raw.join_way : undefined);

  return {
    stableId: buildStableUnifiedId({
      sourceId: "finlife",
      externalKey: row.finPrdtCd,
    }),
    sourceId: "finlife",
    kind: row.kind,
    externalKey: row.finPrdtCd,
    providerName: providerNameRaw || row.provider?.name || "",
    productName: productNameRaw || row.name || row.finPrdtCd,
    summary,
    badges: ["FINLIFE"],
    options: buildFinlifeOptions(row.options),
    signals: {
      depositProtection: "unknown",
    },
    firstSeenAt: includeTimestamps ? row.createdAt.toISOString() : undefined,
    lastSeenAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
    updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
  };
}

function buildDatagoItemFromExternalRow(
  row: {
    sourceId: string;
    kind: string;
    externalKey: string;
    providerNameRaw: string;
    productNameRaw: string;
    summary: string | null;
    rawJson: unknown;
    firstSeenAt: Date;
    lastSeenAt: Date;
    updatedAt: Date;
  },
  includeTimestamps: boolean,
  canonicalFinPrdtCd?: string | null,
): UnifiedProductView {
  return {
    stableId: buildStableUnifiedId({
      sourceId: row.sourceId,
      externalKey: row.externalKey,
      canonicalFinPrdtCd,
    }),
    sourceId: "datago_kdb",
    kind: row.kind,
    externalKey: row.externalKey,
    providerName: row.providerNameRaw,
    productName: row.productNameRaw,
    summary: buildDatagoSummary(row.summary, row.rawJson),
    badges: canonicalFinPrdtCd ? ["KDB_MATCHED"] : ["KDB_ONLY"],
    signals: {
      depositProtection: "matched",
    },
    options: buildKdbOptions(row.rawJson),
    firstSeenAt: includeTimestamps ? row.firstSeenAt.toISOString() : undefined,
    lastSeenAt: includeTimestamps ? row.lastSeenAt.toISOString() : undefined,
    updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
  };
}

export async function getUnifiedProductById(input: {
  id: string;
  includeTimestamps?: boolean;
}): Promise<UnifiedProductView | null> {
  const includeTimestamps = Boolean(input.includeTimestamps);
  const target = parseUnifiedLookupId(input.id);

  if (target.sourceId === "finlife") {
    const finlife = await prisma.product.findUnique({
      where: { finPrdtCd: target.externalKey },
      select: {
        id: true,
        finPrdtCd: true,
        kind: true,
        name: true,
        raw: true,
        createdAt: true,
        updatedAt: true,
        provider: { select: { name: true } },
        options: {
          select: {
            saveTrm: true,
            intrRate: true,
            intrRate2: true,
          },
          orderBy: [{ saveTrm: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!finlife) return null;

    const canonical = buildFinlifeItemFromProductRow(finlife, includeTimestamps);
    if (finlife.kind !== "deposit") return canonical;

    const matches = await prisma.externalProductMatch.findMany({
      where: {
        internalProductId: finlife.id,
        externalProduct: {
          is: {
            sourceId: "datago_kdb",
            kind: "deposit",
          },
        },
      },
      orderBy: [{ confidence: "desc" }, { id: "asc" }],
      select: {
        externalProductId: true,
        externalProduct: {
          select: {
            sourceId: true,
            kind: true,
            externalKey: true,
            providerNameRaw: true,
            productNameRaw: true,
            summary: true,
            rawJson: true,
            firstSeenAt: true,
            lastSeenAt: true,
            updatedAt: true,
          },
        },
      },
      take: 20,
    });

    const dedupedByExternal = new Map<number, (typeof matches)[number]>();
    for (const row of matches) {
      if (!dedupedByExternal.has(row.externalProductId)) {
        dedupedByExternal.set(row.externalProductId, row);
      }
    }
    const matchedViews = [...dedupedByExternal.values()].map((row) =>
      buildDatagoItemFromExternalRow(
        row.externalProduct,
        includeTimestamps,
        finlife.finPrdtCd,
      ));

    if (matchedViews.length === 0) return canonical;

    const merged = mergeUnifiedCatalogRows({
      items: [canonical, ...matchedViews] as UnifiedMergeItem[],
      sort: "recent",
    }) as UnifiedProductView[];
    return merged[0] ?? canonical;
  }

  if (target.sourceId === "samplebank") {
    const loaded = await getSamplebankMergedItems({
      kind: "deposit",
      q: null,
      qMode: "contains",
      includeTimestamps,
      debug: false,
    });
    return loaded.items.find((item) => item.externalKey === target.externalKey) ?? null;
  }

  const external = await prisma.externalProduct.findFirst({
    where: {
      sourceId: "datago_kdb",
      externalKey: target.externalKey,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      sourceId: true,
      kind: true,
      externalKey: true,
      providerNameRaw: true,
      productNameRaw: true,
      summary: true,
      rawJson: true,
      firstSeenAt: true,
      lastSeenAt: true,
      updatedAt: true,
      matches: {
        orderBy: [{ confidence: "desc" }, { id: "asc" }],
        take: 1,
        select: {
          internalProductId: true,
          internalProduct: {
            select: {
              finPrdtCd: true,
            },
          },
        },
      },
    },
  });
  if (!external) return null;

  const canonicalFinPrdtCd = external.matches[0]?.internalProduct?.finPrdtCd ?? null;
  const kdbItem = buildDatagoItemFromExternalRow(external, includeTimestamps, canonicalFinPrdtCd);

  const internalProductId = external.matches[0]?.internalProductId;
  if (typeof internalProductId !== "number") {
    return kdbItem;
  }

  const finlife = await prisma.product.findUnique({
    where: { id: internalProductId },
    select: {
      finPrdtCd: true,
      kind: true,
      name: true,
      raw: true,
      createdAt: true,
      updatedAt: true,
      provider: { select: { name: true } },
      options: {
        select: {
          saveTrm: true,
          intrRate: true,
          intrRate2: true,
        },
        orderBy: [{ saveTrm: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!finlife) return kdbItem;

  const canonical = buildFinlifeItemFromProductRow(finlife, includeTimestamps);
  const merged = mergeUnifiedCatalogRows({
    items: [canonical, kdbItem] as UnifiedMergeItem[],
    sort: "recent",
  }) as UnifiedProductView[];
  return merged[0] ?? canonical;
}
