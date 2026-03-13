"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BodyActionLink,
  BodyEmptyState,
  BodyInset,
  BodyTableFrame,
  bodyDenseActionRowClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <PageShell className="bg-surface-muted">
      <PageHeader
        title="상품 비교"
        description={`최대 ${compareStoreConfig.max}개의 상품을 선택하여 한눈에 조건을 비교해보세요.`}
      />

      <Card className="mb-6 border-none shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <BodyInset className="px-3 py-2 text-sm font-bold text-slate-700">
              비교함: <span className="ml-1 font-black text-primary">{ids.length}/{compareStoreConfig.max}</span>
            </BodyInset>
            <BodyInset className="px-3 py-2 text-sm font-bold text-slate-700">
              유효 상품: <span className="ml-1 font-black text-primary">{validCount}</span>
            </BodyInset>
          </div>
          <div className={bodyDenseActionRowClassName}>
            <Button variant="outline" size="sm" className="h-9 px-4 rounded-full" onClick={() => void refresh()} disabled={loading}>
              {loading ? "불러오는 중..." : "새로고침"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-full hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
              onClick={() => {
                clearCompareIdsStorage();
                void refresh();
              }}
              disabled={ids.length === 0}
            >
              비우기
            </Button>
            <BodyActionLink href="/products/catalog" className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-[11px] font-bold text-white no-underline shadow-sm transition-colors hover:bg-emerald-700">
              상품 추가하기
            </BodyActionLink>
          </div>
        </div>
      </Card>

      {!hasRows ? (
        <Card className="py-20 text-center border-dashed border-2 shadow-none bg-surface/50">
          <div className="h-16 w-16 mx-auto bg-surface rounded-full flex items-center justify-center text-slate-300 mb-4 shadow-sm">
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>
          </div>
          <BodyEmptyState
            className="mx-auto max-w-xl border-none bg-transparent px-0 py-0"
            description="통합 카탈로그나 상세 페이지에서 '비교 담기'를 눌러주세요."
            title="비교함이 비어 있습니다."
          />
        </Card>
      ) : !hasEnoughItems ? (
        <Card className="py-16 text-center border-dashed border-2 shadow-none bg-surface/50">
          <BodyInset className="mx-auto inline-block border-amber-200 bg-amber-50 text-sm font-bold text-amber-700">
            비교를 위해 최소 2개의 상품이 필요합니다. (현재 {ids.length}개)
          </BodyInset>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden border-none shadow-card">
          <BodyTableFrame className="no-scrollbar rounded-none border-none pb-4">
            <table className="min-w-[840px] w-full text-sm">
              <thead className="sticky top-0 z-20 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <tr className="text-left text-slate-500">
                  <th className="py-4 px-6 font-bold text-xs uppercase tracking-widest w-32 bg-surface-muted/50 border-r border-border">비교 항목</th>
                  {cells.map((cell) => (
                    <th key={`head-${cell.id}`} className="py-5 px-6 align-top min-w-[240px] border-r border-border last:border-0 relative group">
                      <button
                        type="button"
                        onClick={() => {
                          removeCompareIdFromStorage(cell.id, compareStoreConfig.max);
                          void refresh();
                        }}
                        className="absolute top-4 right-4 h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                        title="제거"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                      <p className="text-[10px] font-bold text-primary mb-1 uppercase tracking-widest">{cell.item?.providerName ?? "-"}</p>
                      <p className="font-black text-base text-slate-900 leading-snug mb-3 line-clamp-2">{cell.item?.productName ?? cell.id}</p>
                      <BodyActionLink
                        href={`/products/catalog/${encodeURIComponent(cell.id)}`}
                        className="inline-flex rounded-full bg-slate-100 px-4 py-1.5 text-[10px] font-bold text-slate-700 no-underline transition-colors hover:bg-slate-200"
                      >
                        상세 정보 보기
                      </BodyActionLink>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-xs text-slate-500 bg-surface-muted/30 border-r border-border">상품 유형</td>
                  {cells.map((cell) => (
                    <td key={`kind-${cell.id}`} className="py-4 px-6 text-slate-900 font-medium border-r border-border/50 last:border-0">
                       <span className="bg-slate-100 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-widest text-slate-600">{cell.item?.kind ?? "-"}</span>
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-6 font-bold text-xs text-slate-500 bg-surface-muted/30 border-r border-border">최고 금리</td>
                  {cells.map((cell) => {
                    const option = representativeOption(cell.item);
                    const applied = option ? (option.intrRate2 ?? option.intrRate ?? null) : null;
                    return (
                      <td key={`rate-${cell.id}`} className="py-5 px-6 border-r border-border/50 last:border-0">
                         <span className="text-2xl font-black text-emerald-600 tabular-nums">{formatRate(applied)}</span>
                      </td>
                    );
                  })}
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-xs text-slate-500 bg-surface-muted/30 border-r border-border">가입 기간</td>
                  {cells.map((cell) => (
                    <td key={`term-${cell.id}`} className="py-4 px-6 text-slate-900 font-bold border-r border-border/50 last:border-0">{termLabel(representativeOption(cell.item))}</td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-xs text-slate-500 bg-surface-muted/30 border-r border-border">예금자 보호</td>
                  {cells.map((cell) => (
                    <td key={`protection-${cell.id}`} className="py-4 px-6 border-r border-border/50 last:border-0">
                       {cell.item?.signals?.depositProtection === "matched" ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m12 22-8-4.5v-6A10 10 0 0 1 12 2a10 10 0 0 1 8 9.5v6Z"/></svg>
                            보호 대상
                          </span>
                       ) : (
                          <span className="text-xs font-medium text-slate-400">확인 안 됨</span>
                       )}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-4 px-6 font-bold text-xs text-slate-500 bg-surface-muted/30 border-r border-border">핵심 요약</td>
                  {cells.map((cell) => (
                    <td key={`summary-${cell.id}`} className="py-4 px-6 text-sm text-slate-600 leading-relaxed border-r border-border/50 last:border-0">
                      {cell.error ? (
                        <span className="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded text-xs">{cell.error}</span>
                      ) : (
                        ((cell.item?.summary ?? (cell.item?.badges ?? []).join(", ")) || "-")
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </BodyTableFrame>
        </Card>
      )}
    </PageShell>
  );
}
