import { prisma } from "@/lib/db/prisma";
import { loadFinlifeSnapshot } from "@/lib/finlife/snapshot";
import { DATAGO_DEFAULT_TTL_MS, evaluateFreshness } from "@/lib/sources/snapshot";
import { type SourceStatusRow } from "@/lib/sources/types";

type LastRunMeta = {
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
};

function normalizeLastRun(meta: Record<string, unknown> | null): LastRunMeta | undefined {
  const fromMeta = meta?.lastRun;
  const value = (fromMeta && typeof fromMeta === "object")
    ? (fromMeta as Record<string, unknown>)
    : meta
      ? {
          fetchedItems: typeof meta.fetched === "number" ? meta.fetched : undefined,
          upsertedItems: typeof meta.upserted === "number" ? meta.upserted : undefined,
          totalCount: typeof meta.totalCount === "number" ? meta.totalCount : undefined,
          resultCode: typeof meta.resultCode === "string" ? meta.resultCode : undefined,
          resultMsg: typeof meta.resultMsg === "string" ? meta.resultMsg : undefined,
        }
      : null;
  if (!value) return undefined;

  return {
    startedAt: typeof value.startedAt === "string" ? value.startedAt : undefined,
    finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : undefined,
    fetchedItems: typeof value.fetchedItems === "number" ? value.fetchedItems : undefined,
    upsertedItems: typeof value.upsertedItems === "number" ? value.upsertedItems : undefined,
    touchedItems: typeof value.touchedItems === "number" ? value.touchedItems : undefined,
    createdItems: typeof value.createdItems === "number" ? value.createdItems : undefined,
    updatedItems: typeof value.updatedItems === "number" ? value.updatedItems : undefined,
    totalCount: typeof value.totalCount === "number" ? value.totalCount : undefined,
    resultCode: typeof value.resultCode === "string" ? value.resultCode : undefined,
    resultMsg: typeof value.resultMsg === "string" ? value.resultMsg : undefined,
  };
}

export async function getUnifiedSourceStatuses(): Promise<SourceStatusRow[]> {
  const nowMs = Date.now();
  const statuses: SourceStatusRow[] = [];

  for (const kind of ["deposit", "saving"] as const) {
    const snapshot = loadFinlifeSnapshot(kind);
    const ttlMs = snapshot?.meta?.ttlMs ?? Number(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS ?? "43200") * 1000;
    const fresh = evaluateFreshness(snapshot?.meta?.generatedAt ?? null, ttlMs, nowMs);
    statuses.push({
      sourceId: "finlife",
      kind,
      lastSyncedAt: fresh.lastSyncedAt,
      ttlMs,
      ageMs: fresh.ageMs,
      isFresh: fresh.isFresh,
      counts: snapshot?.items?.length ?? 0,
    });
  }

  for (const sourceId of ["datago_kdb"] as const) {
    const kind = "deposit" as const;
    const snapshot = await prisma.externalSourceSnapshot.findUnique({
      where: {
        sourceId_kind: {
          sourceId,
          kind,
        },
      },
    });
    const ttlMs = snapshot?.ttlMs ?? DATAGO_DEFAULT_TTL_MS;
    const fresh = evaluateFreshness(snapshot?.lastSyncedAt ?? null, ttlMs, nowMs);
    const count = await prisma.externalProduct.count({ where: { sourceId, kind } });
    const meta = (snapshot?.metaJson as Record<string, unknown> | null) ?? null;
    const lastAttemptAt = typeof meta?.lastAttemptAt === "string" ? meta.lastAttemptAt : null;
    const lastRun = normalizeLastRun(meta);
    const lastError = (meta?.lastError as Record<string, unknown> | undefined) ?? undefined;
    statuses.push({
      sourceId,
      kind,
      lastSyncedAt: fresh.lastSyncedAt,
      lastAttemptAt,
      ttlMs,
      ageMs: fresh.ageMs,
      isFresh: fresh.isFresh,
      counts: count,
      lastRun: lastRun
        ? {
            startedAt: lastRun.startedAt,
            finishedAt: lastRun.finishedAt,
            fetchedItems: lastRun.fetchedItems,
            upsertedItems: lastRun.upsertedItems,
            touchedItems: lastRun.touchedItems,
            createdItems: lastRun.createdItems,
            updatedItems: lastRun.updatedItems,
            totalCount: lastRun.totalCount,
            resultCode: lastRun.resultCode,
            resultMsg: lastRun.resultMsg,
          }
        : undefined,
      lastError: lastError
        ? {
            at: typeof lastError.at === "string" ? lastError.at : undefined,
            message: typeof lastError.message === "string" ? lastError.message : undefined,
          }
        : undefined,
    });
  }

  return statuses;
}
