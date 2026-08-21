import { prisma } from "@/lib/db/prisma";
import { readFinlifeCompletionEvidence } from "@/lib/finlife/completionEvidence";
import { FINLIFE_FIELD_CONFIG, type FinlifeFieldSpec } from "@/lib/finlife/fieldConfig";
import { PRODUCT_DETAIL_OPTION_IDENTITY_RAW_KEYS } from "@/lib/finlife/productDetailOption";
import { runFinlifePersistentSync } from "@/lib/finlife/persistentSync";
import { loadFinlifeSnapshot, loadFinlifeSyncAttempt } from "@/lib/finlife/snapshot";
import { shouldRunFinlifeSync } from "@/lib/finlife/syncPolicy";
import { samplebankProvider } from "@/lib/providers/samplebank";
import { runProvider } from "@/lib/providers/runProvider";
import { refreshSourceIfStale } from "@/lib/sources/datago/sync";
import { buildNormFilter, normalizeSearchQuery, type QueryMode } from "@/lib/sources/search";
import { type UnifiedSourceId } from "@/lib/sources/types";
import { decodeUnifiedCursor, encodeUnifiedCursor } from "@/lib/sources/unifiedCursor";
import {
  buildStableUnifiedId,
  sortUnifiedOptions,
  type UnifiedOptionView,
} from "@/lib/sources/unifiedEnrichPolicy";
import {
  UnifiedInputError,
  type UnifiedPageInfo,
  type UnifiedProductView,
} from "@/lib/sources/unifiedTypes";

export type RefreshInput = {
  kind: "deposit" | "saving";
  refresh: boolean;
};

export type SourceQuery = {
  kind: "deposit" | "saving";
  cursor: string | null;
  q: string | null;
  onlyNew: boolean;
  changedSince: string | null;
  includeTimestamps: boolean;
  includeRecommendDetail?: boolean;
  limit: number;
  sort: "recent" | "name";
  qMode: QueryMode;
  debug: boolean;
};

export type UnifiedSourcePage = {
  sourceId: UnifiedSourceId;
  count: number;
  items: UnifiedProductView[];
  pageInfo: UnifiedPageInfo;
};

export type UnifiedSourceLoader = {
  sourceId: UnifiedSourceId;
  refreshIfNeeded(input: RefreshInput): Promise<void>;
  query(input: SourceQuery): Promise<UnifiedSourcePage>;
};

export type UnifiedSourceLoaderMap = Partial<Record<UnifiedSourceId, UnifiedSourceLoader>>;

function normalizeLimit(limit: number): number {
  return Math.min(1000, Math.max(1, Math.trunc(limit)));
}

