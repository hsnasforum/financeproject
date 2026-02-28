"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { type AssumptionsSnapshot } from "@/lib/planning/assumptions/types";

type LatestPayload = {
  ok?: boolean;
  snapshot?: AssumptionsSnapshot;
  snapshotId?: string;
  message?: string;
};

type SyncPayload = {
  ok?: boolean;
  message?: string;
  snapshotSummary?: {
    snapshotId?: string;
    asOf?: string;
    fetchedAt?: string;
    korea?: AssumptionsSnapshot["korea"];
    warningsCount?: number;
    sourcesCount?: number;
  };
};

type OpsAssumptionsClientProps = {
  csrf: string;
  ecosConfigured: boolean;
};

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function toHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "-";
  }
}

export function OpsAssumptionsClient(props: OpsAssumptionsClientProps) {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<AssumptionsSnapshot | null>(null);
  const [snapshotId, setSnapshotId] = useState<string>("");

  const hasCsrf = props.csrf.trim().length > 0;

  const visibleMetrics = useMemo(
    () => [
      { key: "policyRatePct", label: "Policy Rate", value: snapshot?.korea.policyRatePct },
      { key: "callOvernightPct", label: "Call Overnight", value: snapshot?.korea.callOvernightPct },
      { key: "cd91Pct", label: "CD 91D", value: snapshot?.korea.cd91Pct },
      { key: "koribor3mPct", label: "KORIBOR 3M", value: snapshot?.korea.koribor3mPct },
      { key: "msb364Pct", label: "MSB 364D", value: snapshot?.korea.msb364Pct },
      { key: "baseRatePct", label: "Base Rate", value: snapshot?.korea.baseRatePct },
      { key: "cpiYoYPct", label: "CPI YoY", value: snapshot?.korea.cpiYoYPct },
      { key: "coreCpiYoYPct", label: "Core CPI YoY", value: snapshot?.korea.coreCpiYoYPct },
      { key: "newDepositAvgPct", label: "New Deposit Avg", value: snapshot?.korea.newDepositAvgPct },
      { key: "newLoanAvgPct", label: "New Loan Avg", value: snapshot?.korea.newLoanAvgPct },
    ].filter((item) => typeof item.value === "number"),
    [snapshot],
  );

  const loadLatest = useCallback(async () => {
    if (!hasCsrf) {
      setLoading(false);
      setSnapshot(null);
      setError("Dev unlock/CSRF가 없어 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/ops/assumptions/latest?csrf=${encodeURIComponent(props.csrf)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as LatestPayload | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "가정 스냅샷 조회에 실패했습니다.");
      }

      if (!payload?.ok || !payload.snapshot) {
        setSnapshot(null);
        setSnapshotId("");
        setError(payload?.message ?? "저장된 가정 스냅샷이 없습니다.");
        return;
      }

      setSnapshot(payload.snapshot);
      setSnapshotId(typeof payload.snapshotId === "string" ? payload.snapshotId : "");
    } catch (loadError) {
      setSnapshot(null);
      setSnapshotId("");
      setError(loadError instanceof Error ? loadError.message : "가정 스냅샷 조회 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [hasCsrf, props.csrf]);

  const syncNow = useCallback(async () => {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 필요합니다. /ops/rules에서 unlock 후 다시 시도해 주세요.");
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch("/api/ops/assumptions/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: props.csrf }),
      });
      const payload = (await response.json().catch(() => null)) as SyncPayload | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "가정 동기화에 실패했습니다.");
      }

      window.alert(payload.message ?? "가정 스냅샷 동기화를 완료했습니다.");
      await loadLatest();
    } catch (syncError) {
      window.alert(syncError instanceof Error ? syncError.message : "가정 동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }, [hasCsrf, loadLatest, props.csrf]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  return (
    <PageShell>
      <PageHeader
        title="Planning Assumptions"
        description="재무설계 엔진에서 사용하는 공개 매크로 가정 스냅샷을 조회/동기화합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLatest()} disabled={loading || syncing || !hasCsrf}>
              {loading ? "로딩 중..." : "새로고침"}
            </Button>
            <Button type="button" size="sm" onClick={() => void syncNow()} disabled={syncing || !hasCsrf}>
              {syncing ? "동기화 중..." : "Sync now"}
            </Button>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops Hub</Button>
            </Link>
            <Link href="/ops/assumptions/history">
              <Button type="button" variant="outline" size="sm">History / Diff</Button>
            </Link>
            <Link href="/settings/backup">
              <Button type="button" variant="outline" size="sm">Backup / Restore</Button>
            </Link>
          </div>
        )}
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Current Snapshot</h2>
        <p className="mt-2 text-sm text-slate-600">엔진은 네트워크를 호출하지 않고, 마지막 저장된 스냅샷만 사용합니다.</p>

        {!hasCsrf ? (
          <p className="mt-3 text-sm font-semibold text-amber-700">Dev unlock/CSRF가 없어 조회/동기화가 차단됩니다.</p>
        ) : null}

        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">snapshotId: <span className="font-semibold">{snapshotId || "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">asOf: <span className="font-semibold">{snapshot?.asOf ?? "-"}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">fetchedAt: <span className="font-semibold">{formatDateTime(snapshot?.fetchedAt)}</span></div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">ECOS configured: <span className="font-semibold">{props.ecosConfigured ? "true" : "false"}</span></div>
        </div>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
          {visibleMetrics.length > 0 ? visibleMetrics.map((metric) => (
            <div key={metric.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              {metric.label}: <span className="font-semibold">{formatMetric(metric.value)}</span>
            </div>
          )) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">표시 가능한 금리/물가 값이 없습니다.</div>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-black text-slate-900">Warnings ({snapshot?.warnings.length ?? 0})</h3>
            {snapshot && snapshot.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-rose-700">
                {snapshot.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>- {warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">경고 없음</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-black text-slate-900">Sources ({snapshot?.sources.length ?? 0})</h3>
            {snapshot && snapshot.sources.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {snapshot.sources.map((source, index) => (
                  <li key={`${source.name}-${index}`}>
                    - {source.name} ({toHost(source.url)} / {formatDateTime(source.fetchedAt)})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">소스 정보 없음</p>
            )}
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
