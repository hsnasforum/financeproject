"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type FinlifeKind, type FinlifeSourceResult } from "@/lib/finlife/types";
import { parseFinlifeApiResponse } from "@/lib/finlife/apiSchema";
import { uiTextKo } from "@/lib/uiText.ko";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";

type Props = {
  kind: FinlifeKind;
  title: string;
  initialTopFinGrpNo: string;
  initialQuery?: string;
  initialPageNo?: number;
};

type SortKey = "rateDesc" | "nameAsc" | "termAsc";

export function ProductListPage({ kind, title, initialTopFinGrpNo, initialQuery = "", initialPageNo = 1 }: Props) {
  const router = useRouter();
  const [topFinGrpNo, setTopFinGrpNo] = useState(initialTopFinGrpNo);
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [pageNo, setPageNo] = useState(initialPageNo);
  const [sortKey, setSortKey] = useState<SortKey>("rateDesc");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [payload, setPayload] = useState<FinlifeSourceResult | null>(null);

  useEffect(() => {
    let aborted = false;

    async function run() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      params.set("topFinGrpNo", topFinGrpNo);
      params.set("pageNo", String(pageNo));

      try {
        const res = await fetch(`/api/finlife/${kind}?${params.toString()}`, { cache: "no-store" });
        const raw = await res.json();
        const parsed = parseFinlifeApiResponse(raw);

        if (aborted) return;

        if (!parsed.ok) {
          setError(parsed.error?.message ?? "데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
          console.error("[products] api returned error", parsed.error);
          return;
        }

        setPayload(parsed);
      } catch (fetchError) {
        if (aborted) return;
        setError("데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        console.error("[products] fetch/parse failed", fetchError);
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    void run();
    return () => {
      aborted = true;
    };
  }, [kind, topFinGrpNo, pageNo]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("topFinGrpNo", topFinGrpNo);
    params.set("pageNo", String(pageNo));
    if (query) params.set("q", query);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, topFinGrpNo, pageNo, query]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = (payload?.data ?? []).filter((item) => {
      if (!q) return true;
      const name = (item.fin_prdt_nm ?? "").toLowerCase();
      const bank = (item.kor_co_nm ?? "").toLowerCase();
      return name.includes(q) || bank.includes(q);
    });

    return base.sort((a, b) => {
      if (sortKey === "rateDesc") {
        return (b.best?.intr_rate2 ?? -Infinity) - (a.best?.intr_rate2 ?? -Infinity);
      }
      if (sortKey === "termAsc") {
        const ta = Number(a.best?.save_trm ?? 9999);
        const tb = Number(b.best?.save_trm ?? 9999);
        return ta - tb;
      }
      return (a.fin_prdt_nm ?? "").localeCompare(b.fin_prdt_nm ?? "");
    });
  }, [payload?.data, query, sortKey]);

  const hasNext = payload?.meta.hasNext ?? ((payload?.meta.pageNo ?? pageNo) >= 1 && (payload?.data.length ?? 0) > 0);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title={title} subtitle="서버 API를 통해 받은 데이터를 기간/금리 기준으로 비교합니다." />

        <Card className="mb-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setPageNo(1);
              setQuery(queryInput);
            }}
          >
            <label className="text-sm">
              {uiTextKo.product.filterLabel}
              <input
                className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                value={topFinGrpNo}
                onChange={(event) => setTopFinGrpNo(event.target.value)}
              />
            </label>
            <label className="text-sm">
              상품/금융사 검색
              <input
                className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="예: 한빛, 정기예금"
              />
            </label>
            <label className="text-sm">
              정렬
              <select
                className="mt-1 block h-10 rounded-xl border border-border bg-surface px-3 text-sm"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                <option value="rateDesc">최고금리 높은순</option>
                <option value="termAsc">대표기간 짧은순</option>
                <option value="nameAsc">상품명 가나다순</option>
              </select>
            </label>
            <Button type="submit" variant="primary">조회</Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span>현재 페이지: {payload?.meta.pageNo ?? pageNo}</span>
            {query ? <span className="rounded-full bg-surface-muted px-2 py-1">검색어: {query}</span> : null}
          </div>
        </Card>

        <Card className="mb-4 bg-surface-muted">
          <p className="text-sm text-slate-700">
            {uiTextKo.product.modeLabel}: <b>{payload?.mode === "live" ? "실시간" : payload?.mode === "mock" ? "모의" : "-"}</b>
            {payload?.meta.fallbackUsed ? ` (${uiTextKo.product.fallbackMessage})` : ""}
            {payload?.meta.message ? ` | ${payload.meta.message}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">다음 페이지 가능 여부: {hasNext ? "있음(추정)" : "없음"}</p>
        </Card>

        {loading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={`loading-${idx}`} className="animate-pulse">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-3 h-20 rounded bg-slate-100" />
              </Card>
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <Card>
            <p className="text-sm text-red-700">데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
            <p className="mt-1 text-xs text-slate-500">상세: {error}</p>
          </Card>
        ) : null}

        {!loading && !error && filteredSorted.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-700">조건에 맞는 상품이 없습니다. 검색어나 그룹 코드를 바꿔보세요.</p>
          </Card>
        ) : null}

        {!loading && !error && filteredSorted.length > 0 ? (
          <div className="grid gap-4">
            {filteredSorted.map((item) => (
              <Card key={item.fin_prdt_cd} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{item.fin_prdt_nm ?? item.fin_prdt_cd}</h2>
                    <p className="text-sm text-slate-600">{item.kor_co_nm}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">대표 최고금리</p>
                    <p className="text-xl font-semibold text-primary">{item.best?.intr_rate2 ?? "-"}%</p>
                    <p className="text-xs text-slate-500">대표기간 {item.best?.save_trm ?? "-"}개월</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">{uiTextKo.product.optionHint}</p>

                <details className="mt-3 rounded-xl border border-border bg-surface-muted">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-800">
                    {uiTextKo.product.optionSummary} ({item.options.length}개)
                  </summary>
                  <div className="overflow-x-auto p-3">
                    {(() => {
                      const hasRateType = item.options.some(
                        (o) => typeof o.raw.intr_rate_type_nm === "string" && String(o.raw.intr_rate_type_nm).trim() !== "",
                      );
                      const hasReserveType = item.options.some(
                        (o) => typeof o.raw.rsrv_type_nm === "string" && String(o.raw.rsrv_type_nm).trim() !== "",
                      );

                      return (
                        <table className="min-w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-border text-slate-700">
                              <th className="px-2 py-2">{uiTextKo.product.optionTerm}</th>
                              <th className="px-2 py-2">{uiTextKo.product.optionRate}</th>
                              <th className="px-2 py-2">{uiTextKo.product.optionMaxRate}</th>
                              {hasRateType ? <th className="px-2 py-2">{uiTextKo.product.optionRateType}</th> : null}
                              {hasReserveType ? <th className="px-2 py-2">{uiTextKo.product.optionReserveType}</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {item.options.map((o, idx) => (
                              <tr key={`${item.fin_prdt_cd}-${idx}`} className="border-b border-border last:border-b-0">
                                <td className="px-2 py-2">{o.save_trm ?? "-"}</td>
                                <td className="px-2 py-2">{o.intr_rate ?? "-"}</td>
                                <td className="px-2 py-2">{o.intr_rate2 ?? "-"}</td>
                                {hasRateType ? (
                                  <td className="px-2 py-2">
                                    {typeof o.raw.intr_rate_type_nm === "string" ? o.raw.intr_rate_type_nm : "-"}
                                  </td>
                                ) : null}
                                {hasReserveType ? (
                                  <td className="px-2 py-2">
                                    {typeof o.raw.rsrv_type_nm === "string" ? o.raw.rsrv_type_nm : "-"}
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={() => setPageNo((p) => Math.max(1, p - 1))} disabled={pageNo <= 1 || loading}>
            이전 페이지
          </Button>
          <Button type="button" onClick={() => setPageNo((p) => p + 1)} disabled={!hasNext || loading}>
            다음 페이지
          </Button>
        </div>
      </Container>
    </main>
  );
}
