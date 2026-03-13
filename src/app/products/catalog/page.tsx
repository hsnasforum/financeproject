"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BodyEmptyState,
  BodyInset,
  BodyTableFrame,
  bodyChoiceRowClassName,
  bodyDenseActionRowClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
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

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export default function ProductsCatalogPage() {
  const [kind, setKind] = useState<"deposit" | "saving">("deposit");
  const [termMonths, setTermMonths] = useState<string>("");
  const [minRate, setMinRate] = useState<string>("");
  const [q, setQ] = useState("");
  const [includeSamplebank, setIncludeSamplebank] = useState(false);
  const [rows, setRows] = useState<UnifiedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [compareNotice, setCompareNotice] = useState("");

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
      setGeneratedAt(typeof json.meta?.generatedAt === "string" ? json.meta.generatedAt : "");
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
      const options = Array.isArray(item.options) ? item.options : [];
      if (!hasTermFilter && !hasMinRateFilter) return true;
      if (options.length === 0) return false;
      return options.some((option) => {
        if (hasTermFilter && option.termMonths !== termFilter) return false;
        if (hasMinRateFilter && (option.intrRate2 ?? option.intrRate ?? Number.NEGATIVE_INFINITY) < minRateFilter) return false;
        return true;
      });
    });
  }, [minRate, rows, termMonths]);

  return (
    <main className="min-h-screen bg-slate-50 py-8 md:py-12">
      <Container>
        <SectionHeader
          title="통합 카탈로그 탐색"
          subtitle="FINLIFE + KDB를 mode=merged로 통합한 사용자용 탐색 화면입니다."
        />

        <Card className="mb-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              상품군
              <select className={bodyFieldClassName} value={kind} onChange={(e) => setKind(e.target.value === "saving" ? "saving" : "deposit")}>
                <option value="deposit">예금</option>
                <option value="saving">적금</option>
              </select>
            </label>
            <label className="text-sm">
              기간(개월)
              <input className={bodyFieldClassName} placeholder="예: 12" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
            </label>
            <label className="text-sm">
              최소 금리(%)
              <input className={bodyFieldClassName} placeholder="예: 3.0" value={minRate} onChange={(e) => setMinRate(e.target.value)} />
            </label>
            <label className="text-sm">
              검색어
              <input className={bodyFieldClassName} placeholder="은행명/상품명" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
          <label className={`mt-3 ${bodyChoiceRowClassName}`}>
            <input
              type="checkbox"
              checked={includeSamplebank}
              onChange={(event) => setIncludeSamplebank(event.target.checked)}
            />
            samplebank fixture 포함(디버그)
          </label>
          <div className={`mt-3 text-xs text-slate-600 ${bodyDenseActionRowClassName}`}>
            <span>생성시각: {formatDateTime(generatedAt)}</span>
            <span>표시건수: {filteredRows.length.toLocaleString()}건</span>
            <span>원본누적: {rows.length.toLocaleString()}건</span>
          </div>
          {compareNotice ? <p className="mt-2 text-xs text-slate-600">{compareNotice}</p> : null}
          {error ? (
            <BodyInset className="mt-3 border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</BodyInset>
          ) : null}
        </Card>

        <div className="space-y-3">
          {filteredRows.map((item) => (
            <Card key={item.stableId} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{item.kind}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">{(item.sourceIds ?? [item.sourceId]).join(", ")}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">ID: {item.stableId}</span>
                {(item.badges ?? []).map((badge) => (
                  <span key={`${item.stableId}-${badge}`} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{badge}</span>
                ))}
              </div>
              <h2 className="mt-2 text-lg font-bold text-slate-900">{item.productName}</h2>
              <p className="text-sm text-slate-600">{item.providerName}</p>
              {item.summary ? <p className="mt-1 text-sm text-slate-600">{item.summary}</p> : null}
              <div className={`mt-2 ${bodyDenseActionRowClassName}`}>
                <Link
                  href={`/products/catalog/${encodeURIComponent(item.stableId)}`}
                  className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  통합 상세
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const next = addCompareIdToStorage(item.stableId, compareStoreConfig.max);
                    setCompareNotice(`비교함에 담았습니다. (${next.length}/${compareStoreConfig.max})`);
                  }}
                  className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                >
                  비교 담기
                </button>
              </div>

              {(item.options ?? []).length > 0 ? (
                <BodyTableFrame className="mt-3">
                  <table className="min-w-[460px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-1 pr-3">기간</th>
                        <th className="py-1 pr-3">기본금리</th>
                        <th className="py-1 pr-3">최고금리</th>
                        <th className="py-1">출처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(item.options ?? []).map((option, idx) => (
                        <tr key={`${item.stableId}-${option.termMonths ?? "na"}-${idx}`} className="border-b border-slate-100">
                          <td className="py-1 pr-3">{option.termMonths !== null ? `${option.termMonths}개월` : (option.saveTrm ?? "-")}</td>
                          <td className="py-1 pr-3">{formatRate(option.intrRate)}</td>
                          <td className="py-1 pr-3">{formatRate(option.intrRate2)}</td>
                          <td className="py-1">{option.sourceId ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BodyTableFrame>
              ) : (
                <BodyEmptyState
                  className="mt-3 border-none bg-slate-50/80"
                  description="이 상품은 통합 카탈로그 기준으로 노출 가능한 옵션 상세가 아직 없습니다."
                  title="옵션 정보가 없습니다."
                />
              )}
            </Card>
          ))}

          {!loading && filteredRows.length === 0 && !error ? (
            <Card className="rounded-2xl border border-slate-200 bg-white p-4">
              <BodyEmptyState
                description="기간, 최소 금리, 검색어를 조금 완화한 뒤 다시 조회해보세요."
                title="조건에 맞는 결과가 없습니다."
              />
            </Card>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="outline" onClick={() => void run({ append: false })} disabled={loading}>{loading ? "조회 중..." : "다시 조회"}</Button>
          <Button variant="primary" onClick={() => void run({ append: true, cursor: nextCursor })} disabled={loading || !hasMore || !nextCursor}>
            {loading ? "로딩..." : hasMore ? "더 보기" : "마지막 페이지"}
          </Button>
        </div>
      </Container>
    </main>
  );
}
