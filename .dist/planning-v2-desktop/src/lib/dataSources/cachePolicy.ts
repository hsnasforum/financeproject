export type CachePolicySourceId = "finlife" | "gov24" | "benefits" | "exchange" | "datago_kdb";

export type CachePolicy = {
  ttlMs: number;
  swrMs: number;
  maxAgeDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const CACHE_POLICY: Record<CachePolicySourceId, CachePolicy> = {
  finlife: {
    ttlMs: 60 * 1000,
    swrMs: 5 * 60 * 1000,
    maxAgeDays: 1,
  },
  gov24: {
    ttlMs: DAY_MS,
    swrMs: 6 * 60 * 60 * 1000,
    maxAgeDays: 1,
  },
  benefits: {
    ttlMs: 2 * DAY_MS,
    swrMs: 12 * 60 * 60 * 1000,
    maxAgeDays: 2,
  },
  exchange: {
    ttlMs: 6 * 60 * 60 * 1000,
    swrMs: 60 * 60 * 1000,
    maxAgeDays: 1,
  },
  datago_kdb: {
    ttlMs: 12 * 60 * 60 * 1000,
    swrMs: 3 * 60 * 60 * 1000,
    maxAgeDays: 1,
  },
};

export function getCachePolicy(sourceId: CachePolicySourceId): CachePolicy {
  return CACHE_POLICY[sourceId];
}

export function getMaxAgeMs(sourceId: CachePolicySourceId): number {
  return getCachePolicy(sourceId).maxAgeDays * DAY_MS;
}
