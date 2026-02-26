"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
    <main className="py-8">
      <Container>
        <SectionHeader
          title="OpenDART 기업 검색"
          subtitle="회사명을 검색해 기업개황 페이지로 이동합니다."
          icon="/icons/ic-dashboard.png"
        />

        <Card>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("search")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "search" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
            >
              기업 검색
            </button>
            <button
              type="button"
              onClick={() => setTab("monitor")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "monitor" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
            >
              공시 모니터링
            </button>
          </div>
        </Card>

        {tab === "search" ? (
          <>
            <Card className="mt-4">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void search();
                }}
              >
                <label className="text-sm">
                  회사명 검색
                  <input
                    className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                    value={q}
                    onChange={(event) => setQ(event.target.value)}
                    placeholder="예: 삼성전자"
                  />
                </label>
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "검색 중..." : "검색"}
                </Button>
              </form>
              {notice ? <p className="mt-2 text-xs text-emerald-700">{notice}</p> : null}
              {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
            </Card>

            {missing ? (
              <Card className="mt-4">
                <p className="text-sm font-semibold text-slate-800">CORPCODES_INDEX_MISSING</p>
                <div className="mt-2 space-y-1 text-xs text-slate-700">
                  <p>message: {missing.message ?? "-"}</p>
                  <p>hintCommand: {missing.hintCommand ?? "-"}</p>
                  <p>primaryPath: {missing.primaryPath ?? "-"}</p>
                  <p>triedPaths: {Array.isArray(missing.triedPaths) ? missing.triedPaths.join(" | ") : "-"}</p>
                  <p>canAutoBuild: {typeof missing.canAutoBuild === "boolean" ? String(missing.canAutoBuild) : "-"}</p>
                  <p>autoBuildDisabledReason: {missing.autoBuildDisabledReason ?? "-"}</p>
                  <p>buildEndpoint: {missing.buildEndpoint ?? "-"}</p>
                  <p>statusEndpoint: {missing.statusEndpoint ?? "-"}</p>
                </div>

                {isDev && missing.canAutoBuild === true ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => void buildIndex()}
                      disabled={buildLoading}
                    >
                      {buildLoading ? "인덱스 생성 중..." : "인덱스 자동 생성"}
                    </Button>
                  </div>
                ) : null}
              </Card>
            ) : null}

            <Card className="mt-4">
              <h2 className="text-base font-semibold text-slate-900">검색 결과</h2>
              {!loading && !error && items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">검색 결과가 없습니다.</p>
              ) : null}
              {items.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-3">
                      <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block">
                        <p className="text-sm font-semibold text-slate-900">{item.corpName}</p>
                        <p className="text-xs text-slate-600">
                          corp_code {item.corpCode}
                          {item.stockCode ? ` · 종목코드 ${item.stockCode}` : " · 비상장"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setFavoritesOpen((prev) => !prev)}
                    className="text-left text-base font-semibold text-slate-900"
                  >
                    즐겨찾기 {favoritesOpen ? "접기" : "펼치기"}
                  </button>
                  <span className="text-xs text-slate-500">{favorites.length}건</span>
                </div>
                {favoritesOpen ? (
                  favorites.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">즐겨찾기한 회사가 없습니다.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {favorites.map((item) => (
                        <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-2">
                          <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block">
                            <p className="text-sm font-medium text-slate-900">{item.corpName ?? item.corpCode}</p>
                            <p className="text-xs text-slate-600">{item.corpCode}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </Card>

              <Card>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setRecentOpen((prev) => !prev)}
                    className="text-left text-base font-semibold text-slate-900"
                  >
                    최근 기록 {recentOpen ? "접기" : "펼치기"}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      clearRecent();
                      refreshLocalLists();
                    }}
                    disabled={recent.length === 0}
                  >
                    비우기
                  </Button>
                </div>
                {recentOpen ? (
                  recent.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">최근 기록이 없습니다.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {recent.map((item) => (
                        <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-2">
                          <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block">
                            <p className="text-sm font-medium text-slate-900">{item.corpName ?? item.corpCode}</p>
                            <p className="text-xs text-slate-600">{item.corpCode}</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </Card>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <DartDisclosureMonitorClient />
          </div>
        )}
      </Container>
    </main>
  );
}
