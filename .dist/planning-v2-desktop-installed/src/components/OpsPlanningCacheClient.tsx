"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type OpsPlanningCacheClientProps = {
  csrf: string;
};

type StatsPayload = {
  ok?: boolean;
  message?: string;
  data?: {
    entries?: {
      total?: number;
      byKind?: Record<string, number>;
    };
    usage?: {
      updatedAt?: string;
      totalLookups?: number;
      hitRate?: number;
      totals?: {
        hits?: number;
        misses?: number;
      };
      byKind?: Record<string, { hits?: number; misses?: number }>;
    };
  };
};

type PurgePayload = {
  ok?: boolean;
  message?: string;
  data?: {
    purged?: number;
  };
};

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function toPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function toNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function OpsPlanningCacheClient(props: OpsPlanningCacheClientProps) {
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<StatsPayload["data"] | null>(null);

  const hasCsrf = props.csrf.trim().length > 0;

  const loadStats = useCallback(async () => {
    if (!hasCsrf) {
      setLoading(false);
      setStats(null);
      setError("Dev unlock/CSRF가 없어 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/ops/planning-cache/stats?csrf=${encodeURIComponent(props.csrf)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as StatsPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.message ?? "캐시 통계 조회에 실패했습니다.");
      }
      setStats(payload.data);
    } catch (loadError) {
      setStats(null);
      setError(loadError instanceof Error ? loadError.message : "캐시 통계 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [hasCsrf, props.csrf]);

  const purgeCache = useCallback(async () => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다.");
      return;
    }

    setPurging(true);
    try {
      const response = await fetch("/api/ops/planning-cache/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: props.csrf }),
      });
      const payload = (await response.json().catch(() => null)) as PurgePayload | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "만료 캐시 정리에 실패했습니다.");
      }

      window.alert(payload.message ?? `정리 완료: ${toNum(payload.data?.purged)}건`);
      await loadStats();
    } catch (purgeError) {
      window.alert(purgeError instanceof Error ? purgeError.message : "만료 캐시 정리 중 오류가 발생했습니다.");
    } finally {
      setPurging(false);
    }
  }, [hasCsrf, loadStats, props.csrf]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const kindRows = useMemo(() => {
    const byKind = stats?.entries?.byKind ?? {};
    const usageByKind = stats?.usage?.byKind ?? {};
    return ["simulate", "scenarios", "monteCarlo", "actions"].map((kind) => {
      const hits = toNum(usageByKind[kind]?.hits);
      const misses = toNum(usageByKind[kind]?.misses);
      const total = hits + misses;
      return {
        kind,
        entries: toNum(byKind[kind]),
        hits,
        misses,
        hitRate: total > 0 ? hits / total : 0,
      };
    });
  }, [stats?.entries?.byKind, stats?.usage?.byKind]);

  return (
    <PageShell>
      <PageHeader
        title="플래닝 캐시"
        description="플래닝 v2 API 캐시 상태/히트율을 조회하고 만료 엔트리를 정리합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadStats()} disabled={loading || purging || !hasCsrf}>
              {loading ? "로딩 중..." : "새로고침"}
            </Button>
            <Button type="button" size="sm" onClick={() => void purgeCache()} disabled={purging || !hasCsrf}>
              {purging ? "정리 중..." : "만료 캐시 정리"}
            </Button>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      <Card className="mb-6 border border-amber-200 bg-amber-50">
        <p className="text-sm font-semibold text-amber-900">Monte Carlo 예산 규칙</p>
        <p className="mt-1 text-xs text-amber-800">
          <code>paths * horizonMonths &lt;= 8,000,000</code>
          {" "}범위를 초과하면 요청을 거부합니다.
        </p>
      </Card>

      {error ? (
        <Card>
          <p className="text-sm font-semibold text-rose-600">{error}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-black text-slate-900">캐시 요약</h2>
        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">총 엔트리: <span className="font-semibold">{toNum(stats?.entries?.total)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">히트 수: <span className="font-semibold">{toNum(stats?.usage?.totals?.hits)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">미스 수: <span className="font-semibold">{toNum(stats?.usage?.totals?.misses)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">히트율: <span className="font-semibold">{toPercent(stats?.usage?.hitRate)}</span></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">갱신 시각: {formatDateTime(stats?.usage?.updatedAt)}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2">종류</th>
                <th className="px-2 py-2">엔트리</th>
                <th className="px-2 py-2">히트</th>
                <th className="px-2 py-2">미스</th>
                <th className="px-2 py-2">히트율</th>
              </tr>
            </thead>
            <tbody>
              {kindRows.map((row) => (
                <tr key={row.kind} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-semibold text-slate-900">{row.kind}</td>
                  <td className="px-2 py-2">{row.entries}</td>
                  <td className="px-2 py-2">{row.hits}</td>
                  <td className="px-2 py-2">{row.misses}</td>
                  <td className="px-2 py-2">{toPercent(row.hitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}
