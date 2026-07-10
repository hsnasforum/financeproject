import { prisma } from "@/lib/db/prisma";
import { loadFinlifeSnapshot, loadFinlifeSyncAttempt } from "@/lib/finlife/snapshot";
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

type FinlifeEvidenceState = "db-complete" | "complete";

type FinlifeEvidenceLookup =
  | { status: "missing" }
  | {
      status: "found";
      state: FinlifeEvidenceState;
      lastSyncedAt: Date | null;
      ttlMs: number;
      meta: Record<string, unknown>;
    }
  | { status: "error"; error: unknown };

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

function canTreatFinlifeEvidenceAsFresh(state: FinlifeEvidenceState, meta: Record<string, unknown>): boolean {
  if (state !== "complete") return false;
  if (meta.source !== "finlife" || meta.fallbackUsed !== false) return false;
  if (meta.truncatedByHardCap !== false) return false;
  return typeof meta.completionRate === "number" && meta.completionRate >= 0.95;
}

function canTreatFinlifeSnapshotAsFresh(meta: Record<string, unknown> | null): boolean {
  if (!meta) return false;
  if (meta.source !== "finlife" || meta.fallbackUsed === true) return false;
  if (meta.truncatedByHardCap === true) return false;
  return typeof meta.completionRate === "number" && meta.completionRate >= 0.95;
}

function isMissingFinlifeEvidenceStorage(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /does not exist|no such table|relation .+ does not exist|P2021|not initialized/i.test(raw);
}

async function getFinlifeCompletionEvidence(kind: "deposit" | "saving"): Promise<FinlifeEvidenceLookup> {
  try {
    const row = await prisma.externalSourceSnapshot.findUnique({
      where: {
        sourceId_kind: {
          sourceId: "finlife",
          kind,
        },
      },
    });
    if (!row) return { status: "missing" };

    const meta = (row.metaJson as Record<string, unknown> | null) ?? null;
    const state = meta?.completionState;
    if (meta?.evidenceType !== "finlife-prisma-product-sync"
      || (state !== "db-complete" && state !== "complete")) {
      return { status: "missing" };
    }

    const rawLastSyncedAt = row.lastSyncedAt instanceof Date
      ? row.lastSyncedAt
      : new Date(row.lastSyncedAt);
    const lastSyncedAt = Number.isFinite(rawLastSyncedAt.getTime()) && rawLastSyncedAt.getTime() > 0
      ? rawLastSyncedAt
      : null;
    return {
      status: "found",
      state,
      lastSyncedAt,
      ttlMs: row.ttlMs,
      meta,
    };
  } catch (error) {
    if (isMissingFinlifeEvidenceStorage(error)) return { status: "missing" };
    console.error("[sources/status] finlife completion evidence unavailable", {
      kind,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error", error };
  }
}

function resolveDataSourceStatusErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/does not exist|Cannot open database|SQLITE|database|not initialized|schema/i.test(raw)) {
    return "공공데이터 저장소가 아직 준비되지 않았습니다. 데이터 소스 설정에서 동기화를 다시 실행해주세요.";
  }
  return "공공데이터 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function buildUnavailableSourceStatus(input: {
  sourceId: "datago_kdb";
  kind: "deposit";
  ttlMs: number;
  error: unknown;
  checkedAt: string;
}): SourceStatusRow {
  return {
    sourceId: input.sourceId,
    kind: input.kind,
    lastSyncedAt: null,
    lastAttemptAt: input.checkedAt,
    ttlMs: input.ttlMs,
    ageMs: null,
    isFresh: false,
    counts: 0,
    lastError: {
      at: input.checkedAt,
      message: resolveDataSourceStatusErrorMessage(input.error),
    },
  };
}

async function hasDatagoStatusTables(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('ExternalSourceSnapshot', 'ExternalProduct')
  `;
  const names = new Set(rows.map((row) => row.name));
  return names.has("ExternalSourceSnapshot") && names.has("ExternalProduct");
}

export async function getUnifiedSourceStatuses(): Promise<SourceStatusRow[]> {
  const nowMs = Date.now();
  const checkedAt = new Date(nowMs).toISOString();
  const statuses: SourceStatusRow[] = [];

  for (const kind of ["deposit", "saving"] as const) {
    const snapshot = loadFinlifeSnapshot(kind);
    const incompleteAttempt = loadFinlifeSyncAttempt(kind);
    const evidence = await getFinlifeCompletionEvidence(kind);
    const foundEvidence = evidence.status === "found" ? evidence : null;
    const ttlMs = foundEvidence?.ttlMs
      ?? snapshot?.meta?.ttlMs
      ?? Number(process.env.FINLIFE_SNAPSHOT_TTL_SECONDS ?? "43200") * 1000;
    const fresh = evaluateFreshness(
      foundEvidence ? foundEvidence.lastSyncedAt : (snapshot?.meta?.generatedAt ?? null),
      ttlMs,
      nowMs,
    );
    const evidenceCanBeFresh = foundEvidence
      ? canTreatFinlifeEvidenceAsFresh(foundEvidence.state, foundEvidence.meta)
      : evidence.status === "missing"
        && canTreatFinlifeSnapshotAsFresh((snapshot?.meta as unknown as Record<string, unknown> | null) ?? null);
    const evidenceLastAttemptAt = foundEvidence && typeof foundEvidence.meta.lastAttemptAt === "string"
      ? foundEvidence.meta.lastAttemptAt
      : null;
    const lastRun = foundEvidence ? normalizeLastRun(foundEvidence.meta) : undefined;
    statuses.push({
      sourceId: "finlife",
      kind,
      lastSyncedAt: fresh.lastSyncedAt,
      lastAttemptAt: incompleteAttempt?.updatedAt
        ?? evidenceLastAttemptAt
        ?? undefined,
      ttlMs,
      ageMs: fresh.ageMs,
      isFresh: incompleteAttempt ? false : evidenceCanBeFresh && fresh.isFresh,
      counts: snapshot?.items?.length ?? 0,
      lastRun,
      lastError: incompleteAttempt
        ? {
            at: incompleteAttempt.updatedAt,
            message: incompleteAttempt.status === "failed"
              ? "FINLIFE 동기화가 완료되지 않았습니다. 표시 데이터와 상태 시점이 다를 수 있으니 동기화를 다시 실행해주세요."
              : "FINLIFE 동기화가 진행 중이거나 완료되지 않았습니다. 잠시 후 상태를 다시 확인해주세요.",
          }
        : evidence.status === "error"
          ? {
              at: checkedAt,
              message: "FINLIFE 상품 저장소 상태를 확인하지 못했습니다. 잠시 후 다시 확인해주세요.",
            }
          : undefined,
    });
  }

  for (const sourceId of ["datago_kdb"] as const) {
    const kind = "deposit" as const;
    try {
      if (!await hasDatagoStatusTables()) {
        statuses.push(buildUnavailableSourceStatus({
          sourceId,
          kind,
          ttlMs: DATAGO_DEFAULT_TTL_MS,
          error: new Error("DATAGO storage schema is not initialized."),
          checkedAt,
        }));
        continue;
      }

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
    } catch (error) {
      statuses.push(buildUnavailableSourceStatus({
        sourceId,
        kind,
        ttlMs: DATAGO_DEFAULT_TTL_MS,
        error,
        checkedAt,
      }));
    }
  }

  return statuses;
}
