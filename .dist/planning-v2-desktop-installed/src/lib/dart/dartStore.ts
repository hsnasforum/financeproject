type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const FAVORITES_KEY = "dart_favorites_v1";
const RECENT_KEY = "dart_recent_v1";
const RECENT_MAX = 20;

export type DartFavorite = {
  corpCode: string;
  corpName?: string;
  savedAt: string;
};

export type DartRecent = {
  corpCode: string;
  corpName?: string;
  viewedAt: string;
};

type DartCompanyRef = {
  corpCode: string;
  corpName?: string;
};

function inBrowser(): boolean {
  return typeof window !== "undefined";
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (!inBrowser()) return null;
  return window.localStorage;
}

function normalizeCorpCode(value: string): string {
  return value.trim();
}

function normalizeDate(value: unknown): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseFavorites(raw: string | null): DartFavorite[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: DartFavorite[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const corpCode = normalizeCorpCode(typeof item.corpCode === "string" ? item.corpCode : "");
      if (!corpCode || seen.has(corpCode)) continue;
      seen.add(corpCode);
      out.push({
        corpCode,
        corpName: normalizeName(item.corpName),
        savedAt: normalizeDate(item.savedAt),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseRecent(raw: string | null): DartRecent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: DartRecent[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const corpCode = normalizeCorpCode(typeof item.corpCode === "string" ? item.corpCode : "");
      if (!corpCode || seen.has(corpCode)) continue;
      seen.add(corpCode);
      out.push({
        corpCode,
        corpName: normalizeName(item.corpName),
        viewedAt: normalizeDate(item.viewedAt),
      });
      if (out.length >= RECENT_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

function writeFavorites(items: DartFavorite[], storage?: StorageLike): DartFavorite[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return items;
  resolved.setItem(FAVORITES_KEY, JSON.stringify(items));
  return items;
}

function writeRecent(items: DartRecent[], storage?: StorageLike): DartRecent[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return items;
  resolved.setItem(RECENT_KEY, JSON.stringify(items));
  return items;
}

export function listFavorites(storage?: StorageLike): DartFavorite[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  return parseFavorites(resolved.getItem(FAVORITES_KEY));
}

export function addFavorite(input: DartCompanyRef, storage?: StorageLike): DartFavorite[] {
  const corpCode = normalizeCorpCode(input.corpCode);
  if (!corpCode) return listFavorites(storage);

  const now = new Date().toISOString();
  const next: DartFavorite[] = [
    {
      corpCode,
      corpName: normalizeName(input.corpName),
      savedAt: now,
    },
    ...listFavorites(storage).filter((item) => item.corpCode !== corpCode),
  ];
  return writeFavorites(next, storage);
}

export function add(input: DartCompanyRef, storage?: StorageLike): DartFavorite[] {
  return addFavorite(input, storage);
}

export function removeFavorite(corpCode: string, storage?: StorageLike): DartFavorite[] {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) return listFavorites(storage);
  const next = listFavorites(storage).filter((item) => item.corpCode !== normalized);
  return writeFavorites(next, storage);
}

export function remove(corpCode: string, storage?: StorageLike): DartFavorite[] {
  return removeFavorite(corpCode, storage);
}

export function isFavorite(corpCode: string, storage?: StorageLike): boolean {
  const normalized = normalizeCorpCode(corpCode);
  if (!normalized) return false;
  return listFavorites(storage).some((item) => item.corpCode === normalized);
}

export function list(storage?: StorageLike): DartFavorite[] {
  return listFavorites(storage);
}

export function listRecent(storage?: StorageLike): DartRecent[] {
  const resolved = resolveStorage(storage);
  if (!resolved) return [];
  return parseRecent(resolved.getItem(RECENT_KEY));
}

export function pushRecent(input: DartCompanyRef, storage?: StorageLike): DartRecent[] {
  const corpCode = normalizeCorpCode(input.corpCode);
  if (!corpCode) return listRecent(storage);
  const now = new Date().toISOString();
  const next = [
    {
      corpCode,
      corpName: normalizeName(input.corpName),
      viewedAt: now,
    } satisfies DartRecent,
    ...listRecent(storage).filter((item) => item.corpCode !== corpCode),
  ].slice(0, RECENT_MAX);
  return writeRecent(next, storage);
}

export function clearRecent(storage?: StorageLike): void {
  const resolved = resolveStorage(storage);
  if (!resolved) return;
  resolved.removeItem(RECENT_KEY);
}

export const dartStoreConfig = {
  favoritesKey: FAVORITES_KEY,
  recentKey: RECENT_KEY,
  recentMax: RECENT_MAX,
};
