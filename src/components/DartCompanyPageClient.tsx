"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
  const monitorActionClassName = useMemo(
    () => "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-transparent px-4 text-xs font-bold text-slate-700 transition-all duration-300 hover:scale-[1.02] hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 active:scale-95",
    [],
  );

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
    <main data-testid="dart-company-root" className="py-8">
      <Container>
        <SectionHeader
          title={title}
          subtitle="OpenDART 기업개황"
          icon="/icons/ic-dashboard.png"
        />

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={searchBackHref}
              className="text-xs text-slate-600 underline underline-offset-2"
              onClick={() => clearPendingCompanyHref()}
            >
              {fromQuery ? "검색 결과로 돌아가기" : "검색으로 돌아가기"}
            </Link>
            {corpCode ? (
              <Link
                href={monitorHref}
                prefetch={false}
                data-testid="dart-monitor-action"
                className={monitorActionClassName}
                onClick={() => prepareMonitorNavigation()}
              >
                {favoriteOn ? "공시 모니터링으로 보기" : "모니터링에 추가하고 보기"}
              </Link>
            ) : (
              <Button
                data-testid="dart-monitor-action"
                size="sm"
                variant="ghost"
                disabled
              >
                공시 모니터링으로 보기
              </Button>
            )}
            <Button size="sm" onClick={toggleFavorite} disabled={!corpCode}>
              {favoriteOn ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            </Button>
          </div>
          {fromQuery ? (
            <p className="mt-2 text-xs text-slate-500">
              직전 검색어: <span className="font-semibold text-slate-700">{fromQuery}</span>
            </p>
          ) : null}
          {!favoriteOn && corpCode ? (
            <p className="mt-2 text-xs text-slate-500">
              모니터링 탭은 즐겨찾기 기업 기준으로 묶어 보여줍니다. 버튼을 누르면 이 회사를 즐겨찾기에 담고 모니터링 탭으로 이동합니다.
            </p>
          ) : null}
          {loading ? <p className="mt-3 text-sm text-slate-600">기업개황 조회 중...</p> : null}
          {error ? (
            <EmptyState
              title={corpCode ? "기업 정보를 불러오지 못했습니다" : "회사 선택이 필요합니다"}
              description={error}
              icon="search"
              className="mt-4 rounded-2xl border-slate-200 bg-slate-50/80 p-8"
            />
          ) : null}

          {!loading && !error && company ? (
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div><dt className="text-slate-500">회사명</dt><dd data-testid="dart-company-name" className="font-medium text-slate-900">{company.corpName ?? "-"}</dd></div>
              <div><dt className="text-slate-500">corp_code</dt><dd>{company.corpCode ?? "-"}</dd></div>
              <div><dt className="text-slate-500">종목코드</dt><dd>{company.stockCode ?? "-"}</dd></div>
              <div><dt className="text-slate-500">대표자</dt><dd>{company.ceo ?? "-"}</dd></div>
              <div><dt className="text-slate-500">업종코드</dt><dd>{company.industry ?? "-"}</dd></div>
              <div>
                <dt className="text-slate-500">홈페이지</dt>
                <dd>
                  {homepageHref ? (
                    <a href={homepageHref} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline underline-offset-2">
                      {company.homepage ?? homepageHref}
                    </a>
                  ) : (company.homepage ?? "-")}
                </dd>
              </div>
              <div><dt className="text-slate-500">주소</dt><dd>{company.address ?? "-"}</dd></div>
              <div><dt className="text-slate-500">출처</dt><dd>{company.source ?? "-"}</dd></div>
            </dl>
          ) : null}
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">즐겨찾기</h2>
              <span className="text-xs text-slate-500">{favorites.length}건</span>
            </div>
            {favorites.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">즐겨찾기한 회사가 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {favorites.map((item) => (
                  <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-2">
                      <Link href={buildDartCompanyHref(item.corpCode, undefined, item.corpName)} className="block">
                        <p className="text-sm font-medium text-slate-900">{item.corpName ?? item.corpCode}</p>
                        <p className="text-xs text-slate-600">{item.corpCode}</p>
                      </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">최근 조회</h2>
              <Button size="sm" variant="ghost" onClick={() => { clearRecent(); refreshLists(); }}>
                최근 기록 지우기
              </Button>
            </div>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">최근 조회 기록이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {recent.map((item) => (
                  <li key={item.corpCode} className="rounded-xl border border-border bg-surface-muted p-2">
                      <Link href={buildDartCompanyHref(item.corpCode, undefined, item.corpName)} className="block">
                        <p className="text-sm font-medium text-slate-900">{item.corpName ?? item.corpCode}</p>
                        <p className="text-xs text-slate-600">{item.corpCode}</p>
                      </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Container>
    </main>
  );
}
