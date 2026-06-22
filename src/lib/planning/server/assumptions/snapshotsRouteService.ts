import {
  findAssumptionsSnapshotId,
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../../assumptions/storage";

export type RouteAssumptionsSnapshotItem = {
  id: string;
  asOf?: string;
  fetchedAt?: string;
  staleDays?: number;
  warningsCount?: number;
  korea?: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    newDepositAvgPct?: number;
  };
};

export type RouteLatestAssumptionsSnapshotItem = RouteAssumptionsSnapshotItem & {
  warningsCount: number;
  sourcesCount: number;
};

export type RouteAssumptionsSnapshotsResult = {
  latest?: RouteLatestAssumptionsSnapshotItem;
  items: RouteAssumptionsSnapshotItem[];
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toUtcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function computeStaleDays(fetchedAt: string | undefined, now: Date): number | undefined {
  if (!fetchedAt) return undefined;
  const parsed = new Date(fetchedAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const diff = Math.floor((toUtcDayMs(now) - toUtcDayMs(parsed)) / 86_400_000);
  return Math.max(0, diff);
}

function buildKoreaSummary(value: {
  policyRatePct?: number;
  cpiYoYPct?: number;
  newDepositAvgPct?: number;
}): RouteAssumptionsSnapshotItem["korea"] | undefined {
  const korea = {
    ...(typeof value.policyRatePct === "number" ? { policyRatePct: value.policyRatePct } : {}),
    ...(typeof value.cpiYoYPct === "number" ? { cpiYoYPct: value.cpiYoYPct } : {}),
    ...(typeof value.newDepositAvgPct === "number" ? { newDepositAvgPct: value.newDepositAvgPct } : {}),
  };
  return Object.keys(korea).length > 0 ? korea : undefined;
}

export async function listRouteAssumptionsSnapshots(input: {
  limit: number;
  now?: Date;
}): Promise<RouteAssumptionsSnapshotsResult> {
  const now = input.now ?? new Date();
  const refs = await listAssumptionsHistory(input.limit);
  const items: RouteAssumptionsSnapshotItem[] = [];

  for (const ref of refs) {
    const snapshot = await loadAssumptionsSnapshotById(ref.id);
    if (!snapshot) continue;
    const staleDays = computeStaleDays(snapshot.fetchedAt, now);
    const korea = buildKoreaSummary(snapshot.korea);
    items.push({
      id: ref.id,
      ...(snapshot.asOf ? { asOf: snapshot.asOf } : {}),
      ...(snapshot.fetchedAt ? { fetchedAt: snapshot.fetchedAt } : {}),
      ...(typeof staleDays === "number" ? { staleDays } : {}),
      warningsCount: Array.isArray(snapshot.warnings) ? snapshot.warnings.length : 0,
      ...(korea ? { korea } : {}),
    });
  }

  items.sort((a, b) => {
    const aTs = Date.parse(asString(a.fetchedAt));
    const bTs = Date.parse(asString(b.fetchedAt));
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && bTs !== aTs) return bTs - aTs;
    return b.id.localeCompare(a.id);
  });

  const latestSnapshot = await loadLatestAssumptionsSnapshot();
  let latest: RouteLatestAssumptionsSnapshotItem | undefined;
  if (latestSnapshot) {
    const latestId = await findAssumptionsSnapshotId(latestSnapshot);
    const staleDays = computeStaleDays(latestSnapshot.fetchedAt, now);
    const korea = buildKoreaSummary(latestSnapshot.korea);
    latest = {
      id: latestId ?? "latest",
      ...(latestSnapshot.asOf ? { asOf: latestSnapshot.asOf } : {}),
      ...(latestSnapshot.fetchedAt ? { fetchedAt: latestSnapshot.fetchedAt } : {}),
      ...(typeof staleDays === "number" ? { staleDays } : {}),
      ...(korea ? { korea } : {}),
      warningsCount: Array.isArray(latestSnapshot.warnings) ? latestSnapshot.warnings.length : 0,
      sourcesCount: Array.isArray(latestSnapshot.sources) ? latestSnapshot.sources.length : 0,
    };
  }

  return {
    ...(latest ? { latest } : {}),
    items,
  };
}
