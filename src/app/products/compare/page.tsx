"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <SectionHeader
          title="상품 비교"
          subtitle={`2~${compareStoreConfig.max}개 상품을 unified item 기준으로 비교합니다.`}
        />

        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>비교함: {ids.length}/{compareStoreConfig.max}</span>
            <span>유효 상품: {validCount}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "불러오는 중..." : "새로고침"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                clearCompareIdsStorage();
                void refresh();
              }}
              disabled={ids.length === 0}
            >
              비교함 비우기
            </Button>
            <Link href="/products/catalog" className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">
              통합 카탈로그
            </Link>
          </div>
        </Card>

        {!hasRows ? (
          <Card>
            <p className="text-sm text-slate-600">비교함이 비어 있습니다. 상세 페이지에서 “비교 담기”를 눌러주세요.</p>
          </Card>
        ) : !hasEnoughItems ? (
          <Card>
            <p className="text-sm text-slate-600">비교하려면 최소 2개 상품이 필요합니다. 현재 {ids.length}개가 담겨 있습니다.</p>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="min-w-[840px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3">항목</th>
                    {cells.map((cell) => (
                      <th key={`head-${cell.id}`} className="py-2 pr-3 align-top">
                        <p className="font-semibold text-slate-900">{cell.item?.productName ?? cell.id}</p>
                        <p className="text-xs text-slate-500">{cell.id}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Link
                            href={`/products/catalog/${encodeURIComponent(cell.id)}`}
                            className="inline-flex rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            상세
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              removeCompareIdFromStorage(cell.id, compareStoreConfig.max);
                              void refresh();
                            }}
                            className="inline-flex rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700"
                          >
                            제거
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">금융사</td>
                    {cells.map((cell) => (
                      <td key={`provider-${cell.id}`} className="py-2 pr-3 text-slate-700">{cell.item?.providerName ?? "-"}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">상품명</td>
                    {cells.map((cell) => (
                      <td key={`product-${cell.id}`} className="py-2 pr-3 text-slate-700">{cell.item?.productName ?? "-"}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">kind</td>
                    {cells.map((cell) => (
                      <td key={`kind-${cell.id}`} className="py-2 pr-3 text-slate-700">{cell.item?.kind ?? "-"}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">대표금리</td>
                    {cells.map((cell) => {
                      const option = representativeOption(cell.item);
                      const applied = option ? (option.intrRate2 ?? option.intrRate ?? null) : null;
                      return (
                        <td key={`rate-${cell.id}`} className="py-2 pr-3 text-slate-700">{formatRate(applied)}</td>
                      );
                    })}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">기간</td>
                    {cells.map((cell) => (
                      <td key={`term-${cell.id}`} className="py-2 pr-3 text-slate-700">{termLabel(representativeOption(cell.item))}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-700">보호여부</td>
                    {cells.map((cell) => (
                      <td key={`protection-${cell.id}`} className="py-2 pr-3 text-slate-700">{cell.item?.signals?.depositProtection ?? "unknown"}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold text-slate-700">조건요약</td>
                    {cells.map((cell) => (
                      <td key={`summary-${cell.id}`} className="py-2 pr-3 text-slate-700">
                        {cell.error ? (
                          <span className="text-rose-700">{cell.error}</span>
                        ) : (
                          ((cell.item?.summary ?? (cell.item?.badges ?? []).join(", ")) || "-")
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Container>
    </main>
  );
}
