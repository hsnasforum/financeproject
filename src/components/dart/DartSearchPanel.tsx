import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { clearRecent, clearRecentSearches } from "@/lib/dart/dartStore";
import { cn } from "@/lib/utils";
import type {
  DartLocalLists,
  MissingIndexPayload,
  SearchItem,
} from "@/components/dart/dartSearchModel";

type DartSearchPanelProps = {
  isDev: boolean;
  isHydrated: boolean;
  q: string;
  activeSearchQuery: string;
  loading: boolean;
  error: string;
  notice: string;
  items: SearchItem[];
  missing: MissingIndexPayload | null;
  hasSearched: boolean;
  buildLoading: boolean;
  favoritesOpen: boolean;
  recentOpen: boolean;
  favorites: DartLocalLists["favorites"];
  recent: DartLocalLists["recent"];
  recentSearches: DartLocalLists["recentSearches"];
  favoriteCorpCodes: ReadonlySet<string>;
  setQ: Dispatch<SetStateAction<string>>;
  setFavoritesOpen: Dispatch<SetStateAction<boolean>>;
  setRecentOpen: Dispatch<SetStateAction<boolean>>;
  search: (queryOverride?: string) => Promise<void>;
  clearLastSuccessfulSearchQuery: () => void;
  clearLastSuccessfulSearchSnapshot: () => void;
  rememberSearchDraftQuery: (query: string) => void;
  refreshLocalLists: () => void;
  buildIndex: () => Promise<void>;
  buildCompanyHref: (corpCode: string, fromQuery?: string, corpName?: string) => string;
  rememberPendingCompanyHref: (href: string) => void;
  toggleFavorite: (item: SearchItem) => void;
};

