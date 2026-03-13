export type ShouldSyncSnapshotArgs = {
  snapshot: { fetchedAt?: string } | null | undefined;
  nowIso?: string;
  staleThresholdDays?: number;
};

export type ShouldSyncSnapshotResult = {
  attempt: boolean;
  reason: string;
  staleDays?: number;
};

function toFiniteTime(value: string | undefined): number | undefined {
  const ms = Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : undefined;
}

function toSafeThreshold(days: number | undefined): number {
  const parsed = Math.trunc(Number(days));
  if (!Number.isFinite(parsed)) return 45;
  return Math.max(1, Math.min(3650, parsed));
}

export function shouldSyncSnapshot(args: ShouldSyncSnapshotArgs): ShouldSyncSnapshotResult {
  const threshold = toSafeThreshold(args.staleThresholdDays);
  const nowMs = toFiniteTime(args.nowIso) ?? Date.now();
  const fetchedAt = typeof args.snapshot?.fetchedAt === "string" ? args.snapshot.fetchedAt.trim() : "";
  if (!fetchedAt) {
    return {
      attempt: true,
      reason: "SNAPSHOT_MISSING",
    };
  }

  const fetchedMs = toFiniteTime(fetchedAt);
  if (fetchedMs === undefined) {
    return {
      attempt: true,
      reason: "FETCHED_AT_INVALID",
    };
  }

  const staleDays = Math.trunc(Math.max(0, nowMs - fetchedMs) / (24 * 60 * 60 * 1000));
  if (staleDays > threshold) {
    return {
      attempt: true,
      reason: `STALE_DAYS_${staleDays}`,
      staleDays,
    };
  }

  return {
    attempt: false,
    reason: `FRESH_DAYS_${staleDays}`,
    staleDays,
  };
}
