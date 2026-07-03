import { type RunIndexEntry } from "./runIndex";
import { selectRunRetentionTargets } from "./runRetention";

export type RunRetentionPurgeOptions = {
  profileId?: string;
  maxPerProfile?: number;
};

export type RunRetentionStoreDependencies = {
  defaultMaxPerProfile: number;
  deleteRun: (id: string) => Promise<boolean>;
  listIndexEntries: () => Promise<RunIndexEntry[]>;
};

export type RunRetentionStore = ReturnType<typeof createRunRetentionStore>;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeLimit(value: unknown, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

export function createRunRetentionStore(dependencies: RunRetentionStoreDependencies) {
  async function purgeRunsByRetention(options?: RunRetentionPurgeOptions): Promise<string[]> {
    const maxPerProfile = toSafeLimit(options?.maxPerProfile, dependencies.defaultMaxPerProfile);
    const profileId = asString(options?.profileId);
    const purgeTargets = selectRunRetentionTargets(await dependencies.listIndexEntries(), {
      maxPerProfile,
      ...(profileId ? { profileId } : {}),
    });

    const removedIds: string[] = [];
    for (const row of purgeTargets) {
      const removed = await dependencies.deleteRun(row.id);
      if (removed) removedIds.push(row.id);
    }
    return removedIds;
  }

  return {
    purgeRunsByRetention,
  };
}
