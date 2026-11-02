"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { DartDisclosureMonitorClient } from "@/components/DartDisclosureMonitorClient";
import { DartSearchPanel } from "@/components/dart/DartSearchPanel";
import {
  addFavorite,
  isFavorite,
  pushRecentSearch,
  removeFavorite,
} from "@/lib/dart/dartStore";
import {
  buildDartCompanyHref,
  buildDartSearchHref,
  normalizeDartCorpName,
  normalizeDartSearchQuery,
} from "@/lib/dart/query";
import { cn } from "@/lib/utils";
import {
  createLatestRequestCoordinator,
  type LatestRequestLease,
} from "@/lib/browser/latestRequest";
import {
  DART_LAST_SUCCESSFUL_SEARCH_QUERY_MAX_AGE_MS,
  DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY,
  DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS,
  DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY,
  DART_PENDING_COMPANY_HREF_MAX_AGE_MS,
  DART_PENDING_COMPANY_HREF_STORAGE_KEY,
  DART_PENDING_SEARCH_QUERY_MAX_AGE_MS,
  DART_PENDING_SEARCH_QUERY_STORAGE_KEY,
  DART_SEARCH_DRAFT_QUERY_MAX_AGE_MS,
  DART_SEARCH_DRAFT_QUERY_STORAGE_KEY,
  EMPTY_DART_LOCAL_LISTS,
  continueDartBuildAction,
  getDartLocalListsStorageSnapshot,
  getServerDartLocalListsStorageSnapshot,
  isReloadNavigation,
  normalizeCorpCode,
  normalizePendingCompanyHref,
  normalizeSearchItems,
  readDartLocalLists,
  readFreshStoredSearchQuery,
  readFreshStoredSearchSnapshot,
  removeSessionStorageItem,
  subscribeDartLocalLists,
  type BuildResult,
  type CompanyNameResponse,
  type MissingIndexPayload,
  type SearchItem,
} from "@/components/dart/dartSearchModel";

export { continueDartBuildAction } from "@/components/dart/dartSearchModel";

