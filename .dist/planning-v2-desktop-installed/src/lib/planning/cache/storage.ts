import fs from "node:fs/promises";
import path from "node:path";
import { type PlanningCacheEntry, type PlanningCacheKind, type PlanningCacheUsageStats } from "./types";

export const CACHE_DIR = ".data/planning/cache";
const CACHE_USAGE_STATS_FILE = "_usage.stats.json";
const CACHE_ENTRY_VERSION = 1 as const;

function resolveCacheDir(): string {
  const envPath = (process.env.PLANNING_CACHE_DIR ?? "").trim();
  if (envPath) return path.resolve(process.cwd(), envPath);
  return path.resolve(process.cwd(), CACHE_DIR);
}

function nowIso(): string {
  return new Date().toISOString();
}

function cacheFilePath(kind: PlanningCacheKind, key: string): string {
  return path.join(resolveCacheDir(), `${kind}.${key}.json`);
}

function usageStatsPath(): string {
  return path.join(resolveCacheDir(), CACHE_USAGE_STATS_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidKey(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isExpired(expiresAt: string): boolean {
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() > ts;
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, filePath);
}

function defaultUsageStats(): PlanningCacheUsageStats {
  return {
    version: 1,
    updatedAt: nowIso(),
    totals: {
      hits: 0,
      misses: 0,
    },
    byKind: {
      simulate: { hits: 0, misses: 0 },
      scenarios: { hits: 0, misses: 0 },
      monteCarlo: { hits: 0, misses: 0 },
      actions: { hits: 0, misses: 0 },
    },
  };
}

function isPlanningCacheEntry(value: unknown): value is PlanningCacheEntry<unknown> {
  if (!isRecord(value)) return false;
  if (value.version !== CACHE_ENTRY_VERSION) return false;
  if (typeof value.kind !== "string") return false;
  if (typeof value.key !== "string" || !isValidKey(value.key)) return false;
  if (typeof value.createdAt !== "string" || typeof value.expiresAt !== "string") return false;
  if (!isRecord(value.meta)) return false;
  if (typeof value.meta.horizonMonths !== "number" || !Number.isFinite(value.meta.horizonMonths)) return false;
  if (typeof value.meta.assumptionsHash !== "string" || !isValidKey(value.meta.assumptionsHash)) return false;
  if (typeof value.meta.optionsHash !== "string" || !isValidKey(value.meta.optionsHash)) return false;
  return true;
}

export async function getCache<T>(kind: PlanningCacheKind, key: string): Promise<PlanningCacheEntry<T> | null> {
  if (!isValidKey(key)) return null;

  const filePath = cacheFilePath(kind, key);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlanningCacheEntry(parsed)) return null;
    if (parsed.kind !== kind || parsed.key !== key) return null;

    if (isExpired(parsed.expiresAt)) {
      await fs.unlink(filePath).catch(() => undefined);
      return null;
    }

    return parsed as PlanningCacheEntry<T>;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    return null;
  }
}

export async function setCache<T>(entry: PlanningCacheEntry<T>): Promise<void> {
  if (!isValidKey(entry.key)) {
    throw new Error("invalid cache key");
  }

  const filePath = cacheFilePath(entry.kind, entry.key);
  await writeJsonAtomic(filePath, entry);
}

export async function purgeExpired(): Promise<{ purged: number }> {
  const dirPath = resolveCacheDir();

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return { purged: 0 };
    throw error;
  }

  let purged = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    if (entry.name === CACHE_USAGE_STATS_FILE) continue;

    const filePath = path.join(dirPath, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isPlanningCacheEntry(parsed) || isExpired(parsed.expiresAt)) {
        await fs.unlink(filePath).catch(() => undefined);
        purged += 1;
      }
    } catch {
      await fs.unlink(filePath).catch(() => undefined);
      purged += 1;
    }
  }

  return { purged };
}

export async function cacheStats(): Promise<{ total: number; byKind: Record<string, number> }> {
  const dirPath = resolveCacheDir();

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        total: 0,
        byKind: {
          simulate: 0,
          scenarios: 0,
          monteCarlo: 0,
          actions: 0,
        },
      };
    }
    throw error;
  }

  const byKind: Record<string, number> = {
    simulate: 0,
    scenarios: 0,
    monteCarlo: 0,
    actions: 0,
  };

  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".json")) continue;
    if (entry.name === CACHE_USAGE_STATS_FILE) continue;

    try {
      const raw = await fs.readFile(path.join(dirPath, entry.name), "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isPlanningCacheEntry(parsed)) continue;
      if (isExpired(parsed.expiresAt)) continue;
      total += 1;
      byKind[parsed.kind] = (byKind[parsed.kind] ?? 0) + 1;
    } catch {
      continue;
    }
  }

  return { total, byKind };
}

export async function getCacheUsageStats(): Promise<PlanningCacheUsageStats> {
  const filePath = usageStatsPath();

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return defaultUsageStats();

    const stats = defaultUsageStats();
    if (typeof parsed.updatedAt === "string") stats.updatedAt = parsed.updatedAt;

    if (isRecord(parsed.totals)) {
      if (typeof parsed.totals.hits === "number" && Number.isFinite(parsed.totals.hits)) {
        stats.totals.hits = Math.max(0, Math.trunc(parsed.totals.hits));
      }
      if (typeof parsed.totals.misses === "number" && Number.isFinite(parsed.totals.misses)) {
        stats.totals.misses = Math.max(0, Math.trunc(parsed.totals.misses));
      }
    }

    if (isRecord(parsed.byKind)) {
      for (const kind of Object.keys(stats.byKind) as PlanningCacheKind[]) {
        const row = parsed.byKind[kind];
        if (!isRecord(row)) continue;
        if (typeof row.hits === "number" && Number.isFinite(row.hits)) {
          stats.byKind[kind].hits = Math.max(0, Math.trunc(row.hits));
        }
        if (typeof row.misses === "number" && Number.isFinite(row.misses)) {
          stats.byKind[kind].misses = Math.max(0, Math.trunc(row.misses));
        }
      }
    }

    return stats;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return defaultUsageStats();
    return defaultUsageStats();
  }
}

export async function recordCacheUsage(kind: PlanningCacheKind, hit: boolean): Promise<void> {
  const stats = await getCacheUsageStats();
  if (hit) {
    stats.totals.hits += 1;
    stats.byKind[kind].hits += 1;
  } else {
    stats.totals.misses += 1;
    stats.byKind[kind].misses += 1;
  }
  stats.updatedAt = nowIso();
  await writeJsonAtomic(usageStatsPath(), stats);
}
