import {
  DART_FAVORITES_UPDATED_EVENT,
  dartStoreConfig,
  listFavorites,
  listRecent,
  listRecentSearches,
} from "@/lib/dart/dartStore";
import {
  buildDartCompanyHref,
  normalizeDartCorpName,
  normalizeDartSearchQuery,
} from "@/lib/dart/query";
import type { LatestRequestLease } from "@/lib/browser/latestRequest";

export type SearchItem = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

export type MissingIndexPayload = {
  error?: string;
  message?: string;
  hintCommand?: string;
  hintCommandWithPath?: string;
  primaryPath?: string;
  triedPaths?: string[];
  canAutoBuild?: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint?: string;
  statusEndpoint?: string;
};

export type BuildResult = {
  ok?: boolean;
  message?: string;
  status?: {
    exists?: boolean;
    primaryPath?: string;
    triedPaths?: string[];
    meta?: {
      loadedPath?: string;
      generatedAt?: string;
      count?: number;
    };
  };
};

export type CompanyNameResponse = {
  ok?: boolean;
  data?: {
    corpName?: string;
  };
};

type DartBuildContinuation = {
  request: LatestRequestLease;
  reloadStatus: (request: LatestRequestLease) => Promise<void>;
  search?: (request: LatestRequestLease) => Promise<void>;
};

export async function continueDartBuildAction({
  request,
  reloadStatus,
  search,
}: DartBuildContinuation): Promise<void> {
  if (!request.isCurrent()) return;
  await reloadStatus(request);
  if (!request.isCurrent() || !search) return;
  await search(request);
}

export const DART_PENDING_COMPANY_HREF_STORAGE_KEY = "dart:pending-company-href";
export const DART_PENDING_COMPANY_HREF_MAX_AGE_MS = 60_000;
export const DART_SEARCH_DRAFT_QUERY_STORAGE_KEY = "dart:search-draft-query";
export const DART_SEARCH_DRAFT_QUERY_MAX_AGE_MS = 60_000;
export const DART_PENDING_SEARCH_QUERY_STORAGE_KEY = "dart:pending-search-query";
export const DART_PENDING_SEARCH_QUERY_MAX_AGE_MS = 60_000;
export const DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY = "dart:last-successful-search-query";
export const DART_LAST_SUCCESSFUL_SEARCH_QUERY_MAX_AGE_MS = 60_000;
export const DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY = "dart:last-successful-search-snapshot";
export const DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS = 60_000;

export function normalizeCorpCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{8}$/.test(raw) ? raw : "";
}

export function normalizePendingCompanyHref(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw.startsWith("/public/dart/company?")) return "";
  try {
    const url = new URL(raw, "http://localhost");
    if (url.pathname !== "/public/dart/company") return "";
    const corpCode = normalizeCorpCode(url.searchParams.get("corpCode"));
    const fromQuery = normalizeDartSearchQuery(url.searchParams.get("fromQuery"));
    const corpName = normalizeDartCorpName(url.searchParams.get("corpName"));
    return corpCode ? buildDartCompanyHref(corpCode, fromQuery, corpName) : "";
  } catch {
    return "";
  }
}

export function removeSessionStorageItem(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}

export function readFreshStoredSearchQuery(storageKey: string, maxAgeMs: number): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { query?: unknown; createdAt?: unknown };
    const query = normalizeDartSearchQuery(parsed.query);
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const isFresh = createdAt > 0 && Date.now() - createdAt <= maxAgeMs;
    return query && isFresh ? query : "";
  } catch {
    return "";
  }
}

export function isReloadNavigation(): boolean {
  if (typeof window === "undefined") return false;
  const navigationEntries = window.performance?.getEntriesByType?.("navigation") ?? [];
  const navigationEntry = navigationEntries[0];
  if (navigationEntry && "type" in navigationEntry) {
    return navigationEntry.type === "reload";
  }
  return window.performance?.navigation?.type === 1;
}

export function normalizeSearchItems(rows: unknown): SearchItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Record<string, unknown>;
      const corpCode = normalizeCorpCode(item.corpCode);
      const corpName = typeof item.corpName === "string" ? item.corpName : "";
      if (!corpCode || !corpName) return null;
      const mapped: SearchItem = {
        corpCode,
        corpName,
      };
      if (typeof item.stockCode === "string") mapped.stockCode = item.stockCode;
      return mapped;
    })
    .filter((item): item is SearchItem => item !== null);
}

export function readFreshStoredSearchSnapshot(
  storageKey: string,
  maxAgeMs: number,
): { query: string; items: SearchItem[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { query?: unknown; items?: unknown; createdAt?: unknown };
    const query = normalizeDartSearchQuery(parsed.query);
    const items = normalizeSearchItems(parsed.items);
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const isFresh = createdAt > 0 && Date.now() - createdAt <= maxAgeMs;
    if (!query || !isFresh) return null;
    return { query, items };
  } catch {
    return null;
  }
}

export function subscribeDartLocalLists(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handleStoreChange = () => onStoreChange();
  window.addEventListener("storage", handleStoreChange);
  window.addEventListener(DART_FAVORITES_UPDATED_EVENT, handleStoreChange);
  return () => {
    window.removeEventListener("storage", handleStoreChange);
    window.removeEventListener(DART_FAVORITES_UPDATED_EVENT, handleStoreChange);
  };
}

export function getDartLocalListsStorageSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return [
      window.localStorage.getItem(dartStoreConfig.favoritesKey) ?? "",
      window.localStorage.getItem(dartStoreConfig.recentKey) ?? "",
      window.localStorage.getItem(dartStoreConfig.recentSearchesKey) ?? "",
    ].join("\n---dart-store---\n");
  } catch {
    return "";
  }
}

export function getServerDartLocalListsStorageSnapshot(): string {
  return "";
}

export type DartLocalLists = {
  favorites: ReturnType<typeof listFavorites>;
  recent: ReturnType<typeof listRecent>;
  recentSearches: ReturnType<typeof listRecentSearches>;
};

export const EMPTY_DART_LOCAL_LISTS: DartLocalLists = {
  favorites: [],
  recent: [],
  recentSearches: [],
};

export function readDartLocalLists(): DartLocalLists {
  if (typeof window === "undefined") return EMPTY_DART_LOCAL_LISTS;
  try {
    return {
      favorites: listFavorites(),
      recent: listRecent(),
      recentSearches: listRecentSearches(),
    };
  } catch {
    return EMPTY_DART_LOCAL_LISTS;
  }
}