export function DartSearchClient() {
  const searchParams = useSearchParams();
  const isDev = process.env.NODE_ENV !== "production";
  const isMountedRef = useRef(true);
  const didRestoreSearchRef = useRef(false);
  const scheduledSearchRestoreRef = useRef(false);
  const didApplyMonitorContextRef = useRef(false);
  const actionRequestsRef = useRef<ReturnType<typeof createLatestRequestCoordinator> | null>(null);
  const monitorContextRequestsRef = useRef<ReturnType<typeof createLatestRequestCoordinator> | null>(null);
  if (actionRequestsRef.current == null) actionRequestsRef.current = createLatestRequestCoordinator();
  if (monitorContextRequestsRef.current == null) monitorContextRequestsRef.current = createLatestRequestCoordinator();
  const urlQuery = normalizeDartSearchQuery(searchParams?.get("q"));
  const urlTab = searchParams?.get("tab") === "monitor" ? "monitor" : "search";
  const urlMonitorCorpCode = normalizeCorpCode(searchParams?.get("corpCode"));
  const urlMonitorCorpName = normalizeDartSearchQuery(searchParams?.get("corpName"), 120);
  const isHydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  useSyncExternalStore(
    subscribeDartLocalLists,
    getDartLocalListsStorageSnapshot,
    getServerDartLocalListsStorageSnapshot,
  );
  const [, setLocalListsRevision] = useState(0);
  const [tabOverride, setTabOverride] = useState<"search" | "monitor" | null>(null);
  const tab = tabOverride ?? urlTab;
  const [q, setQ] = useState(() => urlQuery);
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

  const refreshLocalLists = useCallback(() => {
    setLocalListsRevision((value) => value + 1);
  }, []);

  const {
    favorites,
    recent,
    recentSearches,
  } = isHydrated ? readDartLocalLists() : EMPTY_DART_LOCAL_LISTS;

  const favoriteCorpCodes = new Set(favorites.map((item) => item.corpCode));

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
      actionRequestsRef.current?.cancel();
      monitorContextRequestsRef.current?.cancel();
    };
  }, []);

  const scheduleSearchRestore = useCallback((restore: () => void): (() => void) => {
    if (scheduledSearchRestoreRef.current || didRestoreSearchRef.current) return () => undefined;
    scheduledSearchRestoreRef.current = true;
    const restoreTimer = window.setTimeout(() => {
      scheduledSearchRestoreRef.current = false;
      didRestoreSearchRef.current = true;
      restore();
    }, 0);
    return () => {
      window.clearTimeout(restoreTimer);
      scheduledSearchRestoreRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || tab !== "monitor" || urlTab !== "monitor" || !urlMonitorCorpCode) return;
    if (didApplyMonitorContextRef.current) return;

    didApplyMonitorContextRef.current = true;
    removeSessionStorageItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY);
    const request = monitorContextRequestsRef.current!.start();

    async function applyMonitorContext(): Promise<void> {
      let added = false;
      let favoriteName = urlMonitorCorpName || undefined;

      if (!isFavorite(urlMonitorCorpCode)) {
        try {
          const res = await fetch(`/api/public/disclosure/company?corpCode=${encodeURIComponent(urlMonitorCorpCode)}`, {
            cache: "no-store",
            signal: request.signal,
          });
          const raw = (await res.json()) as CompanyNameResponse;
          if (!request.isCurrent()) return;
          const canonicalName = normalizeDartCorpName(raw.data?.corpName);
          if (canonicalName) {
            favoriteName = canonicalName;
          }
        } catch {
          // Fallback to the carried query value when the company detail lookup fails.
        }

        if (!request.isCurrent()) return;

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
      request.finish();
    }

    void applyMonitorContext();
    return () => {
      monitorContextRequestsRef.current?.cancel();
      didApplyMonitorContextRef.current = false;
    };
  }, [isHydrated, refreshLocalLists, tab, urlMonitorCorpCode, urlMonitorCorpName, urlTab]);

  async function reloadStatus(endpoint?: string, requestOverride?: LatestRequestLease): Promise<void> {
    const ownsRequest = requestOverride == null;
    const request = requestOverride ?? actionRequestsRef.current!.start();
    if (ownsRequest) {
      setLoading(false);
      setBuildLoading(false);
      clearPendingSearchQuery();
    }
    const target = endpoint ?? missing?.statusEndpoint ?? "/api/public/disclosure/corpcodes/status";
    try {
      const res = await fetch(target, { cache: "no-store", signal: request.signal });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!isMountedRef.current || !request.isCurrent()) return;
      if (!res.ok && res.status !== 409) return;
      if (res.ok && raw && typeof raw === "object" && raw.exists === true) {
        setMissing(null);
        return;
      }
      setMissing(raw as MissingIndexPayload);
    } catch (error) {
      if (!request.isCurrent() || (error instanceof Error && error.name === "AbortError")) return;
      // Ignore status polling failures; explicit search error handles user feedback.
    } finally {
      if (ownsRequest) request.finish();
    }
  }

  const search = useCallback(async (queryOverride?: string, requestOverride?: LatestRequestLease): Promise<void> => {
    const ownsRequest = requestOverride == null;
    const request = requestOverride ?? actionRequestsRef.current!.start();
    if (ownsRequest) setBuildLoading(false);
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
      setLoading(false);
      clearPendingSearchQuery();
      if (ownsRequest) request.finish();
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
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, {
        cache: "no-store",
        signal: request.signal,
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!isMountedRef.current || !request.isCurrent()) return;

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
    } catch (fetchError) {
      if (!isMountedRef.current || !request.isCurrent() || (fetchError instanceof Error && fetchError.name === "AbortError")) return;
      setError("검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
      setItems([]);
      setActiveSearchQuery(query);
      clearPendingSearchQuery();
    } finally {
      if (isMountedRef.current && request.isCurrent()) setLoading(false);
      if (ownsRequest) request.finish();
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
    const restoreTimer = window.setTimeout(() => {
      setQ((current) => (current === draftQuery ? current : draftQuery));
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [isDev, isHydrated, q]);

  useLayoutEffect(() => {
    if (!isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (!urlQuery) return;

    const lastSuccessfulSnapshot = readFreshStoredSearchSnapshot(
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS,
    );
    if (lastSuccessfulSnapshot && lastSuccessfulSnapshot.query === urlQuery) {
      return scheduleSearchRestore(() => {
        setQ((current) => (current === urlQuery ? current : urlQuery));
        setActiveSearchQuery(urlQuery);
        setHasSearched(true);
        setLoading(false);
        setError("");
        setNotice("");
        setMissing(null);
        setItems(lastSuccessfulSnapshot.items);
      });
    }

    return scheduleSearchRestore(() => {
      void search(urlQuery);
    });
  }, [isHydrated, scheduleSearchRestore, search, urlQuery]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;

    const pendingQuery = readFreshStoredSearchQuery(
      DART_PENDING_SEARCH_QUERY_STORAGE_KEY,
      DART_PENDING_SEARCH_QUERY_MAX_AGE_MS,
    );
    clearPendingSearchQuery();
    if (!pendingQuery) return;

    return scheduleSearchRestore(() => {
      void search(pendingQuery);
    });
  }, [clearPendingSearchQuery, isDev, isHydrated, scheduleSearchRestore, search]);

  useLayoutEffect(() => {
    if (!isDev || !isHydrated || didRestoreSearchRef.current) return;
    if (typeof window === "undefined" || window.location.pathname !== "/public/dart") return;
    if (!isReloadNavigation()) return;

    const lastSuccessfulSnapshot = readFreshStoredSearchSnapshot(
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_SNAPSHOT_MAX_AGE_MS,
    );
    if (lastSuccessfulSnapshot) {
      return scheduleSearchRestore(() => {
        setQ((current) => (current === lastSuccessfulSnapshot.query ? current : lastSuccessfulSnapshot.query));
        setActiveSearchQuery(lastSuccessfulSnapshot.query);
        setHasSearched(true);
        setLoading(false);
        setError("");
        setNotice("");
        setMissing(null);
        setItems(lastSuccessfulSnapshot.items);
      });
    }

    const lastSuccessfulQuery = readFreshStoredSearchQuery(
      DART_LAST_SUCCESSFUL_SEARCH_QUERY_STORAGE_KEY,
      DART_LAST_SUCCESSFUL_SEARCH_QUERY_MAX_AGE_MS,
    );
    if (!lastSuccessfulQuery) return;

    return scheduleSearchRestore(() => {
      void search(lastSuccessfulQuery);
    });
  }, [isDev, isHydrated, scheduleSearchRestore, search]);

  function toggleFavorite(item: SearchItem) {
    const exists = favoriteCorpCodes.has(item.corpCode);
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
      // Keep the current UI if persistence fails.
    }
    refreshLocalLists();
  }


  async function buildIndex() {
    const request = actionRequestsRef.current!.start();
    const endpoint = missing?.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    setLoading(false);
    setBuildLoading(true);
    clearPendingSearchQuery();
    setNotice("");
    setError("");
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store", signal: request.signal });
      const raw = (await res.json()) as BuildResult;
      if (!isMountedRef.current || !request.isCurrent()) return;
      if (!res.ok || raw.ok !== true) {
        setError(typeof raw.message === "string" ? raw.message : "인덱스 생성에 실패했습니다.");
        return;
      }

      const count = raw.status?.meta?.count;
      const generatedAt = raw.status?.meta?.generatedAt ?? "-";
      setNotice(`인덱스 생성 완료 (count=${typeof count === "number" ? count : "-"}, generatedAt=${generatedAt})`);
      await continueDartBuildAction({
        request,
        reloadStatus: async (ownedRequest) => {
          await reloadStatus(missing?.statusEndpoint, ownedRequest);
        },
        ...(normalizeDartSearchQuery(q)
          ? {
              search: async (ownedRequest: LatestRequestLease) => {
                await search(undefined, ownedRequest);
              },
            }
          : {}),
      });
    } catch (error) {
      if (!isMountedRef.current || !request.isCurrent() || (error instanceof Error && error.name === "AbortError")) return;
      setError("인덱스 생성 중 오류가 발생했습니다.");
    } finally {
      if (isMountedRef.current && request.isCurrent()) setBuildLoading(false);
      request.finish();
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="DART 공시 분석"
        description="관심 기업을 현재 검색 기준으로 다시 찾고, 개황 확인이나 공시 모니터링으로 이어 보는 화면입니다."
      />
      <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
        이 화면은 투자 결론을 확정하는 곳이 아니라, 관심 기업의 공시 흐름과 기본 정보를 다시 확인하는 단계입니다.
        먼저 회사를 고른 뒤 기업 개황이나 공시 모니터링으로 이어서 읽어 보세요.
      </p>

      <div className="flex items-center gap-2 mb-8">
        <button
          type="button"
          onClick={() => setTabOverride("search")}
          disabled={!isHydrated}
          className={cn(
            "rounded-full px-6 py-2.5 text-sm font-black transition-all shadow-sm active:scale-95",
            tab === "search" ? "bg-primary text-white shadow-navy/10" : "bg-white text-slate-500 border border-slate-200 hover:bg-surface-muted",
            !isHydrated ? "cursor-wait opacity-70" : "",
          )}
        >
          기업 검색
        </button>
        <button
          type="button"
          onClick={() => setTabOverride("monitor")}
          disabled={!isHydrated}
          className={cn(
            "rounded-full px-6 py-2.5 text-sm font-black transition-all shadow-sm active:scale-95",
            tab === "monitor" ? "bg-primary text-white shadow-navy/10" : "bg-white text-slate-500 border border-slate-200 hover:bg-surface-muted",
            !isHydrated ? "cursor-wait opacity-70" : "",
          )}
        >
          공시 모니터링
        </button>
      </div>

      {tab === "search" ? (
        <DartSearchPanel
          isDev={isDev}
          isHydrated={isHydrated}
          q={q}
          activeSearchQuery={activeSearchQuery}
          loading={loading}
          error={error}
          notice={notice}
          items={items}
          missing={missing}
          hasSearched={hasSearched}
          buildLoading={buildLoading}
          favoritesOpen={favoritesOpen}
          recentOpen={recentOpen}
          favorites={favorites}
          recent={recent}
          recentSearches={recentSearches}
          favoriteCorpCodes={favoriteCorpCodes}
          setQ={setQ}
          setFavoritesOpen={setFavoritesOpen}
          setRecentOpen={setRecentOpen}
          search={search}
          clearLastSuccessfulSearchQuery={clearLastSuccessfulSearchQuery}
          clearLastSuccessfulSearchSnapshot={clearLastSuccessfulSearchSnapshot}
          rememberSearchDraftQuery={rememberSearchDraftQuery}
          refreshLocalLists={refreshLocalLists}
          buildIndex={buildIndex}
          buildCompanyHref={buildCompanyHref}
          rememberPendingCompanyHref={rememberPendingCompanyHref}
          toggleFavorite={toggleFavorite}
        />
      ) : (
        <div className="mt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <DartDisclosureMonitorClient />
        </div>
      )}
    </PageShell>
  );
}
