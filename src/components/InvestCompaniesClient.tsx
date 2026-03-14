"use client";

import { useState } from "react";
import { SearchPill } from "@/components/ui/SearchPill";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

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
const INDEX_HINT_WITH_PATH = "DART_CORPCODES_INDEX_PATH=tmp/dart/corpCodes.index.json python3 scripts/dart_corpcode_build.py";

export function InvestCompaniesClient() {
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
  const [statusEndpoint, setStatusEndpoint] = useState("/api/public/disclosure/corpcodes/status");
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
      if (process.env.NODE_ENV !== "production") {
        params.set("debug", "1");
      }
      const res = await fetch(`/api/public/disclosure/corpcodes/search?${params.toString()}`, { cache: "no-store" });
      const raw = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        const message = typeof raw.message === "string" ? raw.message : "회사 검색에 실패했습니다.";
        const code = typeof raw.error === "string" ? raw.error : "";
        if (res.status === 409 || code === "CORPCODES_INDEX_MISSING") {
          setIndexMissing(true);
          setSearchError(`${message} 기본: ${INDEX_HINT} / 경로 지정: ${INDEX_HINT_WITH_PATH}`);
          setCanAutoBuild(Boolean(raw.canAutoBuild));
          setAutoBuildDisabledReason(typeof raw.autoBuildDisabledReason === "string" ? raw.autoBuildDisabledReason : "");
          setBuildEndpoint(typeof raw.buildEndpoint === "string" ? raw.buildEndpoint : "/api/public/disclosure/corpcodes/build");
          setStatusEndpoint(typeof raw.statusEndpoint === "string" ? raw.statusEndpoint : "/api/public/disclosure/corpcodes/status");
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
          setStatusEndpoint(typeof raw.statusEndpoint === "string" ? raw.statusEndpoint : "/api/public/disclosure/corpcodes/status");
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
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader 
          title="기업 공시 통합 정보" 
          description="DART 공시 대상 회사의 기본 정보와 공시 코드를 통합 검색할 수 있습니다." 
        />

        <div className="mb-8">
          <Card className="rounded-[2.5rem] border-slate-200/60 p-6 shadow-sm">
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void searchCompanies();
              }}
            >
              <div className="flex-1 min-w-[240px]">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">회사명 검색</label>
                <SearchPill
                  className="mt-2 h-10 w-full"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onClear={() => setQueryInput("")}
                  placeholder="예: 삼성전자, 현대자동차"
                  isLoading={searchLoading}
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">정렬</label>
                <select 
                  className="mt-2 block h-10 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none" 
                  value={sortKey} 
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  <option value="name">가나다순</option>
                  <option value="name_desc">역순</option>
                  <option value="stock_first">상장사 우선</option>
                </select>
              </div>
              <Button variant="primary" type="submit" className="rounded-2xl px-8 h-10" disabled={searchLoading}>
                {searchLoading ? "조회 중" : "검색"}
              </Button>
            </form>
            <div className="mt-4 flex items-center gap-3 px-1">
              <span className="text-xs font-black text-emerald-600">{searchItems.length.toLocaleString()}건 발견</span>
              {indexMeta && <span className="text-[10px] text-slate-400">인덱스 생성일: {new Date(indexMeta.generatedAt || "").toLocaleDateString()}</span>}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="flex flex-col rounded-[2.5rem] border-slate-200/60 p-0 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-50">
              <h2 className="text-base font-black text-slate-900">회사 목록</h2>
            </div>
            
            <div className="flex-1 p-6">
              {searchLoading ? (
                <LoadingState description="기업 인덱스를 탐색하고 있습니다." />
              ) : searchError && !indexMissing ? (
                <ErrorState message={searchError} />
              ) : indexMissing ? (
                <div className="rounded-[2rem] border border-dashed border-amber-200 bg-amber-50/50 p-8 text-center">
                  <p className="text-sm font-bold text-amber-800">로컬 회사 인덱스가 없습니다.</p>
                  <p className="mt-2 text-xs text-amber-600">안정적인 검색을 위해 최초 1회 인덱스 생성이 필요합니다.</p>
                  
                  {searchError && (
                    <div className="mx-auto mt-4 max-w-lg rounded-xl bg-amber-100/50 p-3 text-xs font-bold text-amber-900">
                      {searchError}
                    </div>
                  )}

                  <div className="my-6 rounded-xl bg-slate-900/5 p-4 text-left">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">수동 복구 명령</p>
                    <code className="block break-all text-[11px] font-medium text-slate-700">
                      {INDEX_HINT}
                    </code>
                  </div>

                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Button size="sm" variant="outline" className="rounded-full bg-white" onClick={() => void fetchIndexStatus()} disabled={statusLoading}>
                      상태 확인
                    </Button>
                    <Button size="sm" variant="primary" className="rounded-full px-6" onClick={() => void autoBuildIndex()} disabled={buildLoading || !canAutoBuild}>
                      {buildLoading ? "생성 중..." : "인덱스 자동 생성"}
                    </Button>
                  </div>
                  {!canAutoBuild && autoBuildDisabledReason && (
                    <div className="mt-4 rounded-lg bg-amber-100/50 px-3 py-2 text-[11px] font-bold text-amber-800">
                      자동 생성 불가: {autoBuildDisabledReason}
                    </div>
                  )}
                </div>
              ) : searchItems.length === 0 ? (
                <EmptyState title="검색 결과가 없습니다" description="다른 검색어를 입력해 보세요." />
              ) : (
                <ul className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                  {searchItems.map((item) => (
                    <li 
                      key={item.corpCode} 
                      className={cn(
                        "group cursor-pointer rounded-2xl border border-slate-100 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50/30",
                        selectedCode === item.corpCode && "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500"
                      )}
                      onClick={() => void loadCompany(item.corpCode)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-900 group-hover:text-emerald-700">{item.corpName}</p>
                          <p className="mt-1 text-[10px] font-bold text-slate-400">
                            CODE {item.corpCode}
                            {item.stockCode ? ` · STOCK ${item.stockCode}` : " · 비상장"}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">조회 →</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="flex flex-col rounded-[2.5rem] border-slate-200/60 p-0 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-50">
              <h2 className="text-base font-black text-slate-900">기업 상세 정보</h2>
            </div>

            <div className="flex-1 p-6">
              {detailLoading ? (
                <LoadingState description="기업 상세 정보를 가져오는 중입니다." />
              ) : detailError ? (
                <ErrorState message={detailError} />
              ) : !detail ? (
                <div className="flex h-full items-center justify-center py-20 text-center">
                  <p className="text-sm font-bold text-slate-400">목록에서 회사를 선택하여<br/>상세 정보를 확인하세요.</p>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="rounded-[2rem] bg-slate-50 p-8">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Company Profile</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-900">{detail.corpName}</h3>
                    {detail.industry && <p className="mt-1 text-sm font-bold text-slate-500">{detail.industry}</p>}
                  </div>

                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">대표자</dt>
                      <dd className="mt-1 text-sm font-black text-slate-700">{detail.ceo || "-"}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-100 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">종목 코드</dt>
                      <dd className="mt-1 text-sm font-black text-slate-700">{detail.stockCode || "비상장"}</dd>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-slate-100 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">홈페이지</dt>
                      <dd className="mt-1 text-sm font-black text-emerald-600 break-all">
                        {detail.homepage ? (
                          <a href={detail.homepage.startsWith("http") ? detail.homepage : `http://${detail.homepage}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                            {detail.homepage}
                          </a>
                        ) : "-"}
                      </dd>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-slate-100 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">주소</dt>
                      <dd className="mt-1 text-sm font-medium text-slate-700 leading-relaxed">{detail.address || "-"}</dd>
                    </div>
                  </dl>

                  <div className="pt-4 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-300">데이터 출처: {detail.source || "DART"}</span>
                    {detail.fetchedAt && <span className="text-[10px] font-bold text-slate-300">갱신일: {new Date(detail.fetchedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </Container>
    </main>
  );
}
