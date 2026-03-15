"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { buildDartCompanyHref, buildDartMonitorHref, buildDartSearchHref, normalizeDartCorpCode, normalizeDartCorpName, normalizeDartSearchQuery } from "@/lib/dart/query";
import {
  addFavorite,
  clearRecent,
  isFavorite,
  listFavorites,
  listRecent,
  pushRecent,
  removeFavorite,
  type DartFavorite,
  type DartRecent,
} from "@/lib/dart/dartStore";
import { cn } from "@/lib/utils";

type CompanyView = {
  corpCode?: string;
  corpName?: string;
  stockCode?: string;
  industry?: string;
  ceo?: string;
  homepage?: string;
  address?: string;
  source?: string;
  fetchedAt?: string;
};

type CompanyResponse = {
  ok?: boolean;
  data?: CompanyView;
  error?: {
    code?: string;
    message?: string;
  };
};

const DART_PENDING_COMPANY_HREF_STORAGE_KEY = "dart:pending-company-href";

function normalizeCorpCode(value: string | null): string {
  return normalizeDartCorpCode(value);
}

function normalizeHomepageUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function clearPendingCompanyHref(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DART_PENDING_COMPANY_HREF_STORAGE_KEY);
  } catch {
    // Ignore storage failures and continue navigation.
  }
}

