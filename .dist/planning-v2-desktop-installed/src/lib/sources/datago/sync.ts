import { prisma } from "../../db/prisma";
import { type Prisma } from "@prisma/client";
import { fetchKdbProducts } from "./kdb";
import { updateExternalProductMatch } from "../matching";
import { DATAGO_DEFAULT_TTL_MS, evaluateFreshness, getExternalSnapshot, upsertExternalSnapshot } from "../snapshot";
import { type ExternalSourceId, type SyncSourceOption, type UnifiedKind } from "../types";

export type DatagoSyncInput = {
  source?: SyncSourceOption;
  kind?: UnifiedKind | "all";
  fromYmd?: string;
  toYmd?: string;
  ttlMs?: number;
};

export type DatagoSyncStats = {
  sourceId: ExternalSourceId;
  kind: UnifiedKind;
  fetched: number;
  upserted: number;
  touched: number;
  created: number;
  updated: number;
  matchedHighConfidence: number;
  pageCount: number;
  totalCount?: number;
  resultCode?: string;
  resultMsg?: string;
  startedAt: string;
  finishedAt: string;
};

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildKdbDateRange(fromYmd?: string, toYmd?: string): { fromYmd: string; toYmd: string } {
  const to = toYmd ?? formatYmd(new Date());
  if (fromYmd) return { fromYmd, toYmd: to };

  const date = new Date();
  date.setDate(date.getDate() - 30);
  return {
    fromYmd: formatYmd(date),
    toYmd: to,
  };
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeFallback(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function prepareExternalRows(rows: Awaited<ReturnType<typeof fetchKdbProducts>>["items"]): {
  rows: Awaited<ReturnType<typeof fetchKdbProducts>>["items"];
  skippedInvalid: number;
  skippedDuplicate: number;
} {
  const seen = new Set<string>();
  const normalized: Awaited<ReturnType<typeof fetchKdbProducts>>["items"] = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  for (const row of rows) {
    const externalKey = String(row.externalKey ?? "").trim();
    const providerNameRaw = String(row.providerNameRaw ?? "").trim();
    const productNameRaw = String(row.productNameRaw ?? "").trim();
    const providerNameNorm = String(row.providerNameNorm ?? "").trim() || normalizeFallback(providerNameRaw);
    const productNameNorm = String(row.productNameNorm ?? "").trim() || normalizeFallback(productNameRaw);
    const rawJson = (row.rawJson && typeof row.rawJson === "object")
      ? row.rawJson
      : {};

    if (!externalKey || !providerNameRaw || !productNameRaw) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(externalKey)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(externalKey);

    normalized.push({
      ...row,
      externalKey,
      providerNameRaw,
      providerNameNorm,
      productNameRaw,
      productNameNorm,
      rawJson,
      summary: typeof row.summary === "string" ? row.summary : undefined,
    });
  }

  return { rows: normalized, skippedInvalid, skippedDuplicate };
}

async function recordSourceFailure(sourceId: ExternalSourceId, kind: UnifiedKind, ttlMs: number, message: string, hint?: Record<string, unknown>): Promise<void> {
  const safeMessage = String(message).slice(0, 240);
  const existing = await prisma.externalSourceSnapshot.findUnique({
    where: {
      sourceId_kind: { sourceId, kind },
    },
  });
  const nowIso = new Date().toISOString();
  const existingMeta = ((existing?.metaJson as Record<string, unknown> | null) ?? {});
  const existingLastRun = (existingMeta.lastRun as Record<string, unknown> | undefined) ?? {};
  const mergedMeta = {
    ...existingMeta,
    lastAttemptAt: nowIso,
    lastRun: {
      fetchedItems: 0,
      upsertedItems: 0,
      ...existingLastRun,
    },
    lastError: {
      at: nowIso,
      message: safeMessage,
    },
    ...(hint ?? {}),
  };

  await prisma.externalSourceSnapshot.upsert({
    where: {
      sourceId_kind: { sourceId, kind },
    },
    update: {
      ttlMs,
      metaJson: toInputJson(mergedMeta),
    },
    create: {
      sourceId,
      kind,
      lastSyncedAt: new Date(0),
      ttlMs,
      metaJson: toInputJson(mergedMeta),
    },
  });
}

async function upsertExternalProducts(input: {
  sourceId: ExternalSourceId;
  kind: UnifiedKind;
  ttlMs: number;
  rows: Awaited<ReturnType<typeof fetchKdbProducts>>["items"];
  pageCount: number;
  totalCount?: number;
  resultCode?: string;
  resultMsg?: string;
}): Promise<DatagoSyncStats> {
  const { sourceId, kind, ttlMs, rows, pageCount, totalCount, resultCode, resultMsg } = input;
  const runStartedAt = new Date();
  const runStartedIso = runStartedAt.toISOString();
  const prepared = prepareExternalRows(rows);
  const preparedRows = prepared.rows;
  let upserted = 0;
  let created = 0;
  let updated = 0;
  let matchedHighConfidence = 0;
  const rowErrors: string[] = [];

  const uniqueKeys = preparedRows.map((row) => row.externalKey);
  const existingSet = new Set<string>();
  for (let idx = 0; idx < uniqueKeys.length; idx += 500) {
    const chunk = uniqueKeys.slice(idx, idx + 500);
    if (chunk.length === 0) continue;
    const existingRows = await prisma.externalProduct.findMany({
      where: { sourceId, kind, externalKey: { in: chunk } },
      select: { externalKey: true },
    });
    for (const existing of existingRows) existingSet.add(existing.externalKey);
  }

  for (const row of preparedRows) {
    const existing = existingSet.has(row.externalKey);
    try {
      let productId = 0;
      if (existing) {
        const found = await prisma.externalProduct.findFirst({
          where: {
            sourceId,
            kind,
            externalKey: row.externalKey,
          },
          select: { id: true },
        });
        if (found) {
          await prisma.externalProduct.update({
            where: { id: found.id },
            data: {
              providerNameRaw: row.providerNameRaw,
              providerNameNorm: row.providerNameNorm,
              productNameRaw: row.productNameRaw,
              productNameNorm: row.productNameNorm,
              summary: row.summary,
              rawJson: toInputJson(row.rawJson),
              lastSeenAt: runStartedAt,
            },
            select: { id: true },
          });
          productId = found.id;
        }
      }
      if (!productId) {
        const createdProduct = await prisma.externalProduct.create({
          data: {
            sourceId,
            kind,
            externalKey: row.externalKey,
            providerNameRaw: row.providerNameRaw,
            providerNameNorm: row.providerNameNorm,
            productNameRaw: row.productNameRaw,
            productNameNorm: row.productNameNorm,
            summary: row.summary,
            rawJson: toInputJson(row.rawJson),
            firstSeenAt: runStartedAt,
            lastSeenAt: runStartedAt,
          },
          select: { id: true },
        });
        productId = createdProduct.id;
      }

      upserted += 1;
      if (existing) updated += 1;
      else created += 1;

      await updateExternalProductMatch(productId);
      const best = await prisma.externalProductMatch.findFirst({
        where: { externalProductId: productId },
        orderBy: { confidence: "desc" },
        select: { confidence: true, internalProductId: true },
      });
      if (best?.confidence && best.confidence >= 0.92 && best.internalProductId) {
        matchedHighConfidence += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (rowErrors.length < 5) {
        rowErrors.push(`key=${row.externalKey} :: ${message}`);
      }
      console.error("[datago/sync] externalProduct save failed", {
        sourceId,
        kind,
        externalKey: row.externalKey,
        message,
      });
    }
  }

  if (upserted === 0 && preparedRows.length > 0 && rowErrors.length > 0) {
    throw new Error(`[datago/sync] all rows failed to persist: ${rowErrors[0]}`);
  }

  const runFinishedIso = new Date().toISOString();

  await upsertExternalSnapshot({
    sourceId,
    kind,
    ttlMs,
    metaJson: {
      lastAttemptAt: runFinishedIso,
      lastRun: {
        startedAt: runStartedIso,
        finishedAt: runFinishedIso,
        fetchedItems: rows.length,
        upsertedItems: upserted,
        touchedItems: upserted,
        createdItems: created,
        updatedItems: updated,
        totalCount,
        resultCode,
        resultMsg,
        skippedInvalidItems: prepared.skippedInvalid,
        skippedDuplicateItems: prepared.skippedDuplicate,
      },
      lastError: null,
      ...(rowErrors.length > 0 ? { rowErrors } : {}),
    },
  });

  return {
    sourceId,
    kind,
    fetched: rows.length,
    upserted,
    touched: upserted,
    created,
    updated,
    matchedHighConfidence,
    pageCount,
    totalCount,
    resultCode,
    resultMsg,
    startedAt: runStartedIso,
    finishedAt: runFinishedIso,
  };
}

export async function syncDatagoSources(input: DatagoSyncInput = {}): Promise<DatagoSyncStats[]> {
  void input.source;
  const kind = input.kind ?? "deposit";
  if (kind !== "deposit" && kind !== "all") {
    return [];
  }

  const ttlMs = Math.max(60_000, input.ttlMs ?? DATAGO_DEFAULT_TTL_MS);
  const targets: ExternalSourceId[] = ["datago_kdb"];

  const stats: DatagoSyncStats[] = [];
  for (const sourceId of targets) {
    try {
      const range = buildKdbDateRange(input.fromYmd, input.toYmd);
      const kdb = await fetchKdbProducts({ fromYmd: range.fromYmd, toYmd: range.toYmd });
      stats.push(await upsertExternalProducts({
        sourceId: "datago_kdb",
        kind: "deposit",
        ttlMs,
        rows: kdb.items,
        pageCount: kdb.pageCount,
      }));
    } catch (error) {
      await recordSourceFailure(sourceId, "deposit", ttlMs, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  return stats;
}

export async function refreshSourceIfStale(sourceId: ExternalSourceId, kind: UnifiedKind, refresh: boolean): Promise<void> {
  if (!refresh) return;
  const snapshot = await getExternalSnapshot(sourceId, kind);
  const ttlMs = snapshot?.ttlMs ?? DATAGO_DEFAULT_TTL_MS;
  const freshness = evaluateFreshness(snapshot?.lastSyncedAt ?? null, ttlMs);
  if (freshness.isFresh) return;

  await syncDatagoSources({
    source: "kdb",
    kind,
    ttlMs,
  });
}
