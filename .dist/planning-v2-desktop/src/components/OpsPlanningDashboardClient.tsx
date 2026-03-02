"use client";

import Link from "next/link";
import { useState } from "react";
import { copyToClipboard } from "@/lib/browser/clipboard";
import { resolveClientApiError } from "@/lib/http/clientApiError";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type MetricRow = {
  label: string;
  value: number;
};

type DiffPreview = {
  caseId: string;
  summary: string;
};

type OpsPlanningDashboardClientProps = {
  csrf: string;
  assumptions: {
    snapshotId?: string;
    asOf?: string;
    fetchedAt?: string;
    missing: boolean;
    warningsCount: number;
    sourcesCount: number;
    staleDays?: number;
    historyCount: number;
    metrics: MetricRow[];
  };
  regression: {
    generatedAt?: string;
    totalCases: number;
    passCount: number;
    failCount: number;
    topFails: DiffPreview[];
  };
  cache: {
    totalEntries: number;
    byKind: Record<string, number>;
    totalLookups: number;
    hitRate: number;
    updatedAt?: string;
  };
  store: {
    profilesCount: number;
    runsCount: number;
    approxBytes: number;
  };
  doctor: {
    ok: boolean;
    missing: string[];
    invalidJson: string[];
    counts: {
      profiles: number;
      runs: number;
      assumptionsHistory: number;
    };
    optionalMissing: string[];
    notes: string[];
  };
};

type RefreshPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

type PurgePayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
  data?: {
    purged?: number;
  };
};

type DoctorPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
  data?: OpsPlanningDashboardClientProps["doctor"];
};

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function staleTag(days: number | undefined): { label: string; className: string } {
  if (typeof days !== "number" || !Number.isFinite(days)) {
    return { label: "신선도 경과일: -", className: "text-slate-500" };
  }
  if (days > 120) {
    return { label: `신선도 경과일: ${days}일 (치명)`, className: "text-rose-700 font-semibold" };
  }
  if (days > 45) {
    return { label: `신선도 경과일: ${days}일 (경고)`, className: "text-amber-700 font-semibold" };
  }
  return { label: `신선도 경과일: ${days}일`, className: "text-emerald-700 font-semibold" };
}

