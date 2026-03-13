"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { resolveClientApiError } from "@/lib/http/clientApiError";

type DataQualityStatus = "PASS" | "WARN" | "FAIL";

type DatasetReport = {
  datasetId: string;
  label: string;
  checkedAt: string;
  status: DataQualityStatus;
  staleDays?: number;
  generatedAt?: string;
  totals: {
    rows: number;
    missingRequired: number;
    duplicates: number;
    rateAnomalies: number;
  };
  issues: Array<{
    code: string;
    count: number;
    message: string;
    samples: Array<Record<string, unknown>>;
  }>;
};

type DataQualityPayload = {
  ok?: boolean;
  data?: {
    checkedAt: string;
    overallStatus: DataQualityStatus;
    summary: {
      pass: number;
      warn: number;
      fail: number;
    };
    datasets: DatasetReport[];
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsDataQualityCardProps = {
  csrf: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function statusTone(status: DataQualityStatus): string {
  if (status === "FAIL") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "WARN") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function OpsDataQualityCard({ csrf }: OpsDataQualityCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<DataQualityPayload["data"] | null>(null);
  const hasCsrf = asString(csrf).length > 0;

  const load = useCallback(async (refresh = false) => {
    if (!hasCsrf) {
      setReport(null);
      setError("Dev unlock/CSRF가 없어 data quality를 조회할 수 없습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      if (refresh) params.set("refresh", "1");
      const response = await fetch(`/api/ops/data-quality?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DataQualityPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        const apiError = resolveClientApiError(payload, "data quality 결과를 불러오지 못했습니다.");
        throw new Error(apiError.message);
      }
      setReport(payload.data);
    } catch (loadError) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : "data quality 결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [csrf, hasCsrf]);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-black text-slate-900">External Data Quality</h2>
          <p className="text-xs text-slate-600">Finlife/DART 외부 데이터 스키마·중복·이상치·신선도 점검</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || !hasCsrf}>
            {loading ? "점검 중..." : "지금 점검"}
          </Button>
          <Link href="/ops/doctor">
            <Button type="button" variant="outline" size="sm">Doctor 보기</Button>
          </Link>
        </div>
      </div>

      {!hasCsrf ? (
        <Card className="mt-4 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <DevUnlockShortcutMessage
            className="font-semibold"
            linkClassName="text-amber-900"
            message="Dev unlock/CSRF가 없어 data quality를 조회할 수 없습니다."
          />
        </Card>
      ) : null}

      {loading && !report ? <LoadingState className="mt-4" title="data quality를 점검하는 중입니다" /> : null}
      {error ? <ErrorState className="mt-4" message={error} onRetry={() => void load(false)} retryLabel="다시 시도" /> : null}
      {!loading && !error && !report ? (
        <EmptyState
          className="mt-4"
          title="data quality 결과가 없습니다"
          description="최근 점검 결과를 불러오지 못했습니다."
          actionLabel="다시 시도"
          onAction={() => void load(false)}
          icon="data"
        />
      ) : null}

      {report ? (
        <div className="mt-4 space-y-3">
          <div className={`rounded-md border px-3 py-2 text-xs ${statusTone(report.overallStatus)}`}>
            <span className="font-bold">Overall: {report.overallStatus}</span>
            <span className="ml-3">checkedAt {formatDateTime(report.checkedAt)}</span>
            <span className="ml-3">PASS {report.summary.pass} / WARN {report.summary.warn} / FAIL {report.summary.fail}</span>
          </div>

          {report.datasets.map((dataset) => (
            <div key={dataset.datasetId} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold text-slate-900">{dataset.label} ({dataset.datasetId})</div>
                <div className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(dataset.status)}`}>{dataset.status}</div>
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                rows {dataset.totals.rows} · missing {dataset.totals.missingRequired} · duplicates {dataset.totals.duplicates}
                · rate anomalies {dataset.totals.rateAnomalies}
                {typeof dataset.staleDays === "number" ? ` · stale ${dataset.staleDays}d` : ""}
              </p>

              {dataset.issues.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {dataset.issues.slice(0, 3).map((issue) => (
                    <details key={`${dataset.datasetId}-${issue.code}`} className="rounded border border-slate-200 bg-white p-2 text-xs">
                      <summary className="cursor-pointer font-semibold text-slate-800">
                        {issue.code} ({issue.count})
                      </summary>
                      <p className="mt-1 text-slate-600">{issue.message}</p>
                      {issue.samples.length > 0 ? (
                        <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-700">
                          {JSON.stringify(issue.samples, null, 2)}
                        </pre>
                      ) : null}
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
