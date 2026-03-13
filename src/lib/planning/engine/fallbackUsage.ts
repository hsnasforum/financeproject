export type PlanningFallbackCounterKey =
  | "legacyEnvelopeFallbackCount"
  | "legacyReportContractFallbackCount"
  | "legacyRunEngineMigrationCount";

export type PlanningFallbackSourceKey =
  | "legacyEngineFallback"
  | "legacyResultDtoFallback"
  | "compatRebuild"
  | "legacySnapshot"
  | "contractBuildFailureFallback";

export type PlanningFallbackSourceBreakdown =
  Partial<Record<PlanningFallbackSourceKey, number>>;

export type PlanningFallbackRunKind =
  | "opsDoctor"
  | "user"
  | "unknown";

export type PlanningFallbackEvent = {
  at: string;
  key: PlanningFallbackCounterKey;
  source: string;
  sourceKey?: PlanningFallbackSourceKey;
  runKind?: PlanningFallbackRunKind;
  runId?: string;
};

export type PlanningFallbackUsageSnapshot = Record<PlanningFallbackCounterKey, number> & {
  lastEventAt?: string;
  sourceBreakdown?: Partial<Record<PlanningFallbackCounterKey, PlanningFallbackSourceBreakdown>>;
  recentEvents?: PlanningFallbackEvent[];
};

type PlanningFallbackStore = PlanningFallbackUsageSnapshot & {
  lastEventAt?: string;
  sourceBreakdown?: Partial<Record<PlanningFallbackCounterKey, PlanningFallbackSourceBreakdown>>;
  recentEvents?: PlanningFallbackEvent[];
};

const FALLBACK_STORE_KEY = "__PLANNING_ENGINE_FALLBACK_USAGE__";
const MAX_RECENT_FALLBACK_EVENTS = 20;
const FALLBACK_COUNTER_KEYS: PlanningFallbackCounterKey[] = [
  "legacyEnvelopeFallbackCount",
  "legacyReportContractFallbackCount",
  "legacyRunEngineMigrationCount",
];
const FALLBACK_SOURCE_KEYS: PlanningFallbackSourceKey[] = [
  "legacyEngineFallback",
  "legacyResultDtoFallback",
  "compatRebuild",
  "legacySnapshot",
  "contractBuildFailureFallback",
];

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
  const sourceBreakdown = asSourceBreakdown(row.sourceBreakdown);
  const recentEvents = asRecentEvents(row.recentEvents);
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
    ...(sourceBreakdown ? { sourceBreakdown } : {}),
    ...(recentEvents ? { recentEvents } : {}),
  };
}

function asSourceBreakdown(value: unknown): Partial<Record<PlanningFallbackCounterKey, PlanningFallbackSourceBreakdown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const next: Partial<Record<PlanningFallbackCounterKey, PlanningFallbackSourceBreakdown>> = {};

  for (const counterKey of FALLBACK_COUNTER_KEYS) {
    const rawBucket = row[counterKey];
    if (!rawBucket || typeof rawBucket !== "object" || Array.isArray(rawBucket)) continue;
    const bucket = rawBucket as Record<string, unknown>;
    const normalized: PlanningFallbackSourceBreakdown = {};
    for (const sourceKey of FALLBACK_SOURCE_KEYS) {
      const valueForKey = bucket[sourceKey];
      if (!Number.isFinite(Number(valueForKey))) continue;
      normalized[sourceKey] = Math.max(0, Math.trunc(Number(valueForKey)));
    }
    if (Object.keys(normalized).length > 0) {
      next[counterKey] = normalized;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function asRecentEvents(value: unknown): PlanningFallbackEvent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const at = typeof row.at === "string" ? row.at : "";
    const key = FALLBACK_COUNTER_KEYS.includes(row.key as PlanningFallbackCounterKey)
      ? row.key as PlanningFallbackCounterKey
      : null;
    const source = typeof row.source === "string" ? row.source : "";
    const sourceKey = FALLBACK_SOURCE_KEYS.includes(row.sourceKey as PlanningFallbackSourceKey)
      ? row.sourceKey as PlanningFallbackSourceKey
      : undefined;
    const runKind = row.runKind === "opsDoctor" || row.runKind === "user" || row.runKind === "unknown"
      ? row.runKind as PlanningFallbackRunKind
      : undefined;
    const runId = typeof row.runId === "string" ? row.runId : undefined;
    if (!at || !key || !source) return [];
    return [{
      at,
      key,
      source,
      ...(sourceKey ? { sourceKey } : {}),
      ...(runKind ? { runKind } : {}),
      ...(runId ? { runId } : {}),
    }];
  });
  return next.length > 0 ? next : undefined;
}

