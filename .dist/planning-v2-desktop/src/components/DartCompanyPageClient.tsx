"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
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

function normalizeCorpCode(value: string | null): string {
  return (value ?? "").trim();
}

export function DartCompanyPageClient() {
  const searchParams = useSearchParams();
  const corpCode = normalizeCorpCode(searchParams.get("corpCode"));
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
        setError("corpCode 쿼리가 필요합니다.");
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
            setError(raw.error?.message ?? "기업개황을 불러오지 못했습니다.");
          }
          return;
        }

        const data = raw.data ?? {};
        if (!cancelled) {
          setCompany(data);
          setFavoriteOn(isFavorite(corpCode));
          pushRecent({
            corpCode,
            corpName: data.corpName,
          });
          refreshLists();
        }
      } catch {
        if (!cancelled) {
          setCompany(null);
          setError("기업개황을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [corpCode, refreshLists]);

  const title = useMemo(() => company?.corpName ?? corpCode ?? "기업개황", [company?.corpName, corpCode]);

  function toggleFavorite() {
    if (!corpCode) return;
    if (favoriteOn) {
      removeFavorite(corpCode);
      setFavoriteOn(false);
    } else {
      addFavorite({
        corpCode,
        corpName: company?.corpName,
      });
      setFavoriteOn(true);
    }
    refreshLists();
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
            <Link href="/public/dart" className="text-xs text-slate-600 underline underline-offset-2">검색으로 돌아가기</Link>
            <Button size="sm" onClick={toggleFavorite} disabled={!corpCode}>
              {favoriteOn ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            </Button>
          </div>
          {loading ? <p className="mt-3 text-sm text-slate-600">기업개황 조회 중...</p> : null}
          {error ? <p data-testid="dart-company-error" className="mt-3 text-sm text-rose-700">{error}</p> : null}

          {!loading && !error && company ? (
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div><dt className="text-slate-500">회사명</dt><dd data-testid="dart-company-name" className="font-medium text-slate-900">{company.corpName ?? "-"}</dd></div>
              <div><dt className="text-slate-500">corp_code</dt><dd>{company.corpCode ?? "-"}</dd></div>
              <div><dt className="text-slate-500">종목코드</dt><dd>{company.stockCode ?? "-"}</dd></div>
              <div><dt className="text-slate-500">대표자</dt><dd>{company.ceo ?? "-"}</dd></div>
              <div><dt className="text-slate-500">업종코드</dt><dd>{company.industry ?? "-"}</dd></div>
              <div><dt className="text-slate-500">홈페이지</dt><dd>{company.homepage ?? "-"}</dd></div>
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
                    <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block">
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
                    <Link href={`/public/dart/company?corpCode=${encodeURIComponent(item.corpCode)}`} className="block">
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
