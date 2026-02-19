import fs from "node:fs";
import path from "node:path";

export type CorpCodeIndexItem = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
  modifyDate?: string;
  normName: string;
};

export type CorpCodeIndexV1 = {
  version: 1;
  generatedAt: string;
  count: number;
  items: CorpCodeIndexItem[];
};

export type CorpCodeSort = "name" | "name_desc" | "stock_first";
export type CorpIndexStatus = {
  exists: boolean;
  primaryPath: string;
  triedPaths: string[];
  meta?: {
    loadedPath: string;
    mtimeMs: number;
    generatedAt?: string;
    count?: number;
  };
};

let cached: CorpCodeIndexV1 | null = null;
let cachedMtimeMs: number | null = null;
let cachedPath: string | null = null;
let loadedPath: string | null = null;

export function invalidateCorpIndexCache(): void {
  cached = null;
  cachedMtimeMs = null;
  cachedPath = null;
  loadedPath = null;
}

export function normalizeCorpQuery(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()·.,_-]/g, "");
}

export function resolveCorpCodesIndexPath(root = process.cwd(), envPath = process.env.DART_CORPCODES_INDEX_PATH): { primary: string; tried: string[] } {
  const primary = envPath?.trim() ? path.resolve(root, envPath.trim()) : path.join(root, "tmp", "dart", "corpCodes.index.json");
  const legacy = path.join(root, "src", "data", "dart", "corpCodes.json");
  const tried = [primary];
  if (legacy !== primary) tried.push(legacy);
  return { primary, tried };
}

export function getCorpIndexPath(): string {
  return loadedPath ?? resolveCorpCodesIndexPath().primary;
}

export function getCorpIndexTriedPaths(): string[] {
  return resolveCorpCodesIndexPath().tried;
}

export function getCorpIndexStatus(): CorpIndexStatus {
  const { primary, tried } = resolveCorpCodesIndexPath();

  for (const candidatePath of tried) {
    try {
      const stat = fs.statSync(candidatePath);
      return {
        exists: true,
        primaryPath: primary,
        triedPaths: tried,
        meta: readCorpIndexMeta(candidatePath, stat.mtimeMs),
      };
    } catch {
      continue;
    }
  }

  return {
    exists: false,
    primaryPath: primary,
    triedPaths: tried,
  };
}

export function loadCorpIndex(): CorpCodeIndexV1 | null {
  const { tried } = resolveCorpCodesIndexPath();

  for (const candidatePath of tried) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidatePath);
    } catch {
      continue;
    }

    if (cached && cachedPath === candidatePath && cachedMtimeMs === stat.mtimeMs) {
      loadedPath = candidatePath;
      return cached;
    }

    try {
      const raw = fs.readFileSync(candidatePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const normalized = parseCorpIndex(parsed);
      cached = normalized;
      cachedPath = candidatePath;
      cachedMtimeMs = stat.mtimeMs;
      loadedPath = candidatePath;
      return normalized;
    } catch (error) {
      console.error("[dart] failed to load corp index", {
        path: candidatePath,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (cached !== null || cachedMtimeMs !== null || cachedPath !== null || loadedPath !== null) {
    invalidateCorpIndexCache();
  }

  return null;
}

export function searchCorpIndex(input: { query: string; limit?: number; sort?: CorpCodeSort }, index?: CorpCodeIndexV1): { items: CorpCodeIndexItem[]; total: number } {
  const query = normalizeCorpQuery(input.query);
  if (!query) return { items: [], total: 0 };

  const loaded = index ?? loadCorpIndex();
  if (!loaded) return { items: [], total: 0 };

  const limit = Math.max(1, Math.min(input.limit ?? 50, 100));
  const sort = input.sort ?? "name";

  const ranked = loaded.items
    .map((item) => {
      const startsWith = item.normName.startsWith(query);
      const includes = !startsWith && item.normName.includes(query);
      if (!startsWith && !includes) return null;

      const rank = startsWith ? 0 : 1;
      return { item, rank };
    })
    .filter((value): value is { item: CorpCodeIndexItem; rank: number } => Boolean(value));

  ranked.sort((a, b) => compareRanked(a, b, sort));

  return {
    items: ranked.slice(0, limit).map((row) => row.item),
    total: ranked.length,
  };
}

function compareRanked(a: { item: CorpCodeIndexItem; rank: number }, b: { item: CorpCodeIndexItem; rank: number }, sort: CorpCodeSort): number {
  if (a.rank !== b.rank) return a.rank - b.rank;

  if (sort === "stock_first") {
    const stockCompare = Number(Boolean(b.item.stockCode)) - Number(Boolean(a.item.stockCode));
    if (stockCompare !== 0) return stockCompare;
  }

  if (sort === "name_desc") {
    return b.item.corpName.localeCompare(a.item.corpName, "ko");
  }

  return a.item.corpName.localeCompare(b.item.corpName, "ko");
}

function parseCorpIndex(raw: unknown): CorpCodeIndexV1 {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    throw new Error("corp index schema mismatch");
  }

  const generatedAt = typeof raw.generatedAt === "string" ? raw.generatedAt : new Date(0).toISOString();
  const items = raw.items
    .map((item) => parseItem(item))
    .filter((item): item is CorpCodeIndexItem => Boolean(item));

  return {
    version: 1,
    generatedAt,
    count: items.length,
    items,
  };
}

function parseItem(raw: unknown): CorpCodeIndexItem | null {
  if (!isRecord(raw)) return null;

  const corpCode = getString(raw, "corpCode") ?? getString(raw, "corp_code");
  const corpName = getString(raw, "corpName") ?? getString(raw, "corp_name");
  if (!corpCode || !corpName) return null;

  const stockCode = getString(raw, "stockCode") ?? getString(raw, "stock_code") ?? undefined;
  const modifyDate = getString(raw, "modifyDate") ?? getString(raw, "modify_date") ?? undefined;
  const normName = normalizeCorpQuery(corpName);

  return {
    corpCode,
    corpName,
    stockCode,
    modifyDate,
    normName,
  };
}

function getString(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCorpIndexMeta(candidatePath: string, mtimeMs: number): CorpIndexStatus["meta"] {
  let generatedAt: string | undefined;
  let count: number | undefined;

  try {
    const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf-8")) as unknown;
    if (isRecord(parsed)) {
      if (typeof parsed.generatedAt === "string") generatedAt = parsed.generatedAt;
      if (typeof parsed.count === "number" && Number.isFinite(parsed.count)) {
        count = parsed.count;
      } else if (Array.isArray(parsed.items)) {
        count = parsed.items.length;
      }
    }
  } catch {
    // status API should still report path/mtime even if json parse fails.
  }

  return {
    loadedPath: candidatePath,
    mtimeMs,
    generatedAt,
    count,
  };
}
