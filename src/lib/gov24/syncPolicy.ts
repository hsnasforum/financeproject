type Gov24SnapshotMetaLike = {
  generatedAt?: string;
  completionRate?: number;
} | null | undefined;

export function shouldRunGov24Sync(
  snapshotMeta: Gov24SnapshotMetaLike,
  nowMs: number,
  opts?: {
    ttlMs?: number;
    minCompletionRate?: number;
  },
): { shouldRun: boolean; reason: "missing_snapshot" | "stale_snapshot" | "low_completion_rate" | "fresh" } {
  const ttlMs = Math.max(60_000, opts?.ttlMs ?? 24 * 60 * 60 * 1000);
  const minCompletionRate = Math.max(0, Math.min(1, opts?.minCompletionRate ?? 0.95));

  if (!snapshotMeta) return { shouldRun: true, reason: "missing_snapshot" };
  const generatedAt = typeof snapshotMeta.generatedAt === "string" ? snapshotMeta.generatedAt : "";
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedMs) || nowMs - generatedMs > ttlMs) {
    return { shouldRun: true, reason: "stale_snapshot" };
  }

  const completionRate = typeof snapshotMeta.completionRate === "number" ? snapshotMeta.completionRate : 0;
  if (completionRate < minCompletionRate) {
    return { shouldRun: true, reason: "low_completion_rate" };
  }
  return { shouldRun: false, reason: "fresh" };
}

