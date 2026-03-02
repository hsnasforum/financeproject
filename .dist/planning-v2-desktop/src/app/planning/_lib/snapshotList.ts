import fs from "node:fs/promises";
import path from "node:path";
import {
  findAssumptionsSnapshotId,
  listAssumptionsHistory,
  loadAssumptionsSnapshotById,
  loadLatestAssumptionsSnapshot,
} from "../../../lib/planning/assumptions/storage";
import { type AssumptionsSnapshot } from "../../../lib/planning/assumptions/types";

export type SnapshotListItem = {
  id: string;
  asOf?: string;
  fetchedAt?: string;
  staleDays?: number;
  korea?: {
    policyRatePct?: number;
    cpiYoYPct?: number;
    newDepositAvgPct?: number;
  };
  warningsCount?: number;
};

type LoadOptions = {
  baseDir?: string;
  now?: Date;
};

function toUtcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function computeStaleDaysFromFetchedAt(fetchedAt: string | undefined, now: Date): number | undefined {
  if (!fetchedAt) return undefined;
  const fetchedDate = new Date(fetchedAt);
  if (Number.isNaN(fetchedDate.getTime())) return undefined;
  const diff = Math.floor((toUtcDayMs(now) - toUtcDayMs(fetchedDate)) / 86_400_000);
  return Math.max(0, diff);
}

function toSnapshotListItem(id: string, snapshot: AssumptionsSnapshot, now: Date): SnapshotListItem {
  const staleDays = computeStaleDaysFromFetchedAt(snapshot.fetchedAt, now);
  return {
    id,
    ...(snapshot.asOf ? { asOf: snapshot.asOf } : {}),
    ...(snapshot.fetchedAt ? { fetchedAt: snapshot.fetchedAt } : {}),
    ...(typeof staleDays === "number" ? { staleDays } : {}),
    korea: {
      ...(typeof snapshot.korea.policyRatePct === "number" ? { policyRatePct: snapshot.korea.policyRatePct } : {}),
      ...(typeof snapshot.korea.cpiYoYPct === "number" ? { cpiYoYPct: snapshot.korea.cpiYoYPct } : {}),
      ...(typeof snapshot.korea.newDepositAvgPct === "number" ? { newDepositAvgPct: snapshot.korea.newDepositAvgPct } : {}),
    },
    warningsCount: snapshot.warnings.length,
  };
}

async function loadSnapshotFile(filePath: string): Promise<AssumptionsSnapshot | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as AssumptionsSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function loadFromBaseDir(limit: number, baseDir: string, now: Date): Promise<{
  latest?: SnapshotListItem;
  history: SnapshotListItem[];
}> {
  const latestPath = path.join(baseDir, ".data", "planning", "assumptions.latest.json");
  const historyDir = path.join(baseDir, ".data", "planning", "assumptions", "history");
  const latestSnapshot = await loadSnapshotFile(latestPath);

  let historyIds: string[] = [];
  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });
    historyIds = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.slice(0, -5));
  } catch {
    historyIds = [];
  }

  const historyItems: SnapshotListItem[] = [];
  for (const id of historyIds) {
    const snapshot = await loadSnapshotFile(path.join(historyDir, `${id}.json`));
    if (!snapshot) continue;
    historyItems.push(toSnapshotListItem(id, snapshot, now));
  }
  historyItems.sort((a, b) => {
    const aTs = Date.parse(a.fetchedAt ?? "");
    const bTs = Date.parse(b.fetchedAt ?? "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
    return b.id.localeCompare(a.id);
  });

  let latestId = "latest";
  if (latestSnapshot) {
    const matched = historyItems.find((item) => item.asOf === latestSnapshot.asOf && item.fetchedAt === latestSnapshot.fetchedAt);
    if (matched) latestId = matched.id;
  }

  return {
    ...(latestSnapshot ? { latest: toSnapshotListItem(latestId, latestSnapshot, now) } : {}),
    history: historyItems.slice(0, limit),
  };
}

export async function loadSnapshotListForPlanning(limit = 20, options?: LoadOptions): Promise<{
  latest?: SnapshotListItem;
  history: SnapshotListItem[];
}> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const now = options?.now ?? new Date();

  if (options?.baseDir) {
    return loadFromBaseDir(safeLimit, options.baseDir, now);
  }

  const latest = await loadLatestAssumptionsSnapshot();
  const refs = await listAssumptionsHistory(safeLimit);

  const history: SnapshotListItem[] = [];
  for (const ref of refs) {
    const snapshot = await loadAssumptionsSnapshotById(ref.id);
    if (!snapshot) continue;
    history.push(toSnapshotListItem(ref.id, snapshot, now));
  }

  let latestItem: SnapshotListItem | undefined;
  if (latest) {
    const latestId = await findAssumptionsSnapshotId(latest);
    latestItem = toSnapshotListItem(latestId ?? "latest", latest, now);
  }

  return {
    ...(latestItem ? { latest: latestItem } : {}),
    history,
  };
}
