"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type BenefitsMeta = {
  upstreamTotalCount?: number;
  neededPagesEstimate?: number;
  uniqueCount?: number;
  truncatedByLimit?: boolean;
  truncatedByMaxPages?: boolean;
  paginationSuspected?: boolean;
  snapshot?: {
    fromCache?: string;
    generatedAt?: string;
    ageMs?: number;
    totalItemsInSnapshot?: number;
  };
};

type CoveragePayload = {
  totalItems: number;
  fieldsCoverage: Record<string, number>;
  lengthStats: { eligibilityP50: number; eligibilityP90: number };
  qualityBuckets: Record<string, number>;
};

type FinlifeSummary = {
  kind: string;
  products: number;
  options: number;
  pagesFetched?: number;
};

const FINLIFE_KINDS = [
  "deposit",
  "saving",
  "pension",
  "mortgage-loan",
  "rent-house-loan",
  "credit-loan",
] as const;

export function DevDataDashboardClient() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [benefitsMeta, setBenefitsMeta] = useState<BenefitsMeta>({});
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [finlife, setFinlife] = useState<FinlifeSummary[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [benefitsRes, coverageRes, finlifeRows] = await Promise.all([
        fetch("/api/public/benefits/search?mode=all&scan=all&maxPages=auto&rows=200&limit=1", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/dev/benefits/coverage?maxPages=20&rows=200&limit=5000", { cache: "no-store" }).then((r) => r.json()),
        Promise.all(
          FINLIFE_KINDS.map(async (kind) => {
            const json = await fetch(`/api/finlife/${kind}?scan=all&pageNo=1&topFinGrpNo=020000`, { cache: "no-store" }).then((r) => r.json());
            const products = Array.isArray(json?.data) ? json.data.length : 0;
            const options = Array.isArray(json?.data)
              ? json.data.reduce((sum: number, item: { options?: unknown[] }) => sum + (Array.isArray(item?.options) ? item.options.length : 0), 0)
              : 0;
            return {
              kind,
              products,
              options,
              pagesFetched: typeof json?.meta?.pagesFetched === "number" ? json.meta.pagesFetched : undefined,
            } as FinlifeSummary;
          }),
        ),
      ]);

      setBenefitsMeta((benefitsRes?.meta ?? {}) as BenefitsMeta);
      setCoverage(coverageRes?.ok ? (coverageRes.data as CoveragePayload) : null);
      setFinlife(finlifeRows);
    } catch {
      setError("대시보드 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const collectionRate = useMemo(() => {
    if (!benefitsMeta.upstreamTotalCount || benefitsMeta.upstreamTotalCount <= 0) return null;
    const unique = benefitsMeta.uniqueCount ?? 0;
    return Math.round((unique / benefitsMeta.upstreamTotalCount) * 1000) / 10;
  }, [benefitsMeta]);

  const handleRefreshSnapshot = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/dev/benefits/snapshot/refresh?maxPages=auto&rows=200", { method: "POST" });
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <main className="py-8">
      <Container>
        <SectionHeader title="데이터 대시보드" subtitle="보조금24 · FINLIFE 수집/품질/커버리지 점검(dev)" />
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void load()}>{loading ? "갱신 중..." : "새로고침"}</Button>
              <Button size="sm" variant="outline" onClick={() => void handleRefreshSnapshot()}>{refreshing ? "재빌드 중..." : "보조금24 스냅샷 강제 새로고침"}</Button>
              <a className="inline-flex h-8 items-center rounded-xl border border-border px-3 text-sm" href="/api/dev/benefits/export?format=csv&scan=all&maxPages=auto&rows=200&limit=2000">
                보조금24 CSV 내보내기
              </a>
              <a className="inline-flex h-8 items-center rounded-xl border border-border px-3 text-sm" href="/dev/git">
                Git 관리자 열기
              </a>
            </div>
            {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          </Card>

          <Card>
            <h3 className="text-base font-semibold">보조금24 현황</h3>
            <p className="mt-2 text-sm text-slate-700">
              업스트림 총량 {benefitsMeta.upstreamTotalCount ?? "?"} · 필요 페이지 {benefitsMeta.neededPagesEstimate ?? "?"} ·
              스냅샷 {benefitsMeta.snapshot?.totalItemsInSnapshot ?? "?"} · 고유 {benefitsMeta.uniqueCount ?? "?"} · 수집률 {collectionRate ?? "?"}%
            </p>
            <p className="mt-1 text-xs text-slate-600">
              snapshot: {benefitsMeta.snapshot?.generatedAt ? new Date(benefitsMeta.snapshot.generatedAt).toLocaleString("ko-KR") : "-"} ({benefitsMeta.snapshot?.fromCache ?? "-"})
            </p>
            <p className="mt-1 text-xs text-slate-600">
              flags: limit={String(Boolean(benefitsMeta.truncatedByLimit))} / maxPages={String(Boolean(benefitsMeta.truncatedByMaxPages))} / pagingSuspected={String(Boolean(benefitsMeta.paginationSuspected))}
            </p>
          </Card>

          <Card>
            <h3 className="text-base font-semibold">보조금24 품질/커버리지</h3>
            {coverage ? (
              <>
                <p className="mt-2 text-sm text-slate-700">coverage: {Object.entries(coverage.fieldsCoverage).map(([k, v]) => `${k} ${v}%`).join(" · ")}</p>
                <p className="mt-1 text-sm text-slate-700">quality: {Object.entries(coverage.qualityBuckets).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
                <p className="mt-1 text-xs text-slate-600">eligibility length: p50 {coverage.lengthStats.eligibilityP50}, p90 {coverage.lengthStats.eligibilityP90}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">로딩 중...</p>
            )}
          </Card>

          <Card>
            <h3 className="text-base font-semibold">FINLIFE 수집 현황</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {finlife.map((row) => (
                <li key={row.kind}>
                  {row.kind}: products {row.products} · options {row.options} · pagesFetched {row.pagesFetched ?? "?"}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Container>
    </main>
  );
}
