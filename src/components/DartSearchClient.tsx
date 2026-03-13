"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { DartDisclosureMonitorClient } from "@/components/DartDisclosureMonitorClient";
import {
  addFavorite,
  clearRecent,
  clearRecentSearches,
  DART_FAVORITES_UPDATED_EVENT,
  isFavorite,
  listFavorites,
  listRecent,
  listRecentSearches,
  pushRecentSearch,
  removeFavorite,
  type DartFavorite,
  type DartRecent,
  type DartRecentSearch,
} from "@/lib/dart/dartStore";
import {
  buildDartCompanyHref,
  buildDartSearchHref,
  normalizeDartCorpName,
  normalizeDartSearchQuery,
} from "@/lib/dart/query";

type SearchItem = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

type MissingIndexPayload = {
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

type BuildResult = {
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

type CompanyNameResponse = {
  ok?: boolean;
  data?: {
    corpName?: string;
  };
};

const DART_PENDING_COMPANY_HREF_STORAGE_KEY = "dart:pending-company-href";
const DART_PENDING_COMPANY_HREF_MAX_AGE_MS = 60_000;
const DART_SEARCH_DRAFT_QUERY_STORAGE_KEY = "dart:search-draft-query";
const DART_SEARCH_DRAFT_QUERY_MAX_AGE_MS = 60_000;
const DART_PENDING_SEARCH_QUERY_STORAGE_KEY = "dart:pending-search-query";
const DART_PENDING_SEARCH_QUERY_MAX_AGE_MS = 60_000;
const DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY = "dart:last-successful-search-query";
const DART_LAST_SUCCESSFUL_SEARCH_QUERY_MAX_AGE_MS = 60_000;
const DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY = "dart:last-successful-search-snapshot";
const DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS = 60_000;

function normalizeCorpCode(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{8}$/.test(raw) ? raw : "";
}

function normalizePendingCompanyHref(value: unknown): string {
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

function removeSessionStorageItem(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}

function readFreshStoredSearchQuery(storageKey: string, maxAgeMs: number): string {
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

function isReloadNavigation(): boolean {
  if (typeof window === "undefined") return false;
  const navigationEntries = window.performance?.getEntriesByType?.("navigation") ?? [];
  const navigationEntry = navigationEntries[0];
  if (navigationEntry && "type" in navigationEntry) {
    return navigationEntry.type === "reload";
  }
  return window.performance?.navigation?.type === 1;
}

function normalizeSearchItems(rows: unknown): SearchItem[] {
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

function readFreshStoredSearchSnapshot(
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

export function DartSearchClient() {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV !== "production";
  const isMountedRef = useRef(true);
  const didRestoreSearchRef = useRef(false);
  const didApplyMonitorContextRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [tab, setTab] = useState<"search" | "monitor">(
    () => (searchParams?.get("tab") === "monitor" ? "monitor" : "search"),
  );
  const [q, setQ] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [missing, setMissing] = useState<MissingIndexPayload | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [favorites, setFavorites] = useState<DartFavorite[]>([]);
  const [recent, setRecent] = useState<DartRecent[]>([]);
  const [recentSearches, setRecentSearches] = useState<DartRecentSearch[]>([]);
  const urlQuery = normalizeDartSearchQuery(searchParams?.get("q"));
  const urlTab = searchParams?.get("tab") === "monitor" ? "monitor" : "search";
  const urlMonitorCorpCode = normalizeCorpCode(searchParams?.get("corpCode"));
  const urlMonitorCorpName = normalizeDartSearchQuery(searchParams?.get("corpName"), 120);

  const refreshLocalLists = useCallback(() => {
    setFavorites(listFavorites());
    setRecent(listRecent());
    setRecentSearches(listRecentSearches());
  }, []);

  const favoriteCorpCodes = useMemo(
    () => new Set(favorites.map((item) => item.corpCode)),
    [favorites],
  );

  const buildCompanyHref = useCallback(
    (corpCode: string, fromQuery?: string, corpName?: string) => buildDartCompanyHref(corpCode, fromQuery, corpName),
    [],
  );

  const rememberPendingCompanyHref = useCallback((href: string) => {
    if (!isDev || typeof window === "undefined") return;
    const safeHref = normalizePendingCompanyHref(href);
    if (!safeHref) return;
    try {
      window.sessionStorage.setItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY, JSON.stringify({
        href: safeHref,
        createdAt: Date.now(),
      }));
    } catch {
      // Ignore storage failures and let the native navigation continue.
    }
  }, [isDev]);

  const rememberPendingSearchQuery = useCallback((query: string) => {
    if (!isDev || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(DART_PENDING_SEARCH_QUERY_STORAGE_KEY, JSON.stringify({
        query,
        createdAt: Date.now(),
      }));
    } catch {
      // Ignore storage failures and let the in-flight search continue.
    }
  }, [isDev]);

  const rememberSearchDraftQuery = useCallback((query: string) => {
    if (!isDev || typeof window === "undefined") return;
    const normalized = normalizeDartSearchQuery(query);
    if (!normalized) {
      removeSessionStorageItem(DART_SEARCH_DRAFT_QUERY_STORAGE_KEY);
      return;
    }
    try {
      window.sessionStorage.setItem(DART_SEARCH_DRAFT_QUERY_STORAGE_KEY, JSON.stringify({
        query: normalized,
        createdAt: Date.now(),
      }));
    } catch {
      // Ignore storage failures and keep the in-memory draft.
    }
  }, [isDev]);

  const clearPendingSearchQuery = useCallback(() => {
    removeSessionStorageItem(DART_PENDING_SEARCH_QUERY_STORAGE_KEY);
  }, []);

  const rememberLastSuccessfulSearchQuery = useCallback((query: string) => {
    if (!isDev || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY, JSON.stringify({
        query,
        createdAt: Date.now(),
      }));
    } catch {
      // Ignore storage failures and let the search results render.
    }
  }, [isDev]);

  const clearLastSuccessfulSearchQuery = useCallback(() => {
    removeSessionStorageItem(DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY);
  }, []);

  const rememberLastSuccessfulSearchSnapshot = useCallback((query: string, items: SearchItem[]) => {
    if (!isDev || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY, JSON.stringify({
        query,
        items,
        createdAt: Date.now(),
      }));
    } catch {
      // Ignore storage failures and let the search results render.
    }
  }, [isDev]);

  const clearLastSuccessfulSearchSnapshot = useCallback(() => {
    removeSessionStorageItem(DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setTab(urlTab);
  }, [urlTab]);

  useEffect(() => {
    refreshLocalLists();
    const onStorage = () => refreshLocalLists();
    const onFavoritesUpdated = () => refreshLocalLists();
    window.addEventListener("storage", onStorage);
    window.addEventListener(DART_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DART_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    };
  }, [refreshLocalLists]);

  useEffect(() => {
    if (!isHydrated || urlTab !== "monitor" || !urlMonitorCorpCode) return;
    if (didApplyMonitorContextRef.current) return;

    didApplyMonitorContextRef.current = true;
    removeSessionStorageItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY);

    async function applyMonitorContext(): Promise<void> {
      let added = false;
      let favoriteName = urlMonitorCorpName || undefined;

      if (!isFavorite(urlMonitorCorpCode)) {
        try {
          const res = await fetch(`/api/public/disclosure/company?corpCode=${encodeURIComponent(urlMonitorCorpCode)}`, {
            cache: "no-store",
          });
          const raw = (await res.json()) as CompanyNameResponse;
          const canonicalName = normalizeDartCorpName(raw.data?.corpName);
          if (canonicalName) {
            favoriteName = canonicalName;
          }
        } catch {
          // Fallback to the carried query value when the company detail lookup fails.
        }

        try {
          addFavorite({
            corpCode: urlMonitorCorpCode,
            corpName: favoriteName,
          });
          added = true;
        } catch {
          setNotice((current) => current || "선택한 회사를 즐겨찾기에 담지 못했습니다. 필요하면 모니터링 탭에서 다시 추가해 주세요.");
        }
      }

      refreshLocalLists();
      if (added) {
        setNotice((current) => current || `${favoriteName || "선택한 회사"}를 즐겨찾기에 담고 모니터링 탭을 열었습니다.`);
      }

      if (typeof window !== "undefined") {
        const cleanHref = buildDartSearchHref(undefined, "monitor");
        const currentHref = `${window.location.pathname}${window.location.search}`;
        if (currentHref !== cleanHref) {
          window.history.replaceState(window.history.state, "", cleanHref);
        }
      }
    }

    void applyMonitorContext();
  }, [isHydrated, refreshLocalLists, urlMonitorCorpCode, urlMonitorCorpName, urlTab]);

  async function reloadStatus(endpoint?: string): Promise<void> {
    const target = endpoint ?? missing?.statusEndpoint ?? "/api/public/disclosure/corpcodes/status";
    try {
      const res = await fetch(target, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!isMountedRef.current) return;
      if (!res.ok && res.status !== 409) return;
      if (res.ok && raw && typeof raw === "object" && raw.exists === true) {
        setMissing(null);
        return;
      }
      setMissing(raw as MissingIndexPayload);
    } catch {
      // Ignore status polling failures; explicit search error handles user feedback.
    }
  }

  const search = useCallback(async (queryOverride?: string): Promise<void> => {
    const query = normalizeDartSearchQuery(queryOverride ?? q);
    if (query !== q) {
      setQ(query);
    }
    clearLastSuccessfulSearchQuery();
    clearLastSuccessfulSearchSnapshot();
    if (!query) {
      setError("회사명을 입력하세요.");
      setItems([]);
      setHasSearched(false);
      setActiveSearchQuery("");
      return;
    }

    rememberPendingSearchQuery(query);
    setHasSearched(true);
    setLoading(true);
    setError("");
    setNotice("");
    setMissing(null);
    try {
      const params = new URLSearchParams({
        q: query,
        limit: "20",
      });
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!isMountedRef.current) return;

      if (!res.ok) {
        const missingPayload = raw as MissingIndexPayload;
        if (res.status === 409 || missingPayload.error === "CORPCODES_INDEX_MISSING") {
          setMissing(missingPayload);
          setError(missingPayload.message ?? "corpCodes 인덱스가 없습니다.");
          setItems([]);
          clearPendingSearchQuery();
          return;
        }
        setError(typeof raw.message === "string" ? raw.message : "검색에 실패했습니다.");
        setItems([]);
        clearPendingSearchQuery();
        return;
      }

      const normalized = normalizeSearchItems(raw.items);

      setItems(normalized);
      setActiveSearchQuery(query);
      pushRecentSearch(query);
      refreshLocalLists();
      rememberLastSuccessfulSearchQuery(query);
      rememberLastSuccessfulSearchSnapshot(query, normalized);
      clearPendingSearchQuery();
    } catch {
      if (!isMountedRef.current) return;
      setError("검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
      setItems([]);
      setActiveSearchQuery(query);
      clearPendingSearchQuery();
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
    }
  }, [
    clearLastSuccessfulSearchQuery,
    clearLastSuccessfulSearchSnapshot,
    clearPendingSearchQuery,
    q,
    refreshLocalLists,
    rememberLastSuccessfulSearchQuery,
    rememberLastSuccessfulSearchSnapshot,
    rememberPendingSearchQuery,
  ]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (urlTab !== "search" || urlQuery) return;

    let pendingHref = "";
    try {
      const raw = window.sessionStorage.getItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { href?: unknown; createdAt?: unknown };
        const href = normalizePendingCompanyHref(parsed.href);
        const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
        const isFresh = createdAt > 0 && Date.now() - createdAt <= DART_PENDING_COMPANY_HREF_MAX_AGE_MS;
        if (href && isFresh) {
          pendingHref = href;
        }
      }
    } catch {
      pendingHref = "";
    } finally {
      try {
        window.sessionStorage.removeItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }

    if (!pendingHref) return;
    didRestoreSearchRef.current = true;
    window.location.replace(pendingHref);
  }, [isDev, isHydrated, urlQuery, urlTab]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (!isReloadNavigation()) return;
    if (q.trim().length > 0) return;

    const draftQuery = readFreshStoredSearchQuery(
      DART_SEARCH_DRAFT_QUERY_STORAGE_KEY,
      DART_SEARCH_DRAFT_QUERY_MAX_AGE_MS,
    );
    if (!draftQuery) return;
    setQ((current) => (current === draftQuery ? current : draftQuery));
  }, [isDev, isHydrated, q]);

  useLayoutEffect(() => {
    if (!isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (!urlQuery) return;

    didRestoreSearchRef.current = true;
    setQ((current) => (current === urlQuery ? current : urlQuery));

    const lastSuccessfulSnapshot = readFreshStoredSearchSnapshot(
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS,
    );
    if (lastSuccessfulSnapshot && lastSuccessfulSnapshot.query === urlQuery) {
      setActiveSearchQuery(urlQuery);
      setHasSearched(true);
      setLoading(false);
      setError("");
      setNotice("");
      setMissing(null);
      setItems(lastSuccessfulSnapshot.items);
      return;
    }

    void search(urlQuery);
  }, [isHydrated, search, urlQuery]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;

    const pendingQuery = readFreshStoredSearchQuery(
      DART_PENDING_SEARCH_QUERY_STORAGE_KEY,
      DART_PENDING_SEARCH_QUERY_MAX_AGE_MS,
    );
    clearPendingSearchQuery();
    if (!pendingQuery) return;

    didRestoreSearchRef.current = true;
    setQ((current) => (current === pendingQuery ? current : pendingQuery));
    void search(pendingQuery);
  }, [clearPendingSearchQuery, isDev, isHydrated, search]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (!isReloadNavigation()) return;

    const lastSuccessfulSnapshot = readFreshStoredSearchSnapshot(
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS,
    );
    if (lastSuccessfulSnapshot) {
      didRestoreSearchRef.current = true;
      setQ((current) => (current === lastSuccessfulSnapshot.query ? current : lastSuccessfulSnapshot.query));
      setActiveSearchQuery(lastSuccessfulSnapshot.query);
      setHasSearched(true);
      setLoading(false);
      setError("");
      setNotice("");
      setMissing(null);
      setItems(lastSuccessfulSnapshot.items);
      return;
    }

    const lastSuccessfulQuery = readFreshStoredSearchQuery(
      DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_QUERY_MAX_AGE_MS,
    );
    if (!lastSuccessfulQuery) return;

    didRestoreSearchRef.current = true;
    setQ((current) => (current === lastSuccessfulQuery ? current : lastSuccessfulQuery));
    void search(lastSuccessfulQuery);
  }, [isDev, isHydrated, search]);

  function toggleFavorite(item: SearchItem) {
    setFavorites((current) => {
      const exists = current.some((favorite) => favorite.corpCode === item.corpCode);
      const nextFavorites = exists
        ? current.filter((favorite) => favorite.corpCode !== item.corpCode)
        : [
            {
              corpCode: item.corpCode,
              corpName: item.corpName,
              savedAt: new Date().toISOString(),
            },
            ...current.filter((favorite) => favorite.corpCode !== item.corpCode),
          ];

      try {
        if (exists) {
          removeFavorite(item.corpCode);
        } else {
          addFavorite({
            corpCode: item.corpCode,
            corpName: item.corpName,
          });
        }
      } catch {
        // Keep the optimistic UI state even if persistence fails.
      }

      return nextFavorites;
    });
  }


  async function buildIndex() {
    const endpoint = missing?.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    setBuildLoading(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const raw = (await res.json()) as BuildResult;
      if (!isMountedRef.current) return;
      if (!res.ok || raw.ok !== true) {
        setError(typeof raw.message === "string" ? raw.message : "인덱스 생성에 실패했습니다.");
        return;
      }

      const count = raw.status?.meta?.count;
      const generatedAt = raw.status?.meta?.generatedAt ?? "-";
      setNotice(`인덱스 생성 완료 (count=${typeof count === "number" ? count : "-"}, generatedAt=${generatedAt})`);
      await reloadStatus(missing?.statusEndpoint);
      if (normalizeDartSearchQuery(q)) {
        await search();
      }
    } catch {
      if (!isMountedRef.current) return;
      setError("인덱스 생성 중 오류가 발생했습니다.");
    } finally {
      if (!isMountedRef.current) return;
      setBuildLoading(false);
    }
  }

  return (
    <PageShell className="bg-surface-muted">
      <PageHeader
        title="DART 공시 분석"
        description="관심 있는 상장 기업의 실시간 공시를 검색하고 모니터링합니다."
      />

      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab("search")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${tab === "search" ? "bg-primary text-white shadow-sm" : "bg-surface text-slate-500 hover:text-slate-900 border border-border"}`}
        >
          기업 검색
        </button>
        <button
          type="button"
          onClick={() => setTab("monitor")}
          className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${tab === "monitor" ? "bg-primary text-white shadow-sm" : "bg-surface text-slate-500 hover:text-slate-900 border border-border"}`}
        >
          공시 모니터링
        </button>
      </div>

      {tab === "search" ? (
        <>
          <Card className="mb-6 p-6">
            <form
              className="flex flex-col sm:flex-row items-end sm:items-center gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isHydrated) return;
                void search();
              }}
            >
              <div className="w-full sm:flex-1 space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  회사명 검색
                </label>
                <input
                  data-testid="dart-search-input"
                  className="block w-full h-12 rounded-xl border border-border bg-surface-muted px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  value={q}
                  onChange={(event) => {
                    clearLastSuccessfulSearchQuery();
                    clearLastSuccessfulSearchSnapshot();
                    rememberSearchDraftQuery(event.target.value);
                    setQ(event.target.value);
                  }}
                  maxLength={80}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (!isHydrated) return;
                    void search();
                  }}
                  placeholder="예: 삼성전자"
                />
              </div>
              <Button
                data-testid="dart-search-submit"
                type={isHydrated ? "submit" : "button"}
                variant="primary"
                className="h-12 px-8 rounded-xl shadow-sm w-full sm:w-auto"
                disabled={!isHydrated || loading}
              >
                {loading ? "검색 중..." : "검색"}
              </Button>
            </form>
            {notice ? <p className="mt-3 text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg">{notice}</p> : null}
            {error ? <p className="mt-3 text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-lg">{error}</p> : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">최근 검색어</p>
                {recentSearches.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    검색이 성공하면 최근 검색어를 여기에 저장해 두고 다시 바로 찾을 수 있습니다.
                  </p>
                ) : (
                  <div data-testid="dart-recent-searches" className="flex flex-wrap gap-2">
                    {recentSearches.map((item) => (
                      <button
                        key={item.query}
                        data-testid="dart-recent-search-chip"
                        type="button"
                        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-slate-400"
                        disabled={!isHydrated || loading}
                        onClick={() => {
                          setQ(item.query);
                          rememberSearchDraftQuery(item.query);
                          if (!isHydrated) return;
                          void search(item.query);
                        }}
                      >
                        {item.query}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {recentSearches.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 self-start px-3 text-[11px] text-slate-500"
                  onClick={() => {
                    clearRecentSearches();
                    refreshLocalLists();
                  }}
                >
                  최근 검색어 비우기
                </Button>
              ) : null}
            </div>
          </Card>

          {missing ? (
            <Card className="mb-6 border-amber-200 bg-amber-50">
              <div data-testid="dart-missing-index">
                <p className="text-sm font-bold text-amber-800">인덱스 구축이 필요합니다</p>
                <div className="mt-3 space-y-1 text-xs text-amber-700/80 font-mono">
                  <p>message: {missing.message ?? "-"}</p>
                  <p>primaryPath: {missing.primaryPath ?? "-"}</p>
                </div>
              </div>

              {isDev && missing.canAutoBuild === true ? (
                <div className="mt-4">
                  <Button
                    data-testid="dart-build-index-button"
                    size="sm"
                    variant="primary"
                    className="bg-amber-600 hover:bg-amber-700 text-white border-none"
                    onClick={() => void buildIndex()}
                    disabled={buildLoading}
                  >
                    {buildLoading ? "인덱스 생성 중..." : "인덱스 자동 생성"}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3 items-start">
            <Card className="lg:col-span-2 p-0 overflow-hidden">
              <div data-testid="dart-search-results">
                <div className="bg-surface px-6 py-4 border-b border-border/50">
                   <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">검색 결과</h2>
                </div>
                {!loading && !error && !missing && items.length === 0 && !hasSearched ? (
                  <div
                    data-testid="dart-search-idle"
                    className="p-12 text-center"
                  >
                    <p className="text-sm font-semibold text-slate-700">회사명을 입력하고 검색해 보세요.</p>
                    <p className="mt-2 text-xs text-slate-500">예: 삼성전자, 네이버, 카카오</p>
                  </div>
                ) : null}
                {!loading && !error && !missing && items.length === 0 && hasSearched ? (
                  <div
                    data-testid="dart-search-empty"
                    className="p-12 text-center"
                  >
                    <p className="text-sm font-semibold text-slate-700">검색 결과가 없습니다.</p>
                    <p className="mt-2 text-xs text-slate-500">회사명 일부만 입력하거나 다른 표기를 시도해 보세요.</p>
                  </div>
                ) : null}
                {items.length > 0 ? (
                  <ul className="divide-y divide-border/50 bg-surface">
                    {items.map((item) => (
                      <li key={item.corpCode}>
                        <div className="flex items-center gap-3 p-4 px-6 transition-colors hover:bg-surface-muted">
                          <a
                            data-testid="dart-search-item"
                            href={buildCompanyHref(item.corpCode, activeSearchQuery || q, item.corpName)}
                            className="group flex min-w-0 flex-1 items-center justify-between"
                            onClick={(event) => {
                              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                              rememberPendingCompanyHref(buildCompanyHref(item.corpCode, activeSearchQuery || q, item.corpName));
                            }}
                          >
                            <div className="min-w-0">
                               <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{item.corpName}</p>
                               <p className="mt-1 text-xs text-slate-500">
                                 DART {item.corpCode}
                                 {item.stockCode ? <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px]">KRX {item.stockCode}</span> : <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">비상장</span>}
                               </p>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-3 shrink-0 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all"><path d="m9 18 6-6-6-6"/></svg>
                          </a>
                          <button
                            data-testid="dart-search-favorite-toggle"
                            type="button"
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                              favoriteCorpCodes.has(item.corpCode)
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-amber-700"
                            }`}
                            aria-pressed={favoriteCorpCodes.has(item.corpCode)}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleFavorite(item);
                            }}
                          >
                            {favoriteCorpCodes.has(item.corpCode) ? "저장됨" : "즐겨찾기"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between bg-surface px-5 py-4 text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-border/50"
                >
                  <span className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="text-amber-400"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    즐겨찾기
                  </span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{favorites.length}</span>
                </button>
                {favoritesOpen && (
                  <div className="bg-surface">
                    {favorites.length === 0 ? (
                      <p className="p-5 text-xs text-center text-slate-400">즐겨찾기한 회사가 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {favorites.map((item) => (
                          <li key={item.corpCode}>
                            <a
                              href={buildCompanyHref(item.corpCode)}
                              className="block p-3 px-5 hover:bg-surface-muted transition-colors"
                              onClick={(event) => {
                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                                rememberPendingCompanyHref(buildCompanyHref(item.corpCode));
                              }}
                            >
                              <p className="text-xs font-bold text-slate-900">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{item.corpCode}</p>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="flex items-center justify-between bg-surface px-5 py-4 border-b border-border/50">
                  <button
                    type="button"
                    onClick={() => setRecentOpen((prev) => !prev)}
                    className="flex-1 text-left text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    최근 기록
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-slate-400"
                    onClick={() => {
                      clearRecent();
                      refreshLocalLists();
                    }}
                    disabled={recent.length === 0}
                  >
                    비우기
                  </Button>
                </div>
                {recentOpen && (
                  <div className="bg-surface">
                    {recent.length === 0 ? (
                      <p className="p-5 text-xs text-center text-slate-400">최근 기록이 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {recent.map((item) => (
                          <li key={item.corpCode}>
                            <a
                              href={buildCompanyHref(item.corpCode)}
                              className="block p-3 px-5 hover:bg-surface-muted transition-colors"
                              onClick={(event) => {
                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                                rememberPendingCompanyHref(buildCompanyHref(item.corpCode));
                              }}
                            >
                              <p className="text-xs font-bold text-slate-900">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{item.corpCode}</p>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-6">
          <DartDisclosureMonitorClient />
        </div>
      )}
    </PageShell>
  );
}
