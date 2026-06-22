import { getCache, recordCacheUsage, setCache } from "./storage";
import { type PlanningCacheKind } from "./types";

export type PlanningRouteCachePayload<TData extends Record<string, unknown> = Record<string, unknown>> = {
  meta: {
    generatedAt: string;
    snapshot: Record<string, unknown>;
    health: Record<string, unknown>;
  };
  data: TData;
};

export type PlanningRouteCacheKeyBundle = {
  key: string;
  assumptionsHash: string;
  optionsHash: string;
};

export type PlanningRouteCacheSnapshotMeta = {
  asOf?: string;
  fetchedAt?: string;
  missing?: boolean;
};

async function recordRouteCacheUsage(kind: PlanningCacheKind, hit: boolean): Promise<void> {
  await recordCacheUsage(kind, hit).catch(() => undefined);
}

export async function readPlanningRouteCache<TData extends Record<string, unknown>>(
  kind: PlanningCacheKind,
  key: string,
): Promise<PlanningRouteCachePayload<TData> | null> {
  const cached = await getCache<PlanningRouteCachePayload<TData>>(kind, key);
  if (cached) {
    await recordRouteCacheUsage(kind, true);
    return cached.data;
  }

  await recordRouteCacheUsage(kind, false);
  return null;
}

export async function writePlanningRouteCache<TData extends Record<string, unknown>>(input: {
  kind: PlanningCacheKind;
  keyBundle: PlanningRouteCacheKeyBundle;
  horizonMonths: number;
  ttlMs: number;
  snapshotMeta: PlanningRouteCacheSnapshotMeta;
  payload: PlanningRouteCachePayload<TData>;
}): Promise<void> {
  await setCache<PlanningRouteCachePayload<TData>>({
    version: 1,
    kind: input.kind,
    key: input.keyBundle.key,
    createdAt: input.payload.meta.generatedAt,
    expiresAt: new Date(Date.now() + input.ttlMs).toISOString(),
    meta: {
      horizonMonths: input.horizonMonths,
      assumptionsHash: input.keyBundle.assumptionsHash,
      optionsHash: input.keyBundle.optionsHash,
      snapshot: {
        asOf: input.snapshotMeta.asOf,
        fetchedAt: input.snapshotMeta.fetchedAt,
        missing: input.snapshotMeta.missing,
      },
    },
    data: input.payload,
  }).catch(() => undefined);
}