export function DartCompanyPageClient() {
  const searchParams = useSearchParams();
  const corpCode = normalizeCorpCode(searchParams.get("corpCode"));
  const fromQuery = normalizeDartSearchQuery(searchParams.get("fromQuery"));
  const requestedCorpName = normalizeDartCorpName(searchParams.get("corpName"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [company, setCompany] = useState<CompanyView | null>(null);
  const [favorites, setFavorites] = useState<DartFavorite[]>([]);
  const [recent, setRecent] = useState<DartRecent[]>([]);
  const [favoriteOn, setFavoriteOn] = useState(false);

  const refreshLists = useCallback(() => {
    setFavorites(listFavorites());
    setRecent(listRecent());
  }, []);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!corpCode) {
        setCompany(null);
        setError("회사 정보가 선택되지 않았습니다. 검색 화면에서 회사를 다시 선택해 주세요.");
        return;
      }

      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/public/disclosure/company?corpCode=${encodeURIComponent(corpCode)}`, { cache: "no-store" });
        const raw = (await res.json()) as CompanyResponse;
        if (!res.ok || !raw.ok) {
          if (!cancelled) {
            setCompany(null);
            setError(raw.error?.message ?? "기업개황을 불러오지 못했습니다. 잠시 후 다시 시도하거나 검색 화면으로 돌아가 다시 선택해 주세요.");
          }
          return;
        }

        const data = raw.data ?? {};
        if (!cancelled) {
          setCompany(data);
          setFavoriteOn(isFavorite(corpCode));
          if (data.corpName && isFavorite(corpCode)) {
            addFavorite({
              corpCode,
              corpName: data.corpName,
            });
          }
          pushRecent({
            corpCode,
            corpName: data.corpName ?? requestedCorpName,
          });
          refreshLists();
        }
      } catch {
        if (!cancelled) {
          setCompany(null);
          setError("기업개황을 불러오지 못했습니다. 잠시 후 다시 시도하거나 검색 화면으로 돌아가 다시 선택해 주세요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [corpCode, refreshLists, requestedCorpName]);

  const title = useMemo(() => company?.corpName ?? requestedCorpName ?? corpCode ?? "기업개황", [company?.corpName, corpCode, requestedCorpName]);
  const homepageHref = useMemo(() => normalizeHomepageUrl(company?.homepage), [company?.homepage]);
  const searchBackHref = useMemo(() => buildDartSearchHref(fromQuery), [fromQuery]);
  const monitorHref = useMemo(() => buildDartMonitorHref(corpCode, company?.corpName ?? requestedCorpName), [company?.corpName, corpCode, requestedCorpName]);

  function toggleFavorite() {
    if (!corpCode) return;
    if (favoriteOn) {
      removeFavorite(corpCode);
      setFavoriteOn(false);
    } else {
      addFavorite({
        corpCode,
        corpName: company?.corpName ?? requestedCorpName,
      });
      setFavoriteOn(true);
    }
    refreshLists();
  }

  function prepareMonitorNavigation() {
    clearPendingCompanyHref();
    if (!corpCode) return;
    if (!favoriteOn) {
      try {
        addFavorite({
          corpCode,
          corpName: company?.corpName ?? requestedCorpName,
        });
        setFavoriteOn(true);
        refreshLists();
      } catch {
        // Keep the monitor navigation even if favorites persistence fails.
      }
    }
  }

  return (
    <PageShell>
      <PageHeader
        title={title}
        description="DART 기업 개황 및 공시 모니터링 정보를 확인합니다."
        action={
          <div className="flex items-center gap-2">
            <Link href={searchBackHref} onClick={() => clearPendingCompanyHref()}>
              <Button size="sm" variant="outline" className="rounded-xl font-black">
                {fromQuery ? "결과로 돌아가기" : "검색으로 돌아가기"}
              </Button>
            </Link>
            <Button size="sm" variant="outline" className={cn("rounded-xl font-black transition-all", favoriteOn ? "border-emerald-200 text-emerald-600 bg-emerald-50" : "bg-white")} onClick={toggleFavorite} disabled={!corpCode}>
              {favoriteOn ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기 추가"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[2rem] p-8 shadow-sm">
            <SubSectionHeader title="기업 기본 정보" description="OpenDART 공식 연동 데이터입니다." />
            
            {loading ? (
              <div className="py-12">
                <LoadingState title="기업 정보를 불러오고 있습니다" />
              </div>
            ) : error ? (
              <EmptyState
                title={corpCode ? "정보를 불러오지 못했습니다" : "회사 선택이 필요합니다"}
                description={error}
                icon="search"
                className="mt-6 rounded-3xl border-slate-100 bg-slate-50/50 p-10"
              />
            ) : company ? (
              <div className="mt-8 space-y-8">
                <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">회사명</dt>
                    <dd className="text-base font-black text-slate-900 tracking-tight">{company.corpName ?? "-"}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DART 코드</dt>
                    <dd className="text-sm font-bold text-slate-600 font-mono tracking-wider">{company.corpCode ?? "-"}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">종목코드 (KRX)</dt>
                    <dd className="text-sm font-bold text-slate-600 font-mono tracking-wider">{company.stockCode ? `KRX ${company.stockCode}` : "비상장"}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">대표자</dt>
                    <dd className="text-sm font-bold text-slate-700">{company.ceo ?? "-"}</dd>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">주소</dt>
                    <dd className="text-sm font-bold text-slate-700 leading-relaxed">{company.address ?? "-"}</dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">홈페이지</dt>
                    <dd>
                      {homepageHref ? (
                        <a href={homepageHref} target="_blank" rel="noopener noreferrer" className="text-sm font-black text-emerald-600 underline underline-offset-4 decoration-emerald-200 hover:text-emerald-700 transition-colors">
                          {company.homepage || homepageHref}
                        </a>
                      ) : <span className="text-sm font-bold text-slate-400 italic">제공 정보 없음</span>}
                    </dd>
                  </div>
                  <div className="space-y-1">
                    <dt className="text-[10px] font-black text-slate-400 uppercase tracking-widest">데이터 출처</dt>
                    <dd className="text-xs font-bold text-slate-400 uppercase tracking-widest">{company.source ?? "OpenDART"}</dd>
                  </div>
                </dl>

                <div className="pt-8 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">공시 모니터링</p>
                    <p className="text-xs font-medium text-slate-500">이 기업의 실시간 공시 알림을 받고 싶으신가요?</p>
                  </div>
                  <Link
                    href={monitorHref}
                    prefetch={false}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-6 text-sm font-black text-white shadow-lg transition-all hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95"
                    onClick={() => prepareMonitorNavigation()}
                  >
                    공시 모니터링 탭으로 이동
                  </Link>
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
            <div className="bg-slate-50/50 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-black text-slate-900 uppercase tracking-widest">즐겨찾기 기업</span>
              <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-0.5 rounded-lg border border-slate-100">{favorites.length}</span>
            </div>
            <div className="bg-white">
              {favorites.length === 0 ? (
                <p className="p-10 text-xs font-bold text-center text-slate-300 italic">저장된 회사가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100">
                  {favorites.map((item) => (
                    <li key={item.corpCode}>
                      <Link
                        href={buildDartCompanyHref(item.corpCode, undefined, item.corpName)}
                        className={cn("block p-4 px-6 hover:bg-slate-50 transition-colors", item.corpCode === corpCode ? "bg-emerald-50/30 border-l-4 border-emerald-500" : "")}
                      >
                        <p className="text-sm font-black text-slate-800 tracking-tight leading-tight">{item.corpName ?? item.corpCode}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.corpCode}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
            <div className="bg-slate-50/50 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-black text-slate-900 uppercase tracking-widest">최근 조회 기록</span>
              <button
                type="button"
                className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                onClick={() => { clearRecent(); refreshLists(); }}
                disabled={recent.length === 0}
              >
                Clear
              </button>
            </div>
            <div className="bg-white">
              {recent.length === 0 ? (
                <p className="p-10 text-xs font-bold text-center text-slate-300 italic">기록이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-slate-50 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-100">
                  {recent.map((item) => (
                    <li key={item.corpCode}>
                      <Link
                        href={buildDartCompanyHref(item.corpCode, undefined, item.corpName)}
                        className={cn("block p-4 px-6 hover:bg-slate-50 transition-colors", item.corpCode === corpCode ? "bg-emerald-50/30 border-l-4 border-emerald-500" : "")}
                      >
                        <p className="text-sm font-black text-slate-800 tracking-tight leading-tight">{item.corpName ?? item.corpCode}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.corpCode}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
