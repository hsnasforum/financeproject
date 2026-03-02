export type RunsRetentionRow = {
  id: string;
  profileId: string;
  createdAt: string;
};

export type RunsRetentionPlanReason = "KEEP_COUNT" | "KEEP_DAYS";

export type RunsRetentionPlanTarget = {
  id: string;
  profileId: string;
  createdAt: string;
  reasons: RunsRetentionPlanReason[];
};

export type RunsRetentionPlan = {
  total: number;
  kept: number;
  remove: RunsRetentionPlanTarget[];
};

export type RunsRetentionPlanOptions = {
  keepCount?: number;
  keepDays?: number;
  profileId?: string;
  nowIso?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toCreatedMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(nowMs: number, createdMs: number): number {
  return Math.floor(Math.max(0, nowMs - createdMs) / (24 * 60 * 60 * 1000));
}

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

export function planRunsRetention(
  rows: RunsRetentionRow[],
  options: RunsRetentionPlanOptions = {},
): RunsRetentionPlan {
  const nowIso = asString(options.nowIso);
  const nowMs = Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : Date.now();
  const keepCount = normalizePositiveInt(options.keepCount);
  const keepDays = normalizePositiveInt(options.keepDays);
  const profileIdFilter = asString(options.profileId);

  const filtered = rows
    .filter((row) => {
      if (!profileIdFilter) return true;
      return asString(row.profileId) === profileIdFilter;
    })
    .sort((a, b) => {
      const aMs = toCreatedMs(asString(a.createdAt));
      const bMs = toCreatedMs(asString(b.createdAt));
      if (bMs !== aMs) return bMs - aMs;
      return asString(b.id).localeCompare(asString(a.id));
    });

  const removeMap = new Map<string, RunsRetentionPlanTarget>();

  filtered.forEach((row, index) => {
    const reasons: RunsRetentionPlanReason[] = [];
    if (typeof keepCount === "number" && index >= keepCount) {
      reasons.push("KEEP_COUNT");
    }
    if (typeof keepDays === "number") {
      const ageDays = daysBetween(nowMs, toCreatedMs(asString(row.createdAt)));
      if (ageDays > keepDays) {
        reasons.push("KEEP_DAYS");
      }
    }

    if (reasons.length < 1) return;

    const key = asString(row.id);
    if (!key) return;
    const current = removeMap.get(key);
    if (current) {
      const merged = Array.from(new Set([...current.reasons, ...reasons]));
      removeMap.set(key, {
        ...current,
        reasons: merged,
      });
      return;
    }

    removeMap.set(key, {
      id: key,
      profileId: asString(row.profileId),
      createdAt: asString(row.createdAt),
      reasons,
    });
  });

  const remove = Array.from(removeMap.values()).sort((a, b) => {
    const aMs = toCreatedMs(a.createdAt);
    const bMs = toCreatedMs(b.createdAt);
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });

  return {
    total: filtered.length,
    kept: Math.max(0, filtered.length - remove.length),
    remove,
  };
}
