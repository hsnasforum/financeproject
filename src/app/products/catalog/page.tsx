"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BodyInset,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
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
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader
          title="통합 상품 탐색"
          description="FINLIFE와 KDB 데이터를 통합한 전 금융권 상품 카탈로그입니다."
        />

        <div className="sticky top-0 z-30 mb-8 space-y-4">
          <Card className="rounded-[2.5rem] border-slate-200/60 p-6 shadow-sm backdrop-blur-md bg-white/90">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <SegmentedTabs
                  options={[
                    { id: "deposit", label: "예금" },
                    { id: "saving", label: "적금" },
                  ]}
                  activeTab={kind}
                  onChange={(id) => setKind(id as "deposit" | "saving")}
                />
                
                <SearchPill
                  placeholder="은행명 또는 상품명을 검색해 보세요"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onClear={() => setQ("")}
                  isLoading={loading && rows.length === 0}
                />
                <Button variant="primary" size="md" className="rounded-full px-6" onClick={() => void run({ append: false })} disabled={loading}>
                  {loading ? "조회 중" : "검색"}
                </Button>
              </div>

              <ProviderChips
                providers={providers}
                selectedId={selectedProvider}
                onSelect={setSelectedProvider}
              />

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
                
                <div className="ml-auto flex items-center gap-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      checked={includeSamplebank}
                      onChange={(e) => setIncludeSamplebank(e.target.checked)}
                    />
                    샘플 데이터 포함
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-black text-emerald-600">
                      {filteredRows.length.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">items</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {compareNotice ? (
          <BodyInset className="mb-6 border-emerald-100 bg-emerald-50/50 text-emerald-700">
            {compareNotice}
          </BodyInset>
        ) : null}

        {error ? (
          <ErrorState
            className="mb-8"
            message={error}
            onRetry={() => void run({ append: false })}
            retryLabel="다시 시도"
          />
        ) : null}

        <div className="space-y-4">
          {loading && filteredRows.length === 0 ? (
            <LoadingState description="최적의 상품 목록을 불러오고 있습니다." />
          ) : filteredRows.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((item) => (
                <Card key={item.stableId} className="group relative overflow-hidden rounded-[2rem] border-slate-200/60 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <ProviderLogo providerName={item.providerName} className="h-12 w-12" />
                    <div className="flex flex-wrap justify-end gap-1">
                      {item.badges?.slice(0, 2).map((badge) => (
                        <span key={badge} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] font-bold text-slate-400">{item.providerName}</p>
                    <h2 className="mt-1 text-lg font-black text-slate-900 line-clamp-1 group-hover:text-emerald-600 transition-colors">
                      {item.productName}
                    </h2>
                    {item.summary && (
                      <p className="mt-2 text-sm leading-relaxed text-slate-500 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>

                  <div className="mt-6 space-y-2">
                    {item.options?.slice(0, 2).map((option, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                        <span className="font-bold text-slate-600">{option.termMonths ? `${option.termMonths}개월` : option.saveTrm}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">최고</span>
                          <span className="text-sm font-black text-emerald-600">{formatRate(option.intrRate2)}</span>
                        </div>
                      </div>
                    ))}
                    {item.options && item.options.length > 2 && (
                      <p className="text-center text-[10px] font-bold text-slate-400">+{item.options.length - 2}개의 옵션 더 있음</p>
                    )}
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Link
                      href={`/products/catalog/${encodeURIComponent(item.stableId)}`}
                      className="flex-1 rounded-2xl bg-slate-100 py-3 text-center text-xs font-bold text-slate-700 transition hover:bg-slate-200"
                    >
                      상세 보기
                    </Link>
                    <Button
                      variant="primary"
                      className="flex-1 rounded-2xl"
                      onClick={() => {
                        const next = addCompareIdToStorage(item.stableId, compareStoreConfig.max);
                        setCompareNotice(`비교함에 담았습니다. (${next.length}/${compareStoreConfig.max})`);
                      }}
                    >
                      비교 담기
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : !loading && !error ? (
            <EmptyState
              title="검색 결과가 없습니다"
              description="필터 조건을 조정하거나 다른 검색어를 입력해 보세요."
              actionLabel="필터 초기화"
              onAction={() => {
                setTermMonths("");
                setMinRate("");
                setQ("");
                setSelectedProvider("all");
              }}
            />
          ) : null}
        </div>

        {hasMore && !loading && (
          <div className="mt-12 flex justify-center">
            <Button
              variant="outline"
              size="lg"
              className="rounded-full px-12"
              onClick={() => void run({ append: true, cursor: nextCursor })}
            >
              더 많은 상품 보기
            </Button>
          </div>
        )}
      </Container>
    </main>
  );
}