export function DartSearchPanel({
  isDev,
  isHydrated,
  q,
  activeSearchQuery,
  loading,
  error,
  notice,
  items,
  missing,
  hasSearched,
  buildLoading,
  favoritesOpen,
  recentOpen,
  favorites,
  recent,
  recentSearches,
  favoriteCorpCodes,
  setQ,
  setFavoritesOpen,
  setRecentOpen,
  search,
  clearLastSuccessfulSearchQuery,
  clearLastSuccessfulSearchSnapshot,
  rememberSearchDraftQuery,
  refreshLocalLists,
  buildIndex,
  buildCompanyHref,
  rememberPendingCompanyHref,
  toggleFavorite,
}: DartSearchPanelProps) {
  return (
    <>
          <Card className="mb-8 rounded-[2rem] p-8 shadow-sm">
            <form
              className="flex flex-col sm:flex-row items-end gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!isHydrated) return;
                void search();
              }}
            >
              <div className="w-full sm:flex-1 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  회사명 검색
                </label>
                <input
                  data-testid="dart-search-input"
                  className="block w-full h-12 rounded-2xl border border-slate-200 bg-surface-muted/50 px-5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary focus:bg-white transition-all shadow-inner"
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
                  placeholder="예: 삼성전자, 카카오, 네이버"
                />
              </div>
              <Button
                data-testid="dart-search-submit"
                type={isHydrated ? "submit" : "button"}
                variant="primary"
                className="h-12 px-10 rounded-2xl font-black shadow-md w-full sm:w-auto"
                disabled={!isHydrated || loading}
              >
                {loading ? "검색 중..." : "지금 기준으로 찾기"}
              </Button>
            </form>

            {notice ? <p className="mt-4 text-xs font-black text-primary bg-primary/5 p-3 rounded-xl">{notice}</p> : null}
            {error ? <p className="mt-4 text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">{error}</p> : null}

            <div className="mt-6 border-t border-slate-50 pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">최근 검색어</p>
                  {recentSearches.length === 0 ? (
                    <p className="text-xs font-medium text-slate-400 italic">
                      검색 기록이 없습니다.
                    </p>
                  ) : (
                    <div data-testid="dart-recent-searches" className="flex flex-wrap gap-2">
                      {recentSearches.map((item) => (
                        <button
                          key={item.query}
                          data-testid="dart-recent-search-chip"
                          type="button"
                          className="rounded-full border border-slate-100 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 transition-all hover:border-primary/20 hover:text-primary shadow-sm disabled:opacity-50"
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
                    className="h-8 self-start px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500"
                    onClick={() => {
                      clearRecentSearches();
                      refreshLocalLists();
                    }}
                  >
                    기록 비우기
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          {missing ? (
            <Card className="mb-8 rounded-[2rem] border-amber-100 bg-amber-50/30 p-8">
              <div data-testid="dart-missing-index" className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-base font-black text-amber-800 tracking-tight">검색 준비가 더 필요합니다</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-amber-700/80">
                    DART 기업 코드를 아직 불러오지 못해 회사 검색을 바로 진행할 수 없습니다. 잠시 후 다시 시도해 보세요.
                  </p>
                  {isDev && (missing.message || missing.primaryPath) ? (
                    <details className="mt-4 rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2">
                      <summary className="cursor-pointer list-none text-[11px] font-semibold text-amber-700 marker:hidden">
                        개발용 인덱스 정보
                      </summary>
                      <div className="mt-2 space-y-1 text-[11px] font-medium leading-relaxed text-amber-800">
                        {missing.message ? <p>상태 메시지: {missing.message}</p> : null}
                        {missing.primaryPath ? <p>주 경로: <span className="font-mono">{missing.primaryPath}</span></p> : null}
                      </div>
                    </details>
                  ) : null}
                </div>

                {isDev && missing.canAutoBuild === true ? (
                  <Button
                    data-testid="dart-build-index-button"
                    variant="primary"
                    className="bg-amber-700 hover:bg-amber-800 text-white border-none rounded-2xl px-8 h-12 font-black shadow-lg shadow-amber-200 shrink-0"
                    onClick={() => void buildIndex()}
                    disabled={buildLoading}
                  >
                    {buildLoading ? "준비 중..." : "검색 준비 자동 생성"}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-3 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-[2rem] p-0 overflow-hidden shadow-sm border-slate-100">
                <div data-testid="dart-search-results">
                  <div className="bg-surface-muted/50 px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                     <SubSectionHeader title="검색 결과" description="기업 개황이나 공시 모니터링으로 이어 갈 회사를 고르세요." className="mb-0" />
                     {items.length > 0 && <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-100">{items.length}건</span>}
                  </div>

                  {loading && items.length === 0 ? (
                    <div className="p-20">
                      <LoadingState title="회사 정보를 찾는 중입니다" />
                    </div>
                  ) : null}

                  {!loading && !error && !missing && items.length === 0 && !hasSearched ? (
                    <div data-testid="dart-search-idle" className="p-20 text-center">
                      <p className="text-base font-black text-navy tracking-tight">회사명을 입력하고 검색해 보세요</p>
                      <p className="mt-2 text-sm font-medium text-slate-400">현재 공시 기준으로 회사 개황과 최근 공시 흐름을 이어서 확인할 수 있습니다.</p>
                    </div>
                  ) : null}

                  {!loading && !error && !missing && items.length === 0 && hasSearched ? (
                    <div data-testid="dart-search-empty" className="p-20 text-center bg-surface-muted/30">
                      <p className="text-base font-black text-navy tracking-tight">검색 결과가 없습니다</p>
                      <p className="mt-2 text-sm font-medium text-slate-400">정확한 회사명이나 줄임말(예: 삼성전자)로 다시 시도해 보세요.</p>
                    </div>
                  ) : null}

                  {items.length > 0 ? (
                    <ul className="divide-y divide-slate-50 bg-white">
                      {items.map((item) => (
                        <li key={item.corpCode}>
                          <div className="flex items-center gap-4 p-5 px-8 transition-all hover:bg-primary/30 group">
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
                                 <p className="text-lg font-black text-navy group-hover:text-primary transition-colors tracking-tight">{item.corpName}</p>
                                 <div className="mt-1 flex items-center gap-3">
                                   <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">DART {item.corpCode}</span>
                                   {item.stockCode ? (
                                     <span className="rounded-lg bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-black text-slate-500">KRX {item.stockCode}</span>
                                   ) : (
                                     <span className="rounded-lg bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-slate-400">비상장</span>
                                   )}
                                 </div>
                              </div>
                              <div className="ml-4 shrink-0 rounded-2xl bg-surface-muted p-2 text-slate-300 group-hover:bg-primary group-hover:text-white transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                              </div>
                            </a>
                            <button
                              data-testid="dart-search-favorite-toggle"
                              type="button"
                              className={cn(
                                "shrink-0 rounded-full border px-4 py-2 text-[11px] font-black transition-all active:scale-95 shadow-sm",
                                favoriteCorpCodes.has(item.corpCode)
                                  ? "border-primary/20 bg-primary text-white"
                                  : "border-slate-200 bg-white text-slate-500 hover:border-primary/30 hover:text-primary"
                              )}
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
            </div>

            <div className="space-y-6">
              <Card className="rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
                <button
                  type="button"
                  onClick={() => setFavoritesOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between bg-surface-muted/50 px-6 py-5 border-b border-slate-100 group"
                >
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-amber-100 p-1.5 text-amber-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </div>
                    <span className="text-sm font-black text-navy uppercase tracking-widest">즐겨찾기</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-100">{favorites.length}</span>
                </button>
                {favoritesOpen && (
                  <div className="bg-white">
                    {favorites.length === 0 ? (
                      <p className="p-10 text-xs font-bold text-center text-slate-300 italic">저장된 회사가 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100">
                        {favorites.map((item) => (
                          <li key={item.corpCode}>
                            <a
                              href={buildCompanyHref(item.corpCode)}
                              className="block p-4 px-6 hover:bg-surface-muted transition-colors"
                              onClick={(event) => {
                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                                rememberPendingCompanyHref(buildCompanyHref(item.corpCode));
                              }}
                            >
                              <p className="text-sm font-black text-slate-800 tracking-tight leading-tight">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.corpCode}</p>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>

              <Card className="rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
                <div className="flex items-center justify-between bg-surface-muted/50 px-6 py-5 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRecentOpen((prev) => !prev)}
                    className="flex items-center gap-2 group"
                  >
                    <div className="rounded-xl bg-slate-200 p-1.5 text-slate-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <span className="text-sm font-black text-navy uppercase tracking-widest">최근 기록</span>
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                    onClick={() => {
                      clearRecent();
                      refreshLocalLists();
                    }}
                    disabled={recent.length === 0}
                  >
                    Clear
                  </button>
                </div>
                {recentOpen && (
                  <div className="bg-white">
                    {recent.length === 0 ? (
                      <p className="p-10 text-xs font-bold text-center text-slate-300 italic">조회 기록이 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100">
                        {recent.map((item) => (
                          <li key={item.corpCode}>
                            <a
                              href={buildCompanyHref(item.corpCode)}
                              className="block p-4 px-6 hover:bg-surface-muted transition-colors"
                              onClick={(event) => {
                                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                                rememberPendingCompanyHref(buildCompanyHref(item.corpCode));
                              }}
                            >
                              <p className="text-sm font-black text-slate-800 tracking-tight leading-tight">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.corpCode}</p>
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
  );
}