export function OpsPlanningDashboardClient(props: OpsPlanningDashboardClientProps) {
  const [syncing, setSyncing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [runningDoctor, setRunningDoctor] = useState(false);
  const [doctorStrict, setDoctorStrict] = useState(false);
  const [doctorReport, setDoctorReport] = useState(props.doctor);
  const hasCsrf = props.csrf.trim().length > 0;
  const stale = staleTag(props.assumptions.staleDays);

  async function refreshSnapshotNow(): Promise<void> {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 없어 동기화할 수 없습니다.");
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch("/api/ops/assumptions/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: props.csrf }),
      });
      const payload = (await response.json().catch(() => null)) as RefreshPayload | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "스냅샷 동기화에 실패했습니다.");
        throw new Error(`${apiError.message}${apiError.fixHref ? ` (${apiError.fixHref})` : ""}`);
      }
      window.alert(payload.message ?? "스냅샷 동기화를 완료했습니다.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "스냅샷 동기화 중 오류가 발생했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  async function purgeExpiredCache(): Promise<void> {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 없어 정리할 수 없습니다.");
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
        const apiError = resolveClientApiError(payload, "만료 캐시 정리에 실패했습니다.");
        throw new Error(`${apiError.message}${apiError.fixHref ? ` (${apiError.fixHref})` : ""}`);
      }
      window.alert(payload.message ?? `만료 캐시 ${payload?.data?.purged ?? 0}건을 정리했습니다.`);
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "만료 캐시 정리 중 오류가 발생했습니다.");
    } finally {
      setPurging(false);
    }
  }

  async function copyRegressionCommand(): Promise<void> {
    const result = await copyToClipboard("pnpm planning:v2:regress");
    if (result.ok) {
      window.alert("회귀 실행 명령을 복사했습니다.");
      return;
    }
    window.alert(result.message ?? "명령 복사에 실패했습니다.");
  }

  async function runPlanningDoctor(): Promise<void> {
    if (!hasCsrf) {
      window.alert("Dev unlock/CSRF가 없어 doctor를 실행할 수 없습니다.");
      return;
    }

    setRunningDoctor(true);
    try {
      const response = await fetch("/api/ops/planning/doctor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: props.csrf, strict: doctorStrict }),
      });
      const payload = (await response.json().catch(() => null)) as DoctorPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        const apiError = resolveClientApiError(payload, "planning doctor 실행에 실패했습니다.");
        throw new Error(`${apiError.message}${apiError.fixHref ? ` (${apiError.fixHref})` : ""}`);
      }
      setDoctorReport(payload.data);
      window.alert(payload.message ?? "planning doctor 실행을 완료했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "planning doctor 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningDoctor(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Ops 플래닝 운영"
        description="플래닝 운영 상태를 한 화면에서 점검하고 동기화/정리 액션을 실행합니다. (Dev only)"
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops/planning-cleanup">
              <Button type="button" variant="outline" size="sm">플래닝 정리</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" variant="outline" size="sm">Ops 허브</Button>
            </Link>
            <Link href="/planning">
              <Button type="button" variant="outline" size="sm">사용자 화면</Button>
            </Link>
          </div>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">가정 스냅샷 상태</h2>
            <div className="flex items-center gap-2">
              <Link href="/ops/assumptions">
                <Button type="button" variant="outline" size="sm">/ops/assumptions 이동</Button>
              </Link>
              <Button type="button" size="sm" onClick={() => void refreshSnapshotNow()} disabled={syncing || !hasCsrf}>
                {syncing ? "새로고침 중..." : "스냅샷 새로고침"}
              </Button>
            </div>
          </div>

          {!hasCsrf ? <p className="mt-2 text-xs font-semibold text-amber-700">Dev unlock/CSRF가 없어 동기화 버튼이 비활성화됩니다.</p> : null}

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">스냅샷 ID: <span className="font-semibold">{props.assumptions.snapshotId ?? "-"}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">누락 여부: <span className="font-semibold">{props.assumptions.missing ? "true" : "false"}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">asOf: <span className="font-semibold">{props.assumptions.asOf ?? "-"}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">fetchedAt: <span className="font-semibold">{formatDateTime(props.assumptions.fetchedAt)}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">경고 수: <span className="font-semibold">{props.assumptions.warningsCount}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">소스 수: <span className="font-semibold">{props.assumptions.sourcesCount}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">히스토리 개수: <span className="font-semibold">{props.assumptions.historyCount}</span></div>
            <div className={`rounded-md border border-slate-200 bg-slate-50 px-3 py-2 ${stale.className}`}>{stale.label}</div>
          </div>

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            {props.assumptions.metrics.length > 0 ? props.assumptions.metrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                {metric.label}: <span className="font-semibold">{formatMetric(metric.value)}</span>
              </div>
            )) : <p className="text-xs text-slate-500">표시 가능한 주요 금리/물가 값이 없습니다.</p>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">회귀 상태</h2>
            <div className="flex items-center gap-2">
              <Link href="/ops/planning-eval">
                <Button type="button" variant="outline" size="sm">/ops/planning-eval 이동</Button>
              </Link>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyRegressionCommand()}>
                CLI 명령 복사
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">마지막 실행: <span className="font-semibold">{formatDateTime(props.regression.generatedAt)}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">총 케이스: <span className="font-semibold">{props.regression.totalCases}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">통과: <span className="font-semibold">{props.regression.passCount}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">실패: <span className="font-semibold">{props.regression.failCount}</span></div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-black text-slate-900">상위 실패 케이스 (최대 5건)</h3>
            {props.regression.topFails.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">실패 케이스가 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {props.regression.topFails.map((row) => (
                  <li key={row.caseId} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    <p className="font-semibold">{row.caseId}</p>
                    <p className="mt-1 truncate">{row.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">캐시 상태</h2>
            <div className="flex items-center gap-2">
              <Link href="/ops/planning-cache">
                <Button type="button" variant="outline" size="sm">/ops/planning-cache 이동</Button>
              </Link>
              <Button type="button" size="sm" onClick={() => void purgeExpiredCache()} disabled={purging || !hasCsrf}>
                {purging ? "정리 중..." : "만료 캐시 정리"}
              </Button>
            </div>
          </div>

          {!hasCsrf ? <p className="mt-2 text-xs font-semibold text-amber-700">Dev unlock/CSRF가 없어 purge 버튼이 비활성화됩니다.</p> : null}

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">총 엔트리: <span className="font-semibold">{props.cache.totalEntries}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">총 조회: <span className="font-semibold">{props.cache.totalLookups}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">히트율: <span className="font-semibold">{formatPercent(props.cache.hitRate)}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">갱신 시각: <span className="font-semibold">{formatDateTime(props.cache.updatedAt)}</span></div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">종류</th>
                  <th className="px-2 py-2">엔트리</th>
                </tr>
              </thead>
              <tbody>
                {["simulate", "scenarios", "monteCarlo", "actions"].map((kind) => (
                  <tr key={kind} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-semibold text-slate-900">{kind}</td>
                    <td className="px-2 py-2">{props.cache.byKind[kind] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">저장소 상태</h2>
            <Link href="/planning">
              <Button type="button" variant="outline" size="sm">/planning 이동</Button>
            </Link>
          </div>

          <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">프로필 수: <span className="font-semibold">{props.store.profilesCount}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">실행 기록 수: <span className="font-semibold">{props.store.runsCount}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">예상 용량: <span className="font-semibold">{formatBytes(props.store.approxBytes)}</span></div>
          </div>

          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900">플래닝 무결성 점검(Doctor)</h3>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={doctorStrict}
                    onChange={(event) => setDoctorStrict(event.target.checked)}
                  />
                  strict
                </label>
                <Button type="button" size="sm" onClick={() => void runPlanningDoctor()} disabled={!hasCsrf || runningDoctor}>
                  {runningDoctor ? "실행 중..." : "Doctor 실행"}
                </Button>
              </div>
            </div>

            {!hasCsrf ? <p className="mt-2 text-xs font-semibold text-amber-700">Dev unlock/CSRF가 없어 doctor 버튼이 비활성화됩니다.</p> : null}

            <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">정상 여부: <span className="font-semibold">{doctorReport.ok ? "true" : "false"}</span></div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">누락: <span className="font-semibold">{doctorReport.missing.length}</span></div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">손상 JSON: <span className="font-semibold">{doctorReport.invalidJson.length}</span></div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">선택 누락: <span className="font-semibold">{doctorReport.optionalMissing.length}</span></div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">프로필 수: <span className="font-semibold">{doctorReport.counts.profiles}</span></div>
              <div className="rounded-md border border-slate-200 bg-white px-2 py-1">실행 기록 수: <span className="font-semibold">{doctorReport.counts.runs}</span></div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">누락 항목</p>
                {doctorReport.missing.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-[11px] text-amber-700">
                    {doctorReport.missing.slice(0, 8).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                ) : <p className="mt-1 text-[11px] text-slate-500">없음</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800">손상 JSON</p>
                {doctorReport.invalidJson.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-[11px] text-rose-700">
                    {doctorReport.invalidJson.slice(0, 8).map((item) => <li key={item}>- {item}</li>)}
                  </ul>
                ) : <p className="mt-1 text-[11px] text-slate-500">없음</p>}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
