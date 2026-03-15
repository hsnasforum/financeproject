"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { ProviderChips } from "@/components/ui/ProviderChips";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { SearchPill } from "@/components/ui/SearchPill";
import { FilterField } from "@/components/ui/FilterField";
import { addCompareIdToStorage, compareStoreConfig } from "@/lib/products/compareStore";

type UnifiedOption = {
  sourceId?: string;
  termMonths: number | null;
  saveTrm?: string;
  intrRate: number | null;
  intrRate2: number | null;
};

type UnifiedItem = {
  stableId: string;
  sourceId: string;
  sourceIds?: string[];
  kind: string;
  externalKey: string;
  providerName: string;
  productName: string;
  summary?: string;
  badges?: string[];
  options?: UnifiedOption[];
};

type UnifiedResponse = {
  ok?: boolean;
  data?: {
    items?: UnifiedItem[];
    merged?: UnifiedItem[];
    pageInfo?: {
      hasMore?: boolean;
      nextCursor?: string | null;
      limit?: number;
    };
  };
  meta?: {
    generatedAt?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export default function ProductsCatalogPage() {
  const [kind, setKind] = useState<"deposit" | "saving">("deposit");
  const [termMonths, setTermMonths] = useState<string>("");
  const [minRate, setMinRate] = useState<string>("");
  const [q, setQ] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [includeSamplebank, setIncludeSamplebank] = useState(false);
  const [rows, setRows] = useState<UnifiedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [compareNotice, setCompareNotice] = useState("");

  const providers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    map.set("all", { id: "all", name: "전체" });
    rows.forEach((row) => {
      if (!map.has(row.providerName)) {
        map.set(row.providerName, { id: row.providerName, name: row.providerName });
      }
    });
    return Array.from(map.values());
  }, [rows]);

  const run = useCallback(async (input?: { append?: boolean; cursor?: string | null }) => {
    const append = Boolean(input?.append);
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("mode", "merged");
      params.set("kind", kind);
      const includeSources = includeSamplebank
        ? "finlife,datago_kdb,samplebank"
        : "finlife,datago_kdb";
      params.set("includeSources", includeSources);
      params.set("limit", "60");
      params.set("sort", "recent");
      if (q.trim()) params.set("q", q.trim());
      if (append && input?.cursor) params.set("cursor", input.cursor);

      const res = await fetch(`/api/products/unified?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as UnifiedResponse;
      if (!res.ok || !json.ok) {
        const code = json.error?.code ?? "UPSTREAM";
        const message = json.error?.message ?? "통합 카탈로그 조회에 실패했습니다.";
        setError(`${code}: ${message}`);
        return;
      }

      const pageItems = Array.isArray(json.data?.items)
        ? json.data?.items
        : (Array.isArray(json.data?.merged) ? json.data.merged : []);
      setRows((prev) => (append ? [...prev, ...pageItems] : pageItems));
      setHasMore(Boolean(json.data?.pageInfo?.hasMore));
      setNextCursor(typeof json.data?.pageInfo?.nextCursor === "string" ? json.data.pageInfo.nextCursor : null);
      setCompareNotice("");
    } catch {
      setError("UPSTREAM: 통합 카탈로그 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [includeSamplebank, kind, q]);

  useEffect(() => {
    setRows([]);
    setNextCursor(null);
    setHasMore(false);
    void run({ append: false });
  }, [kind, q, run]);

  const filteredRows = useMemo(() => {
    const termFilter = Number(termMonths);
    const hasTermFilter = Number.isFinite(termFilter) && termFilter > 0;
    const minRateFilter = Number(minRate);
    const hasMinRateFilter = Number.isFinite(minRateFilter) && minRateFilter > 0;

    return rows.filter((item) => {
      if (selectedProvider !== "all" && item.providerName !== selectedProvider) return false;
      
      const options = Array.isArray(item.options) ? item.options : [];
      if (!hasTermFilter && !hasMinRateFilter) return true;
      if (options.length === 0) return false;
      return options.some((option) => {
        if (hasTermFilter && option.termMonths !== termFilter) return false;
        if (hasMinRateFilter && (option.intrRate2 ?? option.intrRate ?? Number.NEGATIVE_INFINITY) < minRateFilter) return false;
        return true;
      });
    });
  }, [minRate, rows, selectedProvider, termMonths]);

  return (
    <PageShell>
      <PageHeader
        title="통합 상품 탐색"
        description="FINLIFE와 KDB 데이터를 통합한 전 금융권 상품 카탈로그입니다."
      />

      <div className="sticky top-0 z-30 mb-10 space-y-4">
        <Card className="rounded-[2.5rem] p-8 shadow-lg backdrop-blur-md bg-white/95 border-slate-100">
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">상품군 선택</p>
                <SegmentedTabs
                  options={[
                    { id: "deposit", label: "정기예금" },
                    { id: "saving", label: "정기적금" },
                  ]}
                  activeTab={kind}
                  onChange={(id) => setKind(id as "deposit" | "saving")}
                />
              </div>
              
              <div className="flex-1 min-w-[320px] space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">키워드 검색</p>
                <div className="flex items-center gap-3">
                  <SearchPill
                    className="h-12 w-full rounded-2xl"
                    placeholder="은행명 또는 상품명을 입력하세요"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onClear={() => setQ("")}
                    isLoading={loading && rows.length === 0}
                  />
                  <Button variant="primary" className="h-12 rounded-2xl px-8 font-black shadow-md shadow-emerald-900/20" onClick={() => void run({ append: false })} disabled={loading}>
                    {loading ? "조회 중" : "검색"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">제공 기관 필터</p>
              <ProviderChips
                providers={providers}
                selectedId={selectedProvider}
                onSelect={setSelectedProvider}
              />
            </div>

            <div className="flex flex-wrap items-center gap-8 border-t border-slate-50 pt-6">
              <div className="flex flex-wrap items-center gap-6">
                <FilterField
                  label="기간"
                  unit="개월"
                  placeholder="전체"
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                />

                <FilterField
                  label="최소 금리"
                  unit="% 이상"
                  placeholder="0.0"
                  value={minRate}
                  onChange={(e) => setMinRate(e.target.value)}
                />
              </div>
              
              <div className="ml-auto flex items-center gap-8">
                <label className="flex cursor-pointer items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded-lg border-slate-200 text-emerald-600 focus:ring-emerald-500 transition-all"
                    checked={includeSamplebank}
                    onChange={(e) => setIncludeSamplebank(e.target.checked)}
                  />
                  샘플 데이터 포함
                </label>
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50/50 px-4 py-2 border border-emerald-100/50">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-200" />
                  <span className="text-sm font-black text-emerald-700">
                    {filteredRows.length.toLocaleString()} <span className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest ml-1">results</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {compareNotice && (
        <div className="mb-8 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center animate-in fade-in slide-in-from-top-2">
          <p className="text-sm font-black text-emerald-700">{compareNotice}</p>
        </div>
      )}

      {error ? (
        <ErrorState
          className="mb-12"
          message={error}
          onRetry={() => void run({ append: false })}
          retryLabel="다시 시도"
        />
      ) : null}

      <div className="space-y-8">
        {loading && filteredRows.length === 0 ? (
          <div className="py-20">
            <LoadingState title="최적의 상품 목록을 분석하고 있습니다" />
          </div>
        ) : filteredRows.length > 0 ? (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((item) => (
                <Card key={item.stableId} className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm transition-all hover:shadow-xl hover:border-emerald-100 hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <ProviderLogo providerName={item.providerName} className="h-12 w-12 rounded-2xl shadow-sm" />
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {item.badges?.slice(0, 2).map((badge) => (
                        <span key={badge} className="rounded-lg bg-emerald-50 border border-emerald-100/50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{item.providerName}</p>
                    <h2 className="mt-2 text-xl font-black text-slate-900 leading-snug group-hover:text-emerald-600 transition-colors tracking-tight line-clamp-2">
                      {item.productName}
                    </h2>
                    {item.summary && (
                      <p className="mt-4 text-sm font-medium leading-relaxed text-slate-500 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>

                  <div className="mt-8 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-2">대표 옵션</p>
                    {item.options?.slice(0, 2).map((option, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50/50 p-4 border border-slate-100/50">
                        <span className="text-xs font-black text-slate-600 tabular-nums">{option.termMonths ? `${option.termMonths}개월` : option.saveTrm}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MAX</span>
                          <span className="text-base font-black text-emerald-600 tabular-nums">{formatRate(option.intrRate2)}</span>
                        </div>
                      </div>
                    ))}
                    {item.options && item.options.length > 2 && (
                      <p className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest pt-1">+{item.options.length - 2} more options</p>
                    )}
                  </div>

                  <div className="mt-10 flex gap-3">
                    <Link
                      href={`/products/catalog/${encodeURIComponent(item.stableId)}`}
                      className="flex-1 rounded-2xl bg-slate-900 py-4 text-center text-xs font-black text-white shadow-lg transition-all hover:bg-slate-800 active:scale-95"
                    >
                      상세 보기
                    </Link>
                    <Button
                      variant="outline"
                      className="flex-1 rounded-2xl h-12 font-black border-slate-200"
                      onClick={() => {
                        const next = addCompareIdToStorage(item.stableId, compareStoreConfig.max);
                        setCompareNotice(`비교함에 담았습니다. (${next.length}/${compareStoreConfig.max})`);
                        setTimeout(() => setCompareNotice(""), 3000);
                      }}
                    >
                      비교 담기
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : !loading && !error ? (
          <div className="py-20">
            <EmptyState
              title="검색 결과가 없습니다"
              description="필터 조건을 완화하거나 다른 검색어를 입력해 보세요."
              actionLabel="필터 초기화"
              onAction={() => {
                setTermMonths("");
                setMinRate("");
                setQ("");
                setSelectedProvider("all");
              }}
            />
          </div>
        ) : null}
      </div>

      {hasMore && !loading && (
        <div className="mt-16 flex justify-center pb-12">
          <Button
            variant="outline"
            className="rounded-2xl h-14 px-16 font-black shadow-sm transition-all hover:bg-white active:scale-95"
            onClick={() => void run({ append: true, cursor: nextCursor })}
          >
            더 많은 상품 불러오기
          </Button>
        </div>
      )}
    </PageShell>
  );
}
