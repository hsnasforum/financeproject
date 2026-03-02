export type PlanningCacheKind = "simulate" | "scenarios" | "monteCarlo" | "actions";

export type PlanningCacheEntry<T> = {
  version: 1;
  kind: PlanningCacheKind;
  key: string;
  createdAt: string;
  expiresAt: string;
  meta: {
    profileId?: string;
    snapshot?: { asOf?: string; fetchedAt?: string; missing?: boolean };
    horizonMonths: number;
    assumptionsHash: string;
    optionsHash: string;
  };
  data: T;
};

export type PlanningCacheUsageStats = {
  version: 1;
  updatedAt: string;
  totals: {
    hits: number;
    misses: number;
  };
  byKind: Record<PlanningCacheKind, { hits: number; misses: number }>;
};
