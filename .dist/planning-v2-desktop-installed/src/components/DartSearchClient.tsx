"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { DartDisclosureMonitorClient } from "@/components/DartDisclosureMonitorClient";
import { clearRecent, listFavorites, listRecent, type DartFavorite, type DartRecent } from "@/lib/dart/dartStore";

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

export function DartSearchClient() {
  const isDev = process.env.NODE_ENV !== "production";
  const [tab, setTab] = useState<"search" | "monitor">("search");
  const [q, setQ] = useState("삼성");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [missing, setMissing] = useState<MissingIndexPayload | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [favorites, setFavorites] = useState<DartFavorite[]>([]);
  const [recent, setRecent] = useState<DartRecent[]>([]);

  const refreshLocalLists = useCallback(() => {
    setFavorites(listFavorites());
    setRecent(listRecent());
  }, []);

  useEffect(() => {
    refreshLocalLists();
    const onStorage = () => refreshLocalLists();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshLocalLists]);

  async function reloadStatus(endpoint?: string): Promise<void> {
    const target = endpoint ?? missing?.statusEndpoint ?? "/api/public/disclosure/corpcodes/status";
    try {
      const res = await fetch(target, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
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

  async function search() {
    const query = q.trim();
    if (!query) {
      setError("검색어를 입력하세요.");
      setItems([]);
      return;
    }

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

      if (!res.ok) {
        const missingPayload = raw as MissingIndexPayload;
        if (res.status === 409 || missingPayload.error === "CORPCODES_INDEX_MISSING") {
          setMissing(missingPayload);
          setError(missingPayload.message ?? "corpCodes 인덱스가 없습니다.");
          setItems([]);
          return;
        }
        setError(typeof raw.message === "string" ? raw.message : "검색에 실패했습니다.");
        setItems([]);
        return;
      }

      const rows = Array.isArray(raw.items) ? raw.items : [];
      const normalized = rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const corpCode = typeof item.corpCode === "string" ? item.corpCode : "";
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

      setItems(normalized);
    } catch {
      setError("검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도하세요.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function buildIndex() {
    const endpoint = missing?.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    setBuildLoading(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const raw = (await res.json()) as BuildResult;
      if (!res.ok || raw.ok !== true) {
        setError(typeof raw.message === "string" ? raw.message : "인덱스 생성에 실패했습니다.");
        return;
      }

      const count = raw.status?.meta?.count;
      const generatedAt = raw.status?.meta?.generatedAt ?? "-";
      setNotice(`인덱스 생성 완료 (count=${typeof count === "number" ? count : "-"}, generatedAt=${generatedAt})`);
      await reloadStatus(missing?.statusEndpoint);
      if (q.trim()) {
        await search();
      }
    } catch {
      setError("인덱스 생성 중 오류가 발생했습니다.");
    } finally {
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
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="예: 삼성전자"
                />
              </div>
              <Button data-testid="dart-search-submit" type="submit" variant="primary" className="h-12 px-8 rounded-xl shadow-sm w-full sm:w-auto" disabled={loading}>
                {loading ? "검색 중..." : "검색"}
              </Button>
            </form>
            {notice ? <p className="mt-3 text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg">{notice}</p> : null}
            {error ? <p className="mt-3 text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-lg">{error}</p> : null}
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
                {!loading && !error && items.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 text-sm font-medium">검색 결과가 없습니다.</div>
                ) : null}
                {items.length > 0 ? (
                  <ul className="divide-y divide-border/50 bg-surface">
                    {items.map((item) => (
                      <li key={item.corpCode}>
                        <Link
                          data-testid="dart-search-item"
                          href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`}
                          className="flex items-center justify-between p-4 px-6 hover:bg-surface-muted transition-colors group"
                        >
                          <div>
                             <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{item.corpName}</p>
                             <p className="text-xs text-slate-500 mt-1">
                               DART {item.corpCode}
                               {item.stockCode ? <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px]">KRX {item.stockCode}</span> : <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[10px]">비상장</span>}
                             </p>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all"><path d="m9 18 6-6-6-6"/></svg>
                        </Link>
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
                            <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block p-3 px-5 hover:bg-surface-muted transition-colors">
                              <p className="text-xs font-bold text-slate-900">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{item.corpCode}</p>
                            </Link>
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
                            <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block p-3 px-5 hover:bg-surface-muted transition-colors">
                              <p className="text-xs font-bold text-slate-900">{item.corpName ?? item.corpCode}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{item.corpCode}</p>
                            </Link>
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
