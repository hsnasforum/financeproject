import { type SourceFreshness } from "./types";

export function evaluateFreshness(lastSyncedAt: Date | string | null, ttlMs: number, nowMs = Date.now()): SourceFreshness {
  if (!lastSyncedAt) {
    return { lastSyncedAt: null, ttlMs, ageMs: null, isFresh: false };
  }

  const syncedAt = typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
  const syncedMs = syncedAt.getTime();
  if (!Number.isFinite(syncedMs)) {
    return { lastSyncedAt: null, ttlMs, ageMs: null, isFresh: false };
  }

  const ageMs = Math.max(0, nowMs - syncedMs);
  return {
    lastSyncedAt: syncedAt.toISOString(),
    ttlMs,
    ageMs,
    isFresh: ageMs <= Math.max(60_000, ttlMs),
  };
}
