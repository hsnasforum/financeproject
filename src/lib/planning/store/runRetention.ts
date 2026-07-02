export type RunRetentionEntry = {
  id: string;
  profileId: string;
  createdAt: string;
};

function normalizeProfileId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sortByCreatedAtDesc<T extends RunRetentionEntry>(records: T[]): T[] {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.createdAt);
    const bTs = Date.parse(b.createdAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) {
      return bTs - aTs;
    }
    return b.id.localeCompare(a.id);
  });
}

export function selectRunRetentionTargets<T extends RunRetentionEntry>(
  entries: T[],
  options: {
    maxPerProfile: number;
    profileId?: string;
  },
): T[] {
  const profileId = normalizeProfileId(options.profileId);
  const scoped = profileId
    ? entries.filter((row) => row.profileId === profileId)
    : entries;
  const grouped = new Map<string, T[]>();
  for (const row of scoped) {
    const list = grouped.get(row.profileId) ?? [];
    list.push(row);
    grouped.set(row.profileId, list);
  }

  const targets: T[] = [];
  for (const runs of grouped.values()) {
    targets.push(...sortByCreatedAtDesc(runs).slice(options.maxPerProfile));
  }
  return targets;
}
