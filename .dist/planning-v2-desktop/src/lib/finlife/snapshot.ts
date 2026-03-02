import fs from "node:fs";
import path from "node:path";
import { ensureProductBest } from "./best";
import { type FinlifeKind, type NormalizedProduct } from "./types";

export type FinlifeSnapshotKind = Extract<FinlifeKind, "deposit" | "saving">;

export type FinlifeSnapshotMeta = {
  generatedAt: string;
  ttlMs: number;
  configuredGroups?: string[];
  groupsScanned: string[];
  pagesFetchedByGroup: Record<string, number>;
  totalProducts: number;
  totalOptions: number;
  completionRate: number;
  truncatedByHardCap: boolean;
  source: "finlife" | "mock";
  fallbackUsed?: boolean;
  lastUpstreamStatus?: number | null;
  duplicateAcrossGroupsCount?: number;
  note?: string;
};

export type FinlifeSnapshot = {
  meta: FinlifeSnapshotMeta;
  items: NormalizedProduct[];
};

const memoryCache = new Map<string, FinlifeSnapshot>();

function snapshotPath(kind: FinlifeSnapshotKind): string {
  return path.join(process.cwd(), ".data", `finlife_${kind}_snapshot.json`);
}

export function loadFinlifeSnapshot(kind: FinlifeSnapshotKind): FinlifeSnapshot | null {
  const filePath = snapshotPath(kind);
  const cached = memoryCache.get(filePath);
  if (cached) return cached;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as FinlifeSnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return null;
    if (!parsed.meta || typeof parsed.meta.generatedAt !== "string") return null;
    for (const item of parsed.items) ensureProductBest(item);
    memoryCache.set(filePath, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveFinlifeSnapshot(kind: FinlifeSnapshotKind, snapshot: FinlifeSnapshot): void {
  const filePath = snapshotPath(kind);
  for (const item of snapshot.items) ensureProductBest(item);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(snapshot), "utf-8");
  fs.renameSync(tempPath, filePath);
  memoryCache.set(filePath, snapshot);
}

export function isSnapshotFresh(meta: { generatedAt?: string; ttlMs?: number; completionRate?: number } | null | undefined, nowMs: number, ttlMs: number): boolean {
  if (!meta?.generatedAt) return false;
  const generatedMs = Date.parse(meta.generatedAt);
  if (!Number.isFinite(generatedMs)) return false;
  if (nowMs - generatedMs > Math.max(60_000, ttlMs)) return false;
  const completionRate = typeof meta.completionRate === "number" ? meta.completionRate : 0;
  return completionRate >= 0.95;
}