function snapshotFromStore(store: PlanningFallbackStore): PlanningFallbackUsageSnapshot {
  return {
    legacyEnvelopeFallbackCount: store.legacyEnvelopeFallbackCount,
    legacyReportContractFallbackCount: store.legacyReportContractFallbackCount,
    legacyRunEngineMigrationCount: store.legacyRunEngineMigrationCount,
    ...(store.lastEventAt ? { lastEventAt: store.lastEventAt } : {}),
    ...(store.sourceBreakdown ? { sourceBreakdown: store.sourceBreakdown } : {}),
    ...(store.recentEvents?.length ? { recentEvents: store.recentEvents } : {}),
  };
}

function inferSourceKey(
  key: PlanningFallbackCounterKey,
  source?: string,
): PlanningFallbackSourceKey | undefined {
  const normalizedSource = source?.trim().toLowerCase() ?? "";
  if (key === "legacyEnvelopeFallbackCount" || key === "legacyRunEngineMigrationCount") {
    return "legacyEngineFallback";
  }
  if (normalizedSource.includes("contractbuildfailure")) return "contractBuildFailureFallback";
  if (normalizedSource.includes("snapshot") || normalizedSource.includes("localstorage")) return "legacySnapshot";
  if (normalizedSource.includes("resultdto.rebuild") || normalizedSource.includes("compat")) return "compatRebuild";
  if (normalizedSource.includes("resultdtofallback") || normalizedSource.includes("resultdto")) {
    return "legacyResultDtoFallback";
  }
  if (normalizedSource.includes("simulate.engine") || normalizedSource.includes("simulate.legacy") || normalizedSource.includes("engine")) {
    return "legacyEngineFallback";
  }
  return undefined;
}

function inferRunKind(runId?: string): PlanningFallbackRunKind | undefined {
  const normalized = runId?.trim().toLowerCase() ?? "";
  if (!normalized) return undefined;
  if (normalized.startsWith("ops-doctor-")) return "opsDoctor";
  return "user";
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
  options?: { source?: string; sourceKey?: PlanningFallbackSourceKey; runId?: string },
): PlanningFallbackUsageSnapshot {
  const store = resolveStore();
  store[key] = (store[key] ?? 0) + 1;
  const eventAt = new Date().toISOString();
  store.lastEventAt = eventAt;
  const sourceKey = options?.sourceKey ?? inferSourceKey(key, options?.source);
  const source = options?.source?.trim() || "unknown";
  const runId = options?.runId?.trim();
  const runKind = inferRunKind(runId);
  if (sourceKey) {
    const bucket = store.sourceBreakdown?.[key] ?? {};
    bucket[sourceKey] = (bucket[sourceKey] ?? 0) + 1;
    store.sourceBreakdown = {
      ...(store.sourceBreakdown ?? {}),
      [key]: bucket,
    };
  }
  store.recentEvents = [
    {
      at: eventAt,
      key,
      source,
      ...(sourceKey ? { sourceKey } : {}),
      ...(runKind ? { runKind } : {}),
      ...(runId ? { runId } : {}),
    },
    ...(store.recentEvents ?? []),
  ].slice(0, MAX_RECENT_FALLBACK_EVENTS);

  if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
    const sourceKeyLabel = sourceKey ? ` source_key=${sourceKey}` : "";
    const runLabel = runId ? ` run=${runId.slice(0, 12)}` : "";
    // Keep server-side fallback events visible until fallback removal is complete.
    console.warn(`[planning][fallback] ${key}${sourceKeyLabel} source=${source}${runLabel}`);
  }

  return snapshotFromStore(store);
}

export function getPlanningFallbackUsageSnapshot(): PlanningFallbackUsageSnapshot {
  const store = resolveStore();
  return snapshotFromStore(store);
}

export function resetPlanningFallbackUsageSnapshot(): void {
  const owner = globalThis as typeof globalThis & {
    [FALLBACK_STORE_KEY]?: PlanningFallbackStore;
  };
  owner[FALLBACK_STORE_KEY] = {
    ...createEmptySnapshot(),
  };
}
