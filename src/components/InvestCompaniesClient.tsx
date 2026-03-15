"use client";

import { useState } from "react";
import { SearchPill } from "@/components/ui/SearchPill";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterWrapper } from "@/components/ui/FilterWrapper";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";

type SearchItem = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

type SortKey = "name" | "name_desc" | "stock_first";

type CompanySummary = {
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

type IndexMeta = {
  loadedPath?: string;
  count?: number;
  generatedAt?: string;
};

const INDEX_HINT = "python3 scripts/dart_corpcode_build.py";

export function InvestCompaniesClient() {
  const isDev = process.env.NODE_ENV !== "production";
  const [queryInput, setQueryInput] = useState("삼성");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [indexMeta, setIndexMeta] = useState<IndexMeta | null>(null);
  const [indexMissing, setIndexMissing] = useState(false);
  const [canAutoBuild, setCanAutoBuild] = useState(false);
  const [autoBuildDisabledReason, setAutoBuildDisabledReason] = useState("");
  const [buildEndpoint, setBuildEndpoint] = useState("/api/public/disclosure/corpcodes/build");
  const [statusEndpoint] = useState("/api/public/disclosure/corpcodes/status");
  const [statusLoading, setStatusLoading] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<CompanySummary | null>(null);

  async function searchCompanies() {
    const query = queryInput.trim();
    if (!query) {
      setSearchError("회사명 검색어를 입력하세요.");
      setSearchItems([]);
      return;
    }

    setSearchLoading(true);
    setSearchError("");
    setCanAutoBuild(false);
    setAutoBuildDisabledReason("");
    setIndexMissing(false);
    setDetail(null);
    setDetailError("");
    setSelectedCode("");

    try {
      const params = new URLSearchParams({
        query,
        sort: sortKey,
        limit: "50",
      });
      if (isDev) {
        params.set("debug", "1");
      }
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        const message = typeof raw.message === "string" ? raw.message : "회사 검색에 실패했습니다.";
        const code = typeof raw.error === "string" ? raw.error : "";
        if (res.status === 409 || code === "CORPCODES_INDEX_MISSING") {
          setIndexMissing(true);
          setSearchError(`${message} 기본: ${INDEX_HINT}`);
          setCanAutoBuild(Boolean(raw.canAutoBuild));
          setAutoBuildDisabledReason(typeof raw.autoBuildDisabledReason === "string" ? raw.autoBuildDisabledReason : "");
          setBuildEndpoint(typeof raw.buildEndpoint === "string" ? raw.buildEndpoint : "/api/public/disclosure/corpcodes/build");
        } else {
          setSearchError(message);
        }
        setSearchItems([]);
        setIndexMeta(null);
        return;
      }

      const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
      const items = (itemsRaw as unknown[])
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const corpCode = typeof item.corpCode === "string" ? item.corpCode : "";
          const corpName = typeof item.corpName === "string" ? item.corpName : "";
          if (!corpCode || !corpName) return null;
          const result: SearchItem = {
            corpCode,
            corpName,
          };
          if (typeof item.stockCode === "string") {
            result.stockCode = item.stockCode;
          }
          return result;
        })
        .filter((value): value is SearchItem => value !== null);

      setSearchItems(items);
      setIndexMeta(typeof raw.indexMeta === "object" && raw.indexMeta !== null ? (raw.indexMeta as IndexMeta) : null);
    } catch (error) {
      console.error("[invest-companies] search failed", error);
      setSearchError("회사 검색에 실패했습니다. 잠시 후 다시 시도하세요.");
      setSearchItems([]);
      setIndexMeta(null);
      setIndexMissing(false);
    } finally {
      setSearchLoading(false);
    }
  }

  async function fetchIndexStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch(statusEndpoint, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const code = typeof raw.error === "string" ? raw.error : "";
        if (res.status === 409 || code === "CORPCODES_INDEX_MISSING") {
          setIndexMissing(true);
          setCanAutoBuild(Boolean(raw.canAutoBuild));
          setAutoBuildDisabledReason(typeof raw.autoBuildDisabledReason === "string" ? raw.autoBuildDisabledReason : "");
          setBuildEndpoint(typeof raw.buildEndpoint === "string" ? raw.buildEndpoint : "/api/public/disclosure/corpcodes/build");
        }
        return;
      }
    } catch (error) {
      console.error("[invest-companies] status failed", error);
    } finally {
      setStatusLoading(false);
    }
  }

  async function autoBuildIndex() {
    setBuildLoading(true);
    try {
      const res = await fetch(buildEndpoint, {
        method: "POST",
        cache: "no-store",
      });
      const raw = (await res.json()) as Record<string, unknown>;
      if (!res.ok || raw.ok !== true) {
        return;
      }
      await searchCompanies();
    } catch (error) {
      console.error("[invest-companies] auto build failed", error);
    } finally {
      setBuildLoading(false);
    }
  }

  async function loadCompany(corpCode: string) {
    setSelectedCode(corpCode);
    setDetailLoading(true);
    setDetailError("");

    try {
      const res = await fetch(`/api/public/disclosure/company?corpCode=${encodeURIComponent(corpCode)}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;

      if (!res.ok || raw.ok !== true || typeof raw.data !== "object" || raw.data === null) {
        const err = (raw.error as Record<string, unknown> | undefined) ?? undefined;
        const message = typeof err?.message === "string" ? err.message : "기업개황 조회에 실패했습니다.";
        setDetailError(message);
        setDetail(null);
        return;
      }

      const data = raw.data as Record<string, unknown>;
      setDetail({
        corpCode: typeof data.corpCode === "string" ? data.corpCode : undefined,
        corpName: typeof data.corpName === "string" ? data.corpName : undefined,
        stockCode: typeof data.stockCode === "string" ? data.stockCode : undefined,
        industry: typeof data.industry === "string" ? data.industry : undefined,
        ceo: typeof data.ceo === "string" ? data.ceo : undefined,
        homepage: typeof data.homepage === "string" ? data.homepage : undefined,
        address: typeof data.address === "string" ? data.address : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
        fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : undefined,
      });
    } catch (error) {
      console.error("[invest-companies] company failed", error);
      setDetailError("기업개황 조회에 실패했습니다. 잠시 후 다시 시도하세요.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader 
        title="기업 공시 통합 정보" 
        description="DART 공시 대상 회사의 기본 정보와 공시 코드를 통합 검색할 수 있습니다." 
      />

      <div className="mb-8">
        <Card className="rounded-[2.5rem] p-8 shadow-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void searchCompanies();
            }}
          >
            <FilterWrapper className="items-end">
              <div className="flex-1 min-w-[280px]">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">회사명 검색</label>
                <SearchPill
                  className="mt-2 h-12 w-full rounded-2xl"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onClear={() => setQueryInput("")}
                  placeholder="예: 삼성전자, 현대자동차"
                  isLoading={searchLoading}
                />
              </div>
              <FilterSelect
                label="정렬"
                size="md"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="name">이름 순</option>
                <option value="name_desc">이름 역순</option>
                <option value="stock_first">상장사 우선</option>
              </FilterSelect>
              <Button variant="primary" type="submit" className="rounded-2xl px-10 h-12 font-black shadow-md shadow-emerald-900/20" disabled={searchLoading}>
                {searchLoading ? "조회 중" : "기업 검색"}
              </Button>
            </FilterWrapper>
          </form>
          <div className="mt-6 flex items-center gap-4 px-1">
            <span className="text-sm font-black text-emerald-600">{searchItems.length.toLocaleString()}건 발견</span>
            {indexMeta && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Index Generated: {new Date(indexMeta.generatedAt || "").toLocaleDateString()}
              </span>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="flex flex-col rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
          <div className="bg-slate-50/50 p-6 px-8 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">회사 목록</h2>
            {searchItems.length > 0 && <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100">PAGE 1</span>}
          </div>
          
          <div className="flex-1 p-8">
            {searchLoading ? (
              <div className="py-12">
                <LoadingState description="기업 인덱스를 탐색하고 있습니다." />
              </div>
            ) : searchError && !indexMissing ? (
              <ErrorState message={searchError} />
            ) : indexMissing ? (
              <div className="rounded-[2rem] border border-dashed border-amber-200 bg-amber-50/30 p-10 text-center">
                <p className="text-base font-black text-amber-800">로컬 회사 인덱스가 없습니다.</p>
                <p className="mt-2 text-sm font-medium text-amber-600/70 leading-relaxed">안정적인 검색을 위해 최초 1회 인덱스 생성이 필요합니다.</p>
                
                {searchError && (
                  <div className="mx-auto mt-6 max-w-lg rounded-2xl bg-amber-100/50 p-4 text-xs font-bold text-amber-900 leading-relaxed">
                    {searchError}
                  </div>
                )}

                <div className="my-8 rounded-2xl bg-slate-900/5 p-5 text-left border border-slate-900/5">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">수동 복구 명령</p>
                  <code className="block break-all text-[11px] font-bold text-slate-600 font-mono">
                    {INDEX_HINT}
                  </code>
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Button variant="outline" className="rounded-2xl h-11 px-6 font-black bg-white" onClick={() => void fetchIndexStatus()} disabled={statusLoading}>
                    상태 확인
                  </Button>
                  <Button variant="primary" className="rounded-2xl h-11 px-8 font-black shadow-md shadow-amber-900/20" onClick={() => void autoBuildIndex()} disabled={buildLoading || !canAutoBuild}>
                    {buildLoading ? "생성 중..." : "인덱스 자동 생성"}
                  </Button>
                </div>
                {!canAutoBuild && autoBuildDisabledReason && (
                  <div className="mt-4 rounded-xl bg-amber-100/50 px-4 py-2 text-[10px] font-bold text-amber-800">
                    자동 생성 불가: {autoBuildDisabledReason}
                  </div>
                )}
              </div>
            ) : searchItems.length === 0 ? (
              <div className="py-12">
                <EmptyState title="검색 결과가 없습니다" description="다른 기업명이나 종목 코드를 입력해 보세요." />
              </div>
            ) : (
              <ul className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-100">
                {searchItems.map((item) => (
                  <li 
                    key={item.corpCode} 
                    className={cn(
                      "group cursor-pointer rounded-2xl border border-slate-100 p-5 transition-all hover:border-emerald-200 hover:bg-emerald-50/20 active:scale-[0.99]",
                      selectedCode === item.corpCode && "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500"
                    )}
                    onClick={() => void loadCompany(item.corpCode)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-base font-black text-slate-900 group-hover:text-emerald-700 transition-colors tracking-tight">{item.corpName}</p>
                        <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          DART {item.corpCode}
                          {item.stockCode ? ` · KRX ${item.stockCode}` : " · 비상장"}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-full bg-slate-50 p-2 text-slate-300 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="flex flex-col rounded-[2.5rem] p-0 overflow-hidden shadow-sm border-slate-100">
          <div className="bg-slate-50/50 p-6 px-8 border-b border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">기업 상세 정보</h2>
          </div>

          <div className="flex-1 p-8">
            {detailLoading ? (
              <div className="py-12">
                <LoadingState description="기업 상세 정보를 가져오는 중입니다." />
              </div>
            ) : detailError ? (
              <ErrorState message={detailError} />
            ) : !detail ? (
              <div className="flex h-full items-center justify-center py-24 text-center">
                <p className="text-sm font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                  목록에서 회사를 선택하여<br/>상세 프로필을 확인하세요.
                </p>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="rounded-[2rem] bg-slate-900 p-10 text-white shadow-xl shadow-slate-200">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80">Corporate Profile</p>
                  <h3 className="mt-4 text-3xl font-black tracking-tight">{detail.corpName}</h3>
                  {detail.industry && <p className="mt-3 text-sm font-bold text-white/50 leading-relaxed">{detail.industry}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/30 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">대표자</p>
                    <p className="text-sm font-black text-slate-700">{detail.ceo || "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/30 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">종목 코드</p>
                    <p className="text-sm font-black text-slate-700 tabular-nums">{detail.stockCode || "비상장"}</p>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50/30 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">공식 홈페이지</p>
                    <p className="text-sm font-black text-emerald-600 break-all">
                      {detail.homepage ? (
                        <a href={detail.homepage.startsWith("http") ? detail.homepage : `http://${detail.homepage}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-emerald-200 decoration-2">
                          {detail.homepage}
                        </a>
                      ) : "-"}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50/30 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">본점 주소</p>
                    <p className="text-sm font-bold text-slate-600 leading-relaxed">{detail.address || "-"}</p>
                  </div>
                </div>

                <div className="pt-6 flex items-center justify-between border-t border-slate-50">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Source: {detail.source || "DART"}</span>
                  {detail.fetchedAt && <span className="text-[10px] font-bold text-slate-300 tabular-nums">Refreshed: {new Date(detail.fetchedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
