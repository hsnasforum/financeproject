import { prisma } from "@/lib/db/prisma";
import { loadFinlifeSnapshot } from "@/lib/finlife/snapshot";
import { shouldRunFinlifeSync } from "@/lib/finlife/syncPolicy";
import { runFinlifeSnapshotSync } from "@/lib/finlife/syncRunner";
import { buildNormFilter, normalizeSearchQuery, type QueryMode } from "@/lib/sources/search";
import { refreshSourceIfStale } from "@/lib/sources/datago/sync";
import { decodeUnifiedCursor, encodeUnifiedCursor } from "@/lib/sources/unifiedCursor";
import { normalizeProviderName } from "@/lib/sources/providerName";
import { type UnifiedSourceId } from "@/lib/sources/types";
import {
  integrateCanonicalWithMatches,
  type DepositProtectionMode,
} from "@/lib/sources/unifiedEnrichPolicy";

export class UnifiedInputError extends Error {}

export type UnifiedProductView = {
  sourceId: UnifiedSourceId;
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
  match?: {
    method: string;
    confidence: number;
    internalProductId: number | null;
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

type EnrichSourceId = "datago_kdb";
export type UnifiedMode = "merged" | "integrated";
const MATCH_CONFIDENCE_THRESHOLD = 0.92;

function resolveFinlifeSnapshotTtlMs(): number {
  const sec = Number(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS ?? "43200");
  if (!Number.isFinite(sec)) return 12 * 60 * 60 * 1000;
  return Math.max(60, Math.trunc(sec)) * 1000;
}

async function refreshFinlifeSnapshotIfStale(kind: "deposit" | "saving", refresh: boolean): Promise<void> {
  if (!refresh) return;

  const snapshot = loadFinlifeSnapshot(kind);
  const ttlMs = snapshot?.meta?.ttlMs ?? resolveFinlifeSnapshotTtlMs();
  const decision = shouldRunFinlifeSync(snapshot?.meta ?? null, Date.now(), { ttlMs, minCompletionRate: 0.95 });
  if (!decision.shouldRun) return;

  const result = await runFinlifeSnapshotSync(kind);
  if (result.ok) return;

  console.error("[unified] finlife refresh failed", {
    kind,
    code: result.error.code,
    message: result.error.message,
    upstreamStatus: result.error.upstreamStatus ?? null,
  });
}

function normalizeEnrichSources(input: EnrichSourceId[] | undefined): EnrichSourceId[] {
  if (!Array.isArray(input) || input.length === 0) return [];
  const picked = new Set<EnrichSourceId>();
  for (const sourceId of input) {
    if (sourceId === "datago_kdb") picked.add(sourceId);
  }
  return [...picked];
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
  if (input.items.length === 0 || enrichSources.length === 0) return { items: input.items };

  const finPrdtCdList = [...new Set(input.items.map((item) => item.externalKey).filter(Boolean))];
  if (finPrdtCdList.length === 0) return { items: input.items };

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
  if (products.length === 0) return { items: input.items };

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
      sourceId: "datago_kdb",
      kind: "deposit",
      externalKey: row.externalKey,
      providerName: row.providerNameRaw,
      productName: row.productNameRaw,
      summary: summaryLine || undefined,
      badges: ["KDB_ONLY"],
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

async function getOnlyNewSinceBySource(kind: "deposit" | "saving", sourceIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (sourceIds.length === 0) return out;
  const rows = await prisma.externalSourceSnapshot.findMany({
    where: { kind, sourceId: { in: sourceIds } },
    select: { sourceId: true, metaJson: true },
  });
  for (const row of rows) {
    const meta = (row.metaJson as Record<string, unknown> | null) ?? null;
    const lastRun = (meta?.lastRun as Record<string, unknown> | undefined) ?? undefined;
    const startedAt = typeof lastRun?.startedAt === "string" ? lastRun.startedAt : null;
    if (!startedAt) continue;
    const date = new Date(startedAt);
    if (Number.isFinite(date.getTime())) out.set(row.sourceId, date);
  }
  return out;
}

async function getSingleSourceExternal(input: {
  sourceId: "datago_kdb";
  kind: "deposit" | "saving";
  cursor: string | null;
  q: string | null;
  onlyNew: boolean;
  changedSince: string | null;
  includeTimestamps: boolean;
  limit: number;
  sort: "recent" | "name";
  qMode: QueryMode;
}): Promise<UnifiedResult> {
  const { sourceId, kind, cursor, q, onlyNew, changedSince, includeTimestamps, limit, sort, qMode } = input;
  const sourceMap: Record<string, { count: number }> = {};
  const onlyNewMap = await getOnlyNewSinceBySource(kind, [sourceId]);
  const onlyNewThreshold = onlyNew ? onlyNewMap.get(sourceId) : undefined;

  const changedSinceDate = changedSince ? new Date(changedSince) : null;
  const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
  const qNorm = normalizeSearchQuery(q ?? "");
  const qFilter = buildNormFilter(["providerNameNorm", "productNameNorm"], qNorm, qMode);

  const decoded = cursor ? decodeUnifiedCursor(cursor) : null;
  if (cursor && !decoded) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  const rows = await prisma.externalProduct.findMany({
    where: {
      sourceId,
      kind,
      ...qFilter,
      ...(onlyNewThreshold ? { firstSeenAt: { gte: onlyNewThreshold } } : {}),
      ...(hasChangedSince && changedSinceDate
        ? {
            OR: [
              { firstSeenAt: { gte: changedSinceDate } },
              { updatedAt: { gte: changedSinceDate } },
            ],
          }
        : {}),
    },
    include: {
      matches: {
        orderBy: { confidence: "desc" },
        take: 1,
      },
    },
    orderBy: sort === "recent"
      ? [{ lastSeenAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }]
      : [{ providerNameNorm: "asc" }, { productNameNorm: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(decoded ? { cursor: { id: decoded.id }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const picked = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: picked[picked.length - 1].id }) : null;

  const merged: UnifiedProductView[] = picked.map((row) => ({
    sourceId,
    kind: row.kind,
    externalKey: row.externalKey,
    providerName: row.providerNameRaw,
    productName: row.productNameRaw,
    summary: row.summary ?? undefined,
    firstSeenAt: includeTimestamps ? row.firstSeenAt.toISOString() : undefined,
    lastSeenAt: includeTimestamps ? row.lastSeenAt.toISOString() : undefined,
    updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
    match: row.matches[0]
      ? {
          method: row.matches[0].method,
          confidence: row.matches[0].confidence,
          internalProductId: row.matches[0].internalProductId,
          evidence: (row.matches[0].evidenceJson as Record<string, unknown>) ?? undefined,
        }
      : undefined,
  }));

  sourceMap[sourceId] = { count: merged.length };
  return {
    kind,
    sources: sourceMap,
    merged,
    items: merged,
    pageInfo: {
      hasMore,
      nextCursor,
      limit,
      sourceId,
    },
  };
}

async function getSingleSourceFinlife(input: {
  kind: "deposit" | "saving";
  cursor: string | null;
  q: string | null;
  onlyNew: boolean;
  changedSince: string | null;
  includeTimestamps: boolean;
  limit: number;
  sort: "recent" | "name";
  qMode: QueryMode;
}): Promise<UnifiedResult> {
  const { kind, cursor, q, onlyNew, changedSince, includeTimestamps, limit, sort, qMode } = input;
  const sourceId: UnifiedSourceId = "finlife";
  const sourceMap: Record<string, { count: number }> = {};
  const decoded = cursor ? decodeUnifiedCursor(cursor) : null;
  if (cursor && !decoded) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  const snapshot = loadFinlifeSnapshot(kind);
  const snapshotGeneratedAt = snapshot?.meta?.generatedAt ? new Date(snapshot.meta.generatedAt) : null;
  const hasOnlyNewThreshold = Boolean(onlyNew && snapshotGeneratedAt && Number.isFinite(snapshotGeneratedAt.getTime()));

  const changedSinceDate = changedSince ? new Date(changedSince) : null;
  const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
  const qNorm = normalizeSearchQuery(q ?? "");
  const qFilter = buildNormFilter(["productNameNorm", "providerNameNorm", "searchTextNorm"], qNorm, qMode);

  const rows = await prisma.product.findMany({
    where: {
      kind,
      ...qFilter,
      ...(hasOnlyNewThreshold && snapshotGeneratedAt ? { createdAt: { gte: snapshotGeneratedAt } } : {}),
      ...(hasChangedSince && changedSinceDate
        ? {
            OR: [
              { createdAt: { gte: changedSinceDate } },
              { updatedAt: { gte: changedSinceDate } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      finPrdtCd: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      raw: true,
      provider: {
        select: {
          name: true,
        },
      },
    },
    orderBy: sort === "recent" ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(decoded ? { cursor: { id: decoded.id }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const picked = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: picked[picked.length - 1].id }) : null;

  const merged: UnifiedProductView[] = picked.map((row) => {
    const raw = (row.raw as Record<string, unknown> | null) ?? null;
    const providerNameRaw = typeof raw?.kor_co_nm === "string" ? raw.kor_co_nm : "";
    const productNameRaw = typeof raw?.fin_prdt_nm === "string" ? raw.fin_prdt_nm : "";
    return {
      sourceId,
      kind,
      externalKey: row.finPrdtCd,
      providerName: providerNameRaw || row.provider?.name || "",
      productName: productNameRaw || row.name || "",
      firstSeenAt: includeTimestamps ? row.createdAt.toISOString() : undefined,
      lastSeenAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
      updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
    };
  });

  sourceMap[sourceId] = { count: merged.length };
  return {
    kind,
    sources: sourceMap,
    merged,
    items: merged,
    pageInfo: {
      hasMore,
      nextCursor,
      limit,
      sourceId,
    },
  };
}

export async function getUnifiedProducts(input: {
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
  limit: number;
  sort: "recent" | "name";
  qMode: QueryMode;
  enrichSources?: EnrichSourceId[];
  depositProtection?: DepositProtectionMode;
  includeKdbOnly?: boolean;
  debug?: boolean;
}): Promise<UnifiedResult> {
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
    limit,
    sort,
    qMode,
    enrichSources = [],
    depositProtection = "any",
    includeKdbOnly = false,
    debug = false,
  } = input;

  const usesFinlife = mode === "integrated"
    || sourceId === "finlife"
    || (!sourceId && includeSources.includes("finlife"));
  if (usesFinlife) {
    await refreshFinlifeSnapshotIfStale(kind, refresh);
  }

  if (mode === "integrated") {
    if (!includeSources.includes("finlife")) {
      throw new UnifiedInputError("Integrated mode requires finlife as canonical source.");
    }
    if (cursor) {
      throw new UnifiedInputError("Cursor pagination is not supported in integrated mode.");
    }

    if (includeSources.includes("datago_kdb")) {
      await refreshSourceIfStale("datago_kdb", kind, refresh);
    }

    const canonical = await getSingleSourceFinlife({
      kind,
      cursor: null,
      q,
      onlyNew,
      changedSince,
      includeTimestamps,
      limit: Math.min(1000, Math.max(1, limit)),
      sort,
      qMode,
    });

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

  if (cursor && !sourceId) {
    throw new UnifiedInputError("Cursor pagination requires single sourceId.");
  }

  if (sourceId) {
    if (!includeSources.includes(sourceId) || includeSources.length !== 1) {
      throw new UnifiedInputError("Cursor pagination requires single sourceId.");
    }
    if (sourceId === "datago_kdb") {
      await refreshSourceIfStale(sourceId, kind, refresh);
      return getSingleSourceExternal({
        sourceId,
        kind,
        cursor,
        q,
        onlyNew,
        changedSince,
        includeTimestamps,
        limit,
        sort,
        qMode,
      });
    }
    const base = await getSingleSourceFinlife({
      kind,
      cursor,
      q,
      onlyNew,
      changedSince,
      includeTimestamps,
      limit,
      sort,
      qMode,
    });
    if (kind === "deposit" && enrichSources.length > 0) {
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
    return base;
  }

  const sourceMap: Record<string, { count: number }> = {};
  const merged: UnifiedProductView[] = [];
  const qNorm = normalizeSearchQuery(q ?? "");

  if (includeSources.includes("datago_kdb")) {
    await refreshSourceIfStale("datago_kdb", kind, refresh);
  }

  if (includeSources.includes("finlife")) {
    const snapshot = loadFinlifeSnapshot(kind);
    const snapshotGeneratedAt = snapshot?.meta?.generatedAt ? new Date(snapshot.meta.generatedAt) : null;
    const hasOnlyNewThreshold = Boolean(onlyNew && snapshotGeneratedAt && Number.isFinite(snapshotGeneratedAt.getTime()));
    const changedSinceDate = changedSince ? new Date(changedSince) : null;
    const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
    const qFilter = buildNormFilter(["productNameNorm", "providerNameNorm", "searchTextNorm"], qNorm, qMode);

    const finlifeRows = await prisma.product.findMany({
      where: {
        kind,
        ...qFilter,
        ...(hasOnlyNewThreshold && snapshotGeneratedAt ? { createdAt: { gte: snapshotGeneratedAt } } : {}),
        ...(hasChangedSince && changedSinceDate
          ? {
              OR: [
                { createdAt: { gte: changedSinceDate } },
                { updatedAt: { gte: changedSinceDate } },
              ],
            }
          : {}),
      },
      select: {
        finPrdtCd: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        raw: true,
        provider: {
          select: {
            name: true,
          },
        },
      },
      orderBy: sort === "recent" ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ name: "asc" }, { id: "asc" }],
      take: Math.min(1000, Math.max(1, limit)),
    });

    for (const row of finlifeRows) {
      const raw = (row.raw as Record<string, unknown> | null) ?? null;
      const providerNameRaw = typeof raw?.kor_co_nm === "string" ? raw.kor_co_nm : "";
      const productNameRaw = typeof raw?.fin_prdt_nm === "string" ? raw.fin_prdt_nm : "";
      merged.push({
        sourceId: "finlife",
        kind,
        externalKey: row.finPrdtCd,
        providerName: providerNameRaw || row.provider?.name || "",
        productName: productNameRaw || row.name || "",
        firstSeenAt: includeTimestamps ? row.createdAt.toISOString() : undefined,
        lastSeenAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
        updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
      });
    }
    sourceMap.finlife = { count: finlifeRows.length };
  }

  const externalSources = includeSources.filter((id) => id !== "finlife") as Array<"datago_kdb">;
  if (externalSources.length > 0) {
    const onlyNewMap = await getOnlyNewSinceBySource(kind, externalSources);
    const changedSinceDate = changedSince ? new Date(changedSince) : null;
    const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
    const qFilter = buildNormFilter(["providerNameNorm", "productNameNorm"], qNorm, qMode);

    const rows = await prisma.externalProduct.findMany({
      where: {
        kind,
        sourceId: { in: externalSources },
        ...qFilter,
      },
      include: {
        matches: {
          orderBy: { confidence: "desc" },
          take: 1,
        },
      },
      orderBy: sort === "recent"
        ? [{ lastSeenAt: "desc" }, { updatedAt: "desc" }]
        : [{ sourceId: "asc" }, { providerNameNorm: "asc" }, { productNameNorm: "asc" }],
      take: Math.min(1000, Math.max(1, limit)),
    });

    for (const row of rows) {
      if (onlyNew) {
        const threshold = onlyNewMap.get(row.sourceId);
        if (!threshold || row.firstSeenAt < threshold) continue;
      }
      if (hasChangedSince && changedSinceDate) {
        if (row.firstSeenAt < changedSinceDate && row.updatedAt < changedSinceDate) continue;
      }

      merged.push({
        sourceId: row.sourceId as UnifiedSourceId,
        kind: row.kind,
        externalKey: row.externalKey,
        providerName: row.providerNameRaw,
        productName: row.productNameRaw,
        summary: row.summary ?? undefined,
        firstSeenAt: includeTimestamps ? row.firstSeenAt.toISOString() : undefined,
        lastSeenAt: includeTimestamps ? row.lastSeenAt.toISOString() : undefined,
        updatedAt: includeTimestamps ? row.updatedAt.toISOString() : undefined,
        match: row.matches[0]
          ? {
              method: row.matches[0].method,
              confidence: row.matches[0].confidence,
              internalProductId: row.matches[0].internalProductId,
              evidence: (row.matches[0].evidenceJson as Record<string, unknown>) ?? undefined,
            }
          : undefined,
      });
      const bucket = sourceMap[row.sourceId] ?? { count: 0 };
      bucket.count += 1;
      sourceMap[row.sourceId] = bucket;
    }
  }

  if (sort === "recent") {
    merged.sort((a, b) => {
      const aTs = Date.parse(a.lastSeenAt ?? a.updatedAt ?? a.firstSeenAt ?? "");
      const bTs = Date.parse(b.lastSeenAt ?? b.updatedAt ?? b.firstSeenAt ?? "");
      if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
      return `${a.providerName} ${a.productName}`.localeCompare(`${b.providerName} ${b.productName}`);
    });
  } else {
    merged.sort((a, b) => `${a.providerName} ${a.productName}`.localeCompare(`${b.providerName} ${b.productName}`));
  }

  const sliced = merged.slice(0, Math.min(1000, Math.max(1, limit)));
  return {
    kind,
    sources: sourceMap,
    merged: sliced,
    items: sliced,
    pageInfo: {
      hasMore: false,
      nextCursor: null,
      limit,
    },
  };
}