function normalizeRate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseTermMonths(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const term = Math.trunc(value);
    return term >= 0 ? term : null;
  }
  if (typeof value !== "string") return null;
  const matched = value.replace(/,/g, "").match(/\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

export function buildFinlifeOptions(
  options: Array<{ saveTrm: string | null; intrRate: number | null; intrRate2: number | null }>,
): UnifiedOptionView[] {
  return sortUnifiedOptions(
    options.map((option) => ({
      sourceId: "finlife",
      termMonths: parseTermMonths(option.saveTrm),
      saveTrm: option.saveTrm ?? undefined,
      intrRate: normalizeRate(option.intrRate),
      intrRate2: normalizeRate(option.intrRate2),
    })),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const PRODUCT_DETAIL_NOTE_RAW_KEYS = ["join_deny", "spcl_cnd", "etc_note", "mtrt_int"] as const;
const RECOMMEND_DETAIL_MAX_STRING_LENGTH = 2_000;

function sanitizeAllowedDetailValue(value: unknown, maxLength: number): string | number | boolean | undefined {
  if (typeof value === "string") {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

function pickAllowedDetailRaw(
  rawValue: unknown,
  specs: FinlifeFieldSpec[] | undefined,
  extraKeys: readonly string[] = [],
): Record<string, unknown> {
  const raw = asRecord(rawValue);
  const allowed = new Map<string, number>();
  for (const spec of specs ?? []) {
    const maxLength = Math.max(1, Math.min(RECOMMEND_DETAIL_MAX_STRING_LENGTH, spec.maxLen ?? RECOMMEND_DETAIL_MAX_STRING_LENGTH));
    for (const key of spec.keys) allowed.set(key, maxLength);
  }
  for (const key of extraKeys) {
    if (!allowed.has(key)) allowed.set(key, RECOMMEND_DETAIL_MAX_STRING_LENGTH);
  }

  return Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => {
    const maxLength = allowed.get(key);
    if (maxLength === undefined) return [];
    const sanitized = sanitizeAllowedDetailValue(value, maxLength);
    return sanitized === undefined ? [] : [[key, sanitized]];
  }));
}

export function buildKdbOptions(rawJson: unknown): UnifiedOptionView[] {
  const raw = (rawJson as Record<string, unknown> | null) ?? null;
  if (!raw) return [];
  const saveTrm = typeof raw.prdJinTrmCone === "string" ? raw.prdJinTrmCone : "";
  const highRate = typeof raw.hitIrtCndCone === "string" ? raw.hitIrtCndCone : "";
  const lowRate = typeof raw.lowIrtCndCone === "string" ? raw.lowIrtCndCone : "";

  const option: UnifiedOptionView = {
    sourceId: "datago_kdb",
    termMonths: parseTermMonths(saveTrm),
    saveTrm: saveTrm || undefined,
    intrRate: normalizeRate(lowRate),
    intrRate2: normalizeRate(highRate),
  };
  if (option.termMonths === null && !option.saveTrm && option.intrRate === null && option.intrRate2 === null) {
    return [];
  }
  return sortUnifiedOptions([option]);
}

function matchesUnifiedQuery(text: string, qNorm: string, qMode: QueryMode): boolean {
  if (!qNorm) return true;
  if (!text) return false;
  if (qMode === "prefix") return text.startsWith(qNorm);
  return text.includes(qNorm);
}

function toSamplebankOptionRows(
  options: Array<{
    sourceId: "samplebank";
    termMonths: number | null;
    saveTrm?: string;
    intrRate: number | null;
    intrRate2: number | null;
  }>,
): UnifiedOptionView[] {
  return sortUnifiedOptions(
    options.map((option) => ({
      sourceId: "samplebank",
      termMonths: option.termMonths,
      saveTrm: option.saveTrm,
      intrRate: option.intrRate,
      intrRate2: option.intrRate2,
    })),
  );
}

export async function getSamplebankMergedItems(input: {
  kind: "deposit" | "saving";
  q: string | null;
  qMode: QueryMode;
  includeTimestamps: boolean;
  debug: boolean;
}): Promise<{ items: UnifiedProductView[]; count: number }> {
  const executed = await runProvider(samplebankProvider, {
    kind: input.kind,
  }, {
    debug: input.debug,
  });
  if (!executed.ok) {
    console.error("[unified] samplebank provider failed", {
      code: executed.error.code,
      message: executed.error.message,
    });
    return { items: [], count: 0 };
  }

  const qNorm = normalizeSearchQuery(input.q ?? "");
  const filtered = executed.data.items
    .filter((item) => item.kind === input.kind)
    .filter((item) => matchesUnifiedQuery(
      normalizeSearchQuery(`${item.providerName} ${item.productName}`),
      qNorm,
      input.qMode,
    ));

  const merged = filtered.map((item) => ({
    stableId: item.stableId || `samplebank:${item.externalKey}`,
    sourceId: "samplebank" as const,
    kind: item.kind,
    externalKey: item.externalKey,
    providerName: item.providerName,
    productName: item.productName,
    options: toSamplebankOptionRows(item.options),
    firstSeenAt: input.includeTimestamps ? executed.meta.generatedAt : undefined,
    lastSeenAt: input.includeTimestamps ? executed.meta.generatedAt : undefined,
    updatedAt: input.includeTimestamps ? executed.meta.generatedAt : undefined,
    badges: ["SAMPLEBANK"],
  }));
  return {
    items: merged,
    count: merged.length,
  };
}

function resolveFinlifeSnapshotTtlMs(): number {
  const sec = Number(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS ?? "43200");
  if (!Number.isFinite(sec)) return 12 * 60 * 60 * 1000;
  return Math.max(60, Math.trunc(sec)) * 1000;
}

function toFinlifeRefreshEvidenceMeta(input: {
  state: "db-complete" | "complete";
  lastSyncedAt: Date | null;
  meta: Record<string, unknown>;
}): { generatedAt: string; completionRate: number } | null {
  if (input.state !== "complete" || !input.lastSyncedAt) return null;
  const verified = input.meta.source === "finlife"
    && input.meta.fallbackUsed === false
    && input.meta.truncatedByHardCap === false;
  return {
    generatedAt: input.lastSyncedAt.toISOString(),
    completionRate: verified && typeof input.meta.completionRate === "number"
      ? input.meta.completionRate
      : 0,
  };
}

export async function refreshFinlifeSnapshotIfStale(kind: "deposit" | "saving", refresh: boolean): Promise<void> {
  if (!refresh) return;

  const incompleteAttempt = loadFinlifeSyncAttempt(kind);
  if (incompleteAttempt) {
    console.error("[unified] finlife snapshot refresh skipped for incomplete DB sync", {
      kind,
      status: incompleteAttempt.status,
      phase: incompleteAttempt.phase,
      errorCode: incompleteAttempt.errorCode ?? null,
    });
    return;
  }

  const evidence = await readFinlifeCompletionEvidence(kind);
  if (evidence.status === "error") {
    console.error("[unified] finlife refresh skipped because completion evidence is unavailable", {
      kind,
      message: evidence.error instanceof Error ? evidence.error.message : "unknown",
    });
    return;
  }

  const snapshot = loadFinlifeSnapshot(kind);
  const ttlMs = evidence.status === "found"
    ? evidence.ttlMs
    : snapshot?.meta?.ttlMs ?? resolveFinlifeSnapshotTtlMs();
  const policyMeta = evidence.status === "found"
    ? toFinlifeRefreshEvidenceMeta(evidence)
    : snapshot?.meta ?? null;
  const decision = shouldRunFinlifeSync(policyMeta, Date.now(), { ttlMs, minCompletionRate: 0.95 });
  if (!decision.shouldRun) return;

  let result: Awaited<ReturnType<typeof runFinlifePersistentSync>>;
  try {
    result = await runFinlifePersistentSync(kind);
  } catch (error) {
    console.error("[unified] finlife refresh failed", {
      kind,
      code: "UNEXPECTED_REFRESH_ERROR",
      message: error instanceof Error ? error.message : "Unexpected FINLIFE refresh error",
      upstreamStatus: null,
    });
    return;
  }
  if (result.ok) return;

  console.error("[unified] finlife refresh failed", {
    kind,
    code: result.error.code,
    message: result.error.message,
    upstreamStatus: result.error.upstreamStatus ?? null,
  });
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

function toValidDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function resolveFinlifeOnlyNewThreshold(
  kind: "deposit" | "saving",
  snapshotGeneratedAt: unknown,
): Promise<Date | null> {
  const evidence = await readFinlifeCompletionEvidence(kind);
  if (evidence.status === "found" && evidence.state === "complete") {
    const completedSnapshotGeneratedAt = toValidDate(evidence.meta.snapshotGeneratedAt);
    if (completedSnapshotGeneratedAt) return completedSnapshotGeneratedAt;
  }
  if (evidence.status === "error") {
    console.error("[unified] finlife completion evidence unavailable", {
      kind,
      message: evidence.error instanceof Error ? evidence.error.message : "unknown",
    });
  }
  return toValidDate(snapshotGeneratedAt);
}

function pageResult(input: {
  sourceId: UnifiedSourceId;
  items: UnifiedProductView[];
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
}): UnifiedSourcePage {
  return {
    sourceId: input.sourceId,
    count: input.count,
    items: input.items,
    pageInfo: {
      hasMore: input.hasMore,
      nextCursor: input.nextCursor,
      limit: input.limit,
      sourceId: input.sourceId,
    },
  };
}

async function queryFinlife(input: SourceQuery): Promise<UnifiedSourcePage> {
  const sourceId: UnifiedSourceId = "finlife";
  const limit = normalizeLimit(input.limit);
  const decoded = input.cursor ? decodeUnifiedCursor(input.cursor) : null;
  if (input.cursor && !decoded) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  const snapshot = loadFinlifeSnapshot(input.kind);
  const onlyNewThreshold = input.onlyNew
    ? await resolveFinlifeOnlyNewThreshold(input.kind, snapshot?.meta?.generatedAt)
    : null;

  const changedSinceDate = input.changedSince ? new Date(input.changedSince) : null;
  const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
  const qNorm = normalizeSearchQuery(input.q ?? "");
  const qFilter = buildNormFilter(["productNameNorm", "providerNameNorm", "searchTextNorm"], qNorm, input.qMode);

  const rows = await prisma.product.findMany({
    where: {
      kind: input.kind,
      ...qFilter,
      ...(onlyNewThreshold ? { createdAt: { gte: onlyNewThreshold } } : {}),
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
      options: {
        select: {
          saveTrm: true,
          intrRate: true,
          intrRate2: true,
          raw: input.includeRecommendDetail === true,
        },
        orderBy: [
          { saveTrm: "asc" },
          { id: "asc" },
        ],
      },
      provider: {
        select: {
          name: true,
        },
      },
    },
    orderBy: input.sort === "recent" ? [{ updatedAt: "desc" }, { id: "desc" }] : [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(decoded ? { cursor: { id: decoded.id }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const picked = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: picked[picked.length - 1].id }) : null;

  const items: UnifiedProductView[] = picked.map((row) => {
    const raw = (row.raw as Record<string, unknown> | null) ?? null;
    const detailConfig = FINLIFE_FIELD_CONFIG[input.kind];
    const providerNameRaw = typeof raw?.kor_co_nm === "string" ? raw.kor_co_nm : "";
    const productNameRaw = typeof raw?.fin_prdt_nm === "string" ? raw.fin_prdt_nm : "";
    return {
      stableId: buildStableUnifiedId({
        sourceId,
        externalKey: row.finPrdtCd,
      }),
      sourceId,
      kind: input.kind,
      externalKey: row.finPrdtCd,
      providerName: providerNameRaw || row.provider?.name || "",
      productName: productNameRaw || row.name || "",
      firstSeenAt: input.includeTimestamps ? row.createdAt.toISOString() : undefined,
      lastSeenAt: input.includeTimestamps ? row.updatedAt.toISOString() : undefined,
      updatedAt: input.includeTimestamps ? row.updatedAt.toISOString() : undefined,
      options: buildFinlifeOptions(row.options),
      ...(input.includeRecommendDetail
        ? { recommendDetail: {
            finPrdtCd: row.finPrdtCd,
            finCoNo: typeof raw?.fin_co_no === "string" ? raw.fin_co_no : undefined,
            productRaw: pickAllowedDetailRaw(raw, detailConfig?.productFields, PRODUCT_DETAIL_NOTE_RAW_KEYS),
            options: row.options.map((option) => ({
              saveTrm: option.saveTrm ?? undefined,
              intrRate: normalizeRate(option.intrRate),
              intrRate2: normalizeRate(option.intrRate2),
              raw: pickAllowedDetailRaw(
                (option as typeof option & { raw?: unknown }).raw,
                detailConfig?.optionFields,
                PRODUCT_DETAIL_OPTION_IDENTITY_RAW_KEYS,
              ),
            })),
            sourceUpdatedAt: row.updatedAt.toISOString(),
          } }
        : {}),
      signals: {
        depositProtection: "unknown",
      },
    };
  });

  return pageResult({
    sourceId,
    items,
    count: items.length,
    hasMore,
    nextCursor,
    limit,
  });
}

async function queryDatagoKdb(input: SourceQuery): Promise<UnifiedSourcePage> {
  const sourceId = "datago_kdb" as const;
  const limit = normalizeLimit(input.limit);
  const onlyNewMap = await getOnlyNewSinceBySource(input.kind, [sourceId]);
  const onlyNewThreshold = input.onlyNew ? onlyNewMap.get(sourceId) : undefined;

  const changedSinceDate = input.changedSince ? new Date(input.changedSince) : null;
  const hasChangedSince = Boolean(changedSinceDate && Number.isFinite(changedSinceDate.getTime()));
  const qNorm = normalizeSearchQuery(input.q ?? "");
  const qFilter = buildNormFilter(["providerNameNorm", "productNameNorm"], qNorm, input.qMode);

  const decoded = input.cursor ? decodeUnifiedCursor(input.cursor) : null;
  if (input.cursor && !decoded) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  const rows = await prisma.externalProduct.findMany({
    where: {
      sourceId,
      kind: input.kind,
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
        select: {
          method: true,
          confidence: true,
          internalProductId: true,
          evidenceJson: true,
          internalProduct: {
            select: {
              finPrdtCd: true,
            },
          },
        },
      },
    },
    orderBy: input.sort === "recent"
      ? [{ lastSeenAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }]
      : [{ providerNameNorm: "asc" }, { productNameNorm: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(decoded ? { cursor: { id: decoded.id }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const picked = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: picked[picked.length - 1].id }) : null;

  const items: UnifiedProductView[] = picked.map((row) => ({
    stableId: buildStableUnifiedId({
      sourceId,
      externalKey: row.externalKey,
      canonicalFinPrdtCd: row.matches[0]?.internalProduct?.finPrdtCd ?? null,
    }),
    sourceId,
    kind: row.kind,
    externalKey: row.externalKey,
    providerName: row.providerNameRaw,
    productName: row.productNameRaw,
    summary: row.summary ?? undefined,
    firstSeenAt: input.includeTimestamps ? row.firstSeenAt.toISOString() : undefined,
    lastSeenAt: input.includeTimestamps ? row.lastSeenAt.toISOString() : undefined,
    updatedAt: input.includeTimestamps ? row.updatedAt.toISOString() : undefined,
    options: buildKdbOptions(row.rawJson),
    signals: {
      depositProtection: "matched",
    },
    match: row.matches[0]
      ? {
          method: row.matches[0].method,
          confidence: row.matches[0].confidence,
          internalProductId: row.matches[0].internalProductId,
          canonicalFinPrdtCd: row.matches[0].internalProduct?.finPrdtCd ?? undefined,
          evidence: (row.matches[0].evidenceJson as Record<string, unknown>) ?? undefined,
        }
      : undefined,
  }));

  return pageResult({
    sourceId,
    items,
    count: items.length,
    hasMore,
    nextCursor,
    limit,
  });
}

async function querySamplebank(input: SourceQuery): Promise<UnifiedSourcePage> {
  const sourceId = "samplebank" as const;
  const limit = normalizeLimit(input.limit);
  const decoded = input.cursor ? decodeUnifiedCursor(input.cursor) : null;
  if (input.cursor && !decoded) {
    throw new UnifiedInputError("잘못된 cursor 형식입니다.");
  }

  const loaded = await getSamplebankMergedItems({
    kind: input.kind,
    q: input.q,
    qMode: input.qMode,
    includeTimestamps: input.includeTimestamps,
    debug: input.debug,
  });
  const offset = decoded?.id ?? 0;
  const items = loaded.items.slice(offset, offset + limit);
  const hasMore = offset + limit < loaded.items.length;
  const nextCursor = hasMore ? encodeUnifiedCursor({ id: offset + limit }) : null;

  return pageResult({
    sourceId,
    items,
    count: loaded.count,
    hasMore,
    nextCursor,
    limit,
  });
}

export const finlifeUnifiedSourceLoader: UnifiedSourceLoader = {
  sourceId: "finlife",
  async refreshIfNeeded(input) {
    await refreshFinlifeSnapshotIfStale(input.kind, input.refresh);
  },
  query: queryFinlife,
};

export const datagoKdbUnifiedSourceLoader: UnifiedSourceLoader = {
  sourceId: "datago_kdb",
  async refreshIfNeeded(input) {
    await refreshSourceIfStale("datago_kdb", input.kind, input.refresh);
  },
  query: queryDatagoKdb,
};

export const samplebankUnifiedSourceLoader: UnifiedSourceLoader = {
  sourceId: "samplebank",
  async refreshIfNeeded() {
    return undefined;
  },
  query: querySamplebank,
};

export const DEFAULT_UNIFIED_SOURCE_LOADERS: UnifiedSourceLoaderMap = {
  finlife: finlifeUnifiedSourceLoader,
  datago_kdb: datagoKdbUnifiedSourceLoader,
  samplebank: samplebankUnifiedSourceLoader,
};

export function getUnifiedSourceLoader(
  loaders: UnifiedSourceLoaderMap,
  sourceId: UnifiedSourceId,
): UnifiedSourceLoader {
  const loader = loaders[sourceId];
  if (!loader) {
    throw new UnifiedInputError(`지원하지 않는 sourceId입니다: ${sourceId}`);
  }
  return loader;
}
