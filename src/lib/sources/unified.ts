import { prisma } from "@/lib/db/prisma";
import { buildNormFilter, normalizeSearchQuery, type QueryMode } from "@/lib/sources/search";
import { decodeUnifiedCursor, encodeUnifiedCursor } from "@/lib/sources/unifiedCursor";
import { normalizeProviderName } from "@/lib/sources/providerName";
import { type UnifiedSourceId } from "@/lib/sources/types";
import {
  DEFAULT_UNIFIED_SOURCE_LOADERS,
  buildFinlifeOptions,
  buildKdbOptions,
  getSamplebankMergedItems,
  getUnifiedSourceLoader,
  type UnifiedSourcePage,
  type UnifiedSourceLoaderMap,
} from "@/lib/sources/unifiedLoaders";
import {
  applyDepositProtectionOnViews,
  buildStableUnifiedId,
  integrateCanonicalWithMatches,
  mergeUnifiedCatalogRows,
  type DepositProtectionMode,
  type UnifiedMergeItem,
} from "@/lib/sources/unifiedEnrichPolicy";
import {
  UnifiedInputError,
  type EnrichSourceId,
  type UnifiedProductView,
  type UnifiedProductsInput,
  type UnifiedResult,
} from "@/lib/sources/unifiedTypes";

export { UnifiedInputError } from "@/lib/sources/unifiedTypes";
export type {
  EnrichSourceId,
  UnifiedMode,
  UnifiedPageInfo,
  UnifiedProductView,
  UnifiedProductsInput,
  UnifiedResult,
} from "@/lib/sources/unifiedTypes";

const MATCH_CONFIDENCE_THRESHOLD = 0.92;

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
  };

  if (mode === "integrated") {
    if (!includeSources.includes("finlife")) {
      throw new UnifiedInputError("Integrated mode requires finlife as canonical source.");
    }
    if (cursor) {
      throw new UnifiedInputError("Cursor pagination is not supported in integrated mode.");
    }

    const finlifeLoader = getUnifiedSourceLoader(loaders, "finlife");
    await finlifeLoader.refreshIfNeeded({ kind, refresh });
    if (includeSources.includes("datago_kdb")) {
      await getUnifiedSourceLoader(loaders, "datago_kdb").refreshIfNeeded({ kind, refresh });
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
        pageInfo: {
          hasMore: false,
          nextCursor: null,
          limit,
        },
      };
    }

    const enrichSourceSet = new Set<EnrichSourceId>();
    if (includeSources.includes("datago_kdb")) enrichSourceSet.add("datago_kdb");
    const enriched = await enrichFinlifeDepositItems({
      items: canonical.items,
      enrichSources: [...enrichSourceSet],
      depositProtection,
      includeKdbOnly,
      q,
      qMode,
      includeTimestamps,
      debug,
    });

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
      pageInfo: {
        hasMore: false,
        nextCursor: null,
        limit,
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
    await loader.refreshIfNeeded({ kind, refresh });
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
      };
    }

    return applyDepositProtectionToResult(base, depositProtection);
  }

  const sourceMap: Record<string, { count: number }> = {};
  const merged: UnifiedProductView[] = [];
  for (const includedSourceId of uniqueIncludedSources(includeSources)) {
    const loader = getUnifiedSourceLoader(loaders, includedSourceId);
    await loader.refreshIfNeeded({ kind, refresh });
    const page = await loader.query({
      ...sourceQuery,
      cursor: null,
      limit: normalizedLimit,
    });
    sourceMap[page.sourceId] = { count: page.count };
    merged.push(...page.items);
  }

  const deduped = mergeUnifiedCatalogRows({
    items: merged as UnifiedMergeItem[],
    sort,
  }) as UnifiedProductView[];
  const protectedItems = kind === "deposit"
    ? applyDepositProtectionOnViews({ items: deduped, mode: depositProtection })
    : deduped;
  const offset = mergedCursor?.id ?? 0;
  const sliced = protectedItems.slice(offset, offset + normalizedLimit);
  const hasMore = offset + normalizedLimit < protectedItems.length;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: offset + normalizedLimit }) : null;

  return {
    kind,
    sources: sourceMap,
    merged: sliced,
    items: sliced,
    pageInfo: {
      hasMore,
      nextCursor,
      limit,
    },
  };
}

export async function getUnifiedProducts(input: UnifiedProductsInput): Promise<UnifiedResult> {
  return getUnifiedProductsWithLoaders(input);
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
