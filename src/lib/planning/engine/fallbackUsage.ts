export type PlanningFallbackCounterKey =
  | "legacyEnvelopeFallbackCount"
  | "legacyReportContractFallbackCount"
  | "legacyRunEngineMigrationCount";

export type PlanningFallbackUsageSnapshot = Record<PlanningFallbackCounterKey, number> & {
  lastEventAt?: string;
};

type PlanningFallbackStore = PlanningFallbackUsageSnapshot & {
  lastEventAt?: string;
};

const FALLBACK_STORE_KEY = "__PLANNING_ENGINE_FALLBACK_USAGE__";

function createEmptySnapshot(): PlanningFallbackUsageSnapshot {
  return {
    legacyEnvelopeFallbackCount: 0,
    legacyReportContractFallbackCount: 0,
    legacyRunEngineMigrationCount: 0,
  };
}

function asStore(value: unknown): PlanningFallbackStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    legacyEnvelopeFallbackCount: Number.isFinite(Number(row.legacyEnvelopeFallbackCount))
      ? Math.max(0, Math.trunc(Number(row.legacyEnvelopeFallbackCount)))
      : 0,
    legacyReportContractFallbackCount: Number.isFinite(Number(row.legacyReportContractFallbackCount))
      ? Math.max(0, Math.trunc(Number(row.legacyReportContractFallbackCount)))
      : 0,
    legacyRunEngineMigrationCount: Number.isFinite(Number(row.legacyRunEngineMigrationCount))
      ? Math.max(0, Math.trunc(Number(row.legacyRunEngineMigrationCount)))
      : 0,
    ...(typeof row.lastEventAt === "string" ? { lastEventAt: row.lastEventAt } : {}),
  };
}

function resolveStore(): PlanningFallbackStore {
  const owner = globalThis as typeof globalThis & {
    [FALLBACK_STORE_KEY]?: PlanningFallbackStore;
  };
  const current = asStore(owner[FALLBACK_STORE_KEY]);
  if (current) {
    owner[FALLBACK_STORE_KEY] = current;
    return current;
  }
  const initial: PlanningFallbackStore = {
    ...createEmptySnapshot(),
  };
  owner[FALLBACK_STORE_KEY] = initial;
  return initial;
}

export function recordPlanningFallbackUsage(
  key: PlanningFallbackCounterKey,
  options?: { source?: string; runId?: string },
): PlanningFallbackUsageSnapshot {
  const store = resolveStore();
  store[key] = (store[key] ?? 0) + 1;
  store.lastEventAt = new Date().toISOString();

  if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
    const source = options?.source?.trim() || "unknown";
    const runId = options?.runId?.trim();
    const runLabel = runId ? ` run=${runId.slice(0, 12)}` : "";
    // Keep server-side fallback events visible until fallback removal is complete.
    console.warn(`[planning][fallback] ${key} source=${source}${runLabel}`);
  }

  return {
    legacyEnvelopeFallbackCount: store.legacyEnvelopeFallbackCount,
    legacyReportContractFallbackCount: store.legacyReportContractFallbackCount,
    legacyRunEngineMigrationCount: store.legacyRunEngineMigrationCount,
    ...(store.lastEventAt ? { lastEventAt: store.lastEventAt } : {}),
  };
}

export function getPlanningFallbackUsageSnapshot(): PlanningFallbackUsageSnapshot {
  const store = resolveStore();
  return {
    legacyEnvelopeFallbackCount: store.legacyEnvelopeFallbackCount,
    legacyReportContractFallbackCount: store.legacyReportContractFallbackCount,
    legacyRunEngineMigrationCount: store.legacyRunEngineMigrationCount,
    ...(store.lastEventAt ? { lastEventAt: store.lastEventAt } : {}),
  };
}

export function resetPlanningFallbackUsageSnapshot(): void {
  const owner = globalThis as typeof globalThis & {
    [FALLBACK_STORE_KEY]?: PlanningFallbackStore;
  };
  owner[FALLBACK_STORE_KEY] = {
    ...createEmptySnapshot(),
  };
}
