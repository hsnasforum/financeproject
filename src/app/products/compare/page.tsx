"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BodyActionLink,
  bodyDenseActionRowClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import {
  clearCompareIdsStorage,
  compareStoreConfig,
  loadCompareIdsFromStorage,
  removeCompareIdFromStorage,
} from "@/lib/products/compareStore";

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
  providerName: string;
  productName: string;
  summary?: string;
  badges?: string[];
  signals?: {
    depositProtection?: "matched" | "unknown";
  };
  options?: UnifiedOption[];
};

type UnifiedItemResponse = {
  ok?: boolean;
  data?: {
    item?: UnifiedItem;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

type CompareCell = {
  id: string;
  item: UnifiedItem | null;
  error?: string;
};

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function representativeOption(item: UnifiedItem | null): UnifiedOption | null {
  if (!item || !Array.isArray(item.options) || item.options.length === 0) return null;
  const sorted = [...item.options].sort((a, b) => {
    const ar = a.intrRate2 ?? a.intrRate ?? Number.NEGATIVE_INFINITY;
    const br = b.intrRate2 ?? b.intrRate ?? Number.NEGATIVE_INFINITY;
    if (ar !== br) return br - ar;
    const at = typeof a.termMonths === "number" && Number.isFinite(a.termMonths) ? a.termMonths : Number.POSITIVE_INFINITY;
    const bt = typeof b.termMonths === "number" && Number.isFinite(b.termMonths) ? b.termMonths : Number.POSITIVE_INFINITY;
    return at - bt;
  });
  return sorted[0] ?? null;
}

function termLabel(option: UnifiedOption | null): string {
  if (!option) return "-";
  if (typeof option.termMonths === "number" && Number.isFinite(option.termMonths) && option.termMonths > 0) {
    return `${Math.trunc(option.termMonths)}개월`;
  }
  return (option.saveTrm ?? "").trim() || "-";
}

function formatKindLabel(value?: string): string {
  if (value === "deposit") return "정기예금";
  if (value === "saving") return "정기적금";
  return value?.trim() || "-";
}

const readThroughCopy = {
  comparisonAxisLabel: "같이 읽는 기준",
  summaryLabel: "다음 확인 포인트 메모",
  detailCtaLabel: "상세에서 조건 다시 확인",
  sectionHelper:
    "먼저 대표 금리, 가입 기간, 예금자 보호를 훑고, 다음 확인 포인트 메모를 읽은 뒤 상세에서 조건을 다시 확인하세요.",
} as const;

export default function ProductsComparePage() {
  const [ids, setIds] = useState<string[]>([]);
  const [cells, setCells] = useState<CompareCell[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const storedIds = loadCompareIdsFromStorage(compareStoreConfig.max);
    setIds(storedIds);
    if (storedIds.length === 0) {
      setCells([]);
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.all(
        storedIds.map(async (id): Promise<CompareCell> => {
          const params = new URLSearchParams();
          params.set("id", id);
          try {
            const res = await fetch(`/api/products/unified/item?${params.toString()}`, { cache: "no-store" });
            const json = (await res.json()) as UnifiedItemResponse;
            if (!res.ok || !json.ok || !json.data?.item) {
              const code = json.error?.code ?? "UPSTREAM";
              const message = json.error?.message ?? "상품 조회 실패";
              return { id, item: null, error: `${code}: ${message}` };
            }
            return { id, item: json.data.item };
          } catch {
            return { id, item: null, error: "UPSTREAM: 상품 조회 실패" };
          }
        }),
      );
      setCells(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasRows = cells.length > 0;
  const validCount = useMemo(() => cells.filter((cell) => cell.item).length, [cells]);
  const hasEnoughItems = ids.length >= 2;

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <PageHeader
          title="상품 비교"
          description={`비교함에 담은 상품을 나란히 놓고 현재 조건 기준 차이를 다시 읽는 화면입니다. 최대 ${compareStoreConfig.max}개까지 비교할 수 있습니다.`}
        />
        <p className="mb-6 text-xs font-medium leading-relaxed text-slate-500">
          이 화면은 확정 추천이 아니라, 여러 후보를 같은 기준으로 다시 확인하는 단계입니다.
          최고 금리 한 줄만 보지 말고 기간, 예금자보호, 요약 메모를 함께 읽어 보세요.
        </p>

        <Card className="mb-8 rounded-[2.5rem] border-slate-200/60 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">비교 중인 후보</span>
                <span className="text-xl font-black text-emerald-600">{ids.length} / {compareStoreConfig.max}</span>
              </div>
              <div className="h-8 w-px bg-slate-100" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">읽을 수 있는 후보</span>
                <span className="text-xl font-black text-slate-900">{validCount}</span>
              </div>
            </div>

            <div className={bodyDenseActionRowClassName}>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => void refresh()} disabled={loading}>
                새로고침
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                onClick={() => {
                  clearCompareIdsStorage();
                  void refresh();
                }}
                disabled={ids.length === 0}
              >
                비교함 비우기
              </Button>
              <BodyActionLink href="/products/catalog" className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-6 text-[11px] font-bold text-white no-underline shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:scale-[1.02]">
                비교 후보 더 담기
              </BodyActionLink>
            </div>
          </div>
          <p className="mt-4 text-xs font-medium leading-relaxed text-slate-500">
            표에 보이는 금리와 기간은 각 상품의 대표 옵션 기준입니다. 실제 가입 전에는 상세에서 우대조건과 제한 사항을 다시 확인하세요.
          </p>
        </Card>

        {!hasRows && !loading ? (
          <EmptyState
            title="비교함이 비어 있습니다"
            description="상품 카탈로그에서 비교 후보를 담아 두면, 여기서 같은 기준으로 나란히 다시 볼 수 있습니다."
            actionLabel="상품 보러 가기"
            onAction={() => window.location.href = "/products/catalog"}
          />
        ) : loading && !hasRows ? (
          <LoadingState description="비교 후보 정보를 불러오고 있습니다." />
        ) : !hasEnoughItems && !loading ? (
          <Card className="rounded-[2.5rem] border-dashed border-2 border-slate-200 bg-white/50 py-16 text-center shadow-none">
            <p className="text-sm font-bold text-slate-500">
              나란히 비교하려면 최소 2개의 상품이 필요합니다. 지금은 catalog에서 후보를 더 담아 보세요. (현재 {ids.length}개)
            </p>
            <Button variant="outline" className="mt-4 rounded-full" onClick={() => window.location.href = "/products/catalog"}>
              상품 더 담기
            </Button>
          </Card>
        ) : (
          <>
            <p className="mb-4 text-xs font-medium leading-relaxed text-slate-500">
              {readThroughCopy.sectionHelper}
            </p>
            {/* Desktop Table View */}
            <Card className="hidden md:block overflow-hidden rounded-[2.5rem] border-slate-200/60 p-0 shadow-lg">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="sticky left-0 z-20 w-40 bg-slate-50/50 p-6 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 border-r border-slate-100">
                        {readThroughCopy.comparisonAxisLabel}
                      </th>
                      {cells.map((cell) => (
                        <th key={`head-${cell.id}`} className="min-w-[240px] p-6 text-left border-r border-slate-100 last:border-0 relative group">
                          <button
                            type="button"
                            onClick={() => {
                              removeCompareIdFromStorage(cell.id, compareStoreConfig.max);
                              void refresh();
                            }}
                            className="absolute top-4 right-4 h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                          
                          <div className="flex flex-col gap-3">
                            <ProviderLogo providerName={cell.item?.providerName ?? "-"} className="h-10 w-10" />
                            <div>
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{cell.item?.providerName ?? "-"}</p>
                              <h3 className="mt-1 font-black text-slate-900 leading-snug line-clamp-2">{cell.item?.productName ?? "불러오지 못한 상품"}</h3>
                            </div>
                            <Link
                              href={`/products/catalog/${encodeURIComponent(cell.id)}`}
                              className="inline-flex w-fit rounded-full bg-slate-100 px-4 py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200"
                            >
                              {readThroughCopy.detailCtaLabel}
                            </Link>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white p-5 px-6 font-bold text-[11px] text-slate-500 border-r border-slate-100">
                        상품 유형
                      </td>
                      {cells.map((cell) => (
                        <td key={`kind-${cell.id}`} className="p-5 px-6 border-r border-slate-100 last:border-0">
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                            {formatKindLabel(cell.item?.kind)}
                          </span>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white p-5 px-6 font-bold text-[11px] text-slate-500 border-r border-slate-100">
                        대표 금리
                      </td>
                      {cells.map((cell) => {
                        const option = representativeOption(cell.item);
                        const applied = option ? (option.intrRate2 ?? option.intrRate ?? null) : null;
                        return (
                          <td key={`rate-${cell.id}`} className="p-5 px-6 border-r border-slate-100 last:border-0">
                            <span className="text-2xl font-black text-emerald-600 tabular-nums">
                              {formatRate(applied)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white p-5 px-6 font-bold text-[11px] text-slate-500 border-r border-slate-100">
                        가입 기간
                      </td>
                      {cells.map((cell) => (
                        <td key={`term-${cell.id}`} className="p-5 px-6 font-bold text-slate-900 border-r border-slate-100 last:border-0">
                          {termLabel(representativeOption(cell.item))}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white p-5 px-6 font-bold text-[11px] text-slate-500 border-r border-slate-100">
                        예금자 보호
                      </td>
                      {cells.map((cell) => (
                        <td key={`protection-${cell.id}`} className="p-5 px-6 border-r border-slate-100 last:border-0">
                          {cell.item?.signals?.depositProtection === "matched" ? (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                              보호 대상
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300">확인 안 됨</span>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white p-5 px-6 font-bold text-[11px] text-slate-500 border-r border-slate-100">
                        {readThroughCopy.summaryLabel}
                      </td>
                      {cells.map((cell) => (
                        <td key={`summary-${cell.id}`} className="p-5 px-6 text-xs leading-relaxed text-slate-600 border-r border-slate-100 last:border-0">
                          {cell.error ? (
                            <span className="font-bold text-rose-600">{cell.error}</span>
                          ) : (
                            (cell.item?.summary ?? (cell.item?.badges ?? []).join(", ")) || "-"
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile Card View */}
            <div className="grid gap-4 md:hidden">
              {cells.map((cell) => {
                const option = representativeOption(cell.item);
                const applied = option ? (option.intrRate2 ?? option.intrRate ?? null) : null;
                return (
                  <Card key={`mobile-${cell.id}`} className="relative overflow-hidden rounded-[2rem] border-slate-200/60 bg-white p-6 shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        removeCompareIdFromStorage(cell.id, compareStoreConfig.max);
                        void refresh();
                      }}
                      className="absolute top-4 right-4 h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 active:bg-rose-100 active:text-rose-600 transition-all"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>

                    <div className="mb-6 flex items-center gap-4">
                      <ProviderLogo providerName={cell.item?.providerName ?? "-"} className="h-12 w-12" />
                      <div>
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{cell.item?.providerName ?? "-"}</p>
                        <h3 className="mt-1 font-black text-slate-900 leading-tight">{cell.item?.productName ?? "불러오지 못한 상품"}</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">대표 금리</p>
                        <p className="text-xl font-black text-emerald-600 tabular-nums">{formatRate(applied)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">가입 기간</p>
                        <p className="text-sm font-black text-slate-900">{termLabel(option)}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[11px] font-bold text-slate-400">상품 유형</span>
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          {formatKindLabel(cell.item?.kind)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[11px] font-bold text-slate-400">예금자 보호</span>
                        {cell.item?.signals?.depositProtection === "matched" ? (
                          <span className="text-[10px] font-bold text-emerald-700">보호 대상</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300">확인 안 됨</span>
                        )}
                      </div>
                      <div className="pt-4 border-t border-slate-50 px-2">
                        <p className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-widest">{readThroughCopy.summaryLabel}</p>
                        <p className="text-xs leading-relaxed text-slate-600 italic">
                          {cell.error ? (
                            <span className="font-bold text-rose-600">{cell.error}</span>
                          ) : (
                            (cell.item?.summary ?? (cell.item?.badges ?? []).join(", ")) || "-"
                          )}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/products/catalog/${encodeURIComponent(cell.id)}`}
                      className="mt-8 flex h-12 w-full items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 transition active:bg-slate-200"
                    >
                      {readThroughCopy.detailCtaLabel}
                    </Link>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
