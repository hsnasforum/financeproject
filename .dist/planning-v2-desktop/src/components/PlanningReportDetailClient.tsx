"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CandidateComparisonSection from "@/app/planning/reports/_components/CandidateComparisonSection";
import ReportAdvancedRaw from "@/app/planning/reports/_components/ReportAdvancedRaw";
import ReportDashboard from "@/app/planning/reports/_components/ReportDashboard";
import { toInterpretationInputFromReportVM } from "@/app/planning/reports/_lib/reportInterpretationAdapter";
import { buildReportVM } from "@/app/planning/reports/_lib/reportViewModel";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { readDevCsrfToken } from "@/lib/dev/clientCsrf";
import { formatDate } from "@/lib/planning/i18n/format";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import { computeRunDelta } from "@/lib/planning/v2/scenario";

type ReportDetail = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
  markdown: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

type Props = {
  id: string;
};

type BaselineRunOption = {
  id: string;
  title?: string;
  createdAt: string;
  overallStatus?: PlanningRunRecord["overallStatus"];
};

type RawBlobPreview = {
  text: string;
  nextCursor: number;
  hasMore: boolean;
  totalChars: number;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusBadge(input: {
  worstCashKrw?: number;
  criticalWarnings?: number;
  dsrPct?: number;
  totalWarnings?: number;
  goalsAchieved?: string;
}) {
  const goalsAchieved = asString(input.goalsAchieved);
  const [achievedRaw, totalRaw] = goalsAchieved.split("/");
  const achieved = Number(achievedRaw);
  const total = Number(totalRaw);
  const missedGoal = Number.isFinite(achieved) && Number.isFinite(total) && total > achieved;

  const worstCash = input.worstCashKrw ?? 0;
  const criticalWarnings = input.criticalWarnings ?? 0;
  const dsrPct = input.dsrPct ?? 0;
  const totalWarnings = input.totalWarnings ?? 0;

  if (worstCash <= 0 || criticalWarnings > 0 || dsrPct >= 60) {
    return {
      label: "위험",
      className: "border-rose-200 bg-rose-50 text-rose-800",
      reason: "현금 부족/치명 경고/높은 DSR 신호가 있어 즉시 조정이 필요합니다.",
    };
  }
  if (dsrPct >= 40 || totalWarnings >= 8 || missedGoal) {
    return {
      label: "주의",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      reason: "일부 지표가 경고 구간입니다. 목표/지출/부채 전략을 점검하세요.",
    };
  }
  return {
    label: "양호",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    reason: "현재 지표 기준으로는 큰 위험 신호가 관측되지 않았습니다.",
  };
}

export default function PlanningReportDetailClient({ id }: Props) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [run, setRun] = useState<PlanningRunRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resolvedRunId, setResolvedRunId] = useState("");
  const [advancedRawRunPreview, setAdvancedRawRunPreview] = useState<RawBlobPreview | null>(null);
  const [advancedRawLoading, setAdvancedRawLoading] = useState(false);
  const [advancedRawError, setAdvancedRawError] = useState("");
  const [baselineOptions, setBaselineOptions] = useState<BaselineRunOption[]>([]);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [baselineRun, setBaselineRun] = useState<PlanningRunRecord | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineError, setBaselineError] = useState("");

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError("");
      setReport(null);
      setRun(null);
      setResolvedRunId("");
      setAdvancedRawRunPreview(null);
      setAdvancedRawLoading(false);
      setAdvancedRawError("");
      setBaselineOptions([]);
      setBaselineRunId("");
      setBaselineRun(null);
      setBaselineLoading(false);
      setBaselineError("");

      try {
        const runRes = await fetch(`/api/planning/v2/runs/${encodeURIComponent(id)}`, { cache: "no-store" });
        const runPayload = (await runRes.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (runRes.ok && runPayload?.ok && runPayload.data) {
          setRun(runPayload.data);
          setResolvedRunId(runPayload.data.id);
          return;
        }

        const reportRes = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
        const reportPayload = (await reportRes.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
        if (!active) return;
        if (!reportRes.ok || !reportPayload?.ok || !reportPayload.data) {
          setError("실행 기록을 찾을 수 없습니다. /planning/reports에서 실행 기록을 선택하세요.");
          return;
        }

        setReport(reportPayload.data);
        const fallbackRunId = asString(reportPayload.data.runId);
        if (!fallbackRunId) {
          setError("이 리포트는 연결된 실행 기록(runId)이 없습니다.");
          return;
        }
        const fallbackRunRes = await fetch(`/api/planning/v2/runs/${encodeURIComponent(fallbackRunId)}`, { cache: "no-store" });
        const fallbackRunPayload = (await fallbackRunRes.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (!fallbackRunRes.ok || !fallbackRunPayload?.ok || !fallbackRunPayload.data) {
          setError(fallbackRunPayload?.error?.message ?? "연결된 실행 기록을 불러오지 못했습니다.");
          return;
        }
        setRun(fallbackRunPayload.data);
        setResolvedRunId(fallbackRunPayload.data.id);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "리포트 로드 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    let active = true;

    async function loadAdvancedRawPreview(mode: "reset" | "append"): Promise<void> {
      const fallbackRunId = run?.id || asString(report?.runId);
      const runId = resolvedRunId || fallbackRunId;
      if (!advancedOpen) return;
      if (!runId) return;
      if (advancedRawLoading) return;
      if (!runId || runId === "-") return;
      if (mode === "append" && !advancedRawRunPreview?.hasMore) return;

      setAdvancedRawLoading(true);
      setAdvancedRawError("");
      try {
        const csrf = readDevCsrfToken();
        const cursor = mode === "append" ? (advancedRawRunPreview?.nextCursor ?? 0) : 0;
        const params = new URLSearchParams();
        params.set("view", "preview");
        params.set("chunkChars", "20000");
        params.set("cursor", String(cursor));
        params.set("gzip", "1");
        if (csrf) params.set("csrf", csrf);
        const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}/blob/raw?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<{
          text?: string;
          nextCursor?: number;
          hasMore?: boolean;
          totalChars?: number;
        }> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok) {
          const message = payload?.error?.message ?? "고급 원문 로드에 실패했습니다.";
          setAdvancedRawError(message);
          return;
        }
        const nextChunkText = typeof payload.data?.text === "string" ? payload.data.text : "";
        const nextCursor = Number(payload.data?.nextCursor ?? 0);
        const hasMore = payload.data?.hasMore === true;
        const totalChars = Math.max(nextChunkText.length, Number(payload.data?.totalChars ?? nextChunkText.length));
        setAdvancedRawRunPreview((prev) => {
          if (mode === "append" && prev) {
            return {
              text: `${prev.text}${nextChunkText}`,
              nextCursor: Number.isFinite(nextCursor) ? Math.max(prev.nextCursor, nextCursor) : prev.nextCursor,
              hasMore,
              totalChars: Number.isFinite(totalChars) ? Math.max(prev.totalChars, totalChars) : prev.totalChars,
            };
          }
          return {
            text: nextChunkText,
            nextCursor: Number.isFinite(nextCursor) ? Math.max(0, nextCursor) : nextChunkText.length,
            hasMore,
            totalChars: Number.isFinite(totalChars) ? Math.max(nextChunkText.length, totalChars) : nextChunkText.length,
          };
        });
      } catch (loadError) {
        if (!active) return;
        setAdvancedRawError(loadError instanceof Error ? loadError.message : "고급 원문 로드에 실패했습니다.");
      } finally {
        if (active) setAdvancedRawLoading(false);
      }
    }

    if (advancedOpen && advancedRawRunPreview === null) {
      void loadAdvancedRawPreview("reset");
    }
    return () => {
      active = false;
    };
  }, [advancedOpen, advancedRawLoading, advancedRawRunPreview, report?.runId, resolvedRunId, run?.id]);

  async function handleLoadMoreAdvancedRaw(): Promise<void> {
    const fallbackRunId = run?.id || asString(report?.runId);
    const runId = resolvedRunId || fallbackRunId;
    if (!runId || advancedRawLoading) return;
    const csrf = readDevCsrfToken();
    const cursor = advancedRawRunPreview?.nextCursor ?? 0;
    const params = new URLSearchParams();
    params.set("view", "preview");
    params.set("chunkChars", "20000");
    params.set("cursor", String(cursor));
    params.set("gzip", "1");
    if (csrf) params.set("csrf", csrf);

    setAdvancedRawLoading(true);
    setAdvancedRawError("");
    try {
      const response = await fetch(`/api/planning/runs/${encodeURIComponent(runId)}/blob/raw?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ApiResponse<{
        text?: string;
        nextCursor?: number;
        hasMore?: boolean;
        totalChars?: number;
      }> | null;
      if (!response.ok || !payload?.ok) {
        setAdvancedRawError(payload?.error?.message ?? "고급 원문 로드에 실패했습니다.");
        return;
      }
      const nextChunkText = typeof payload.data?.text === "string" ? payload.data.text : "";
      const nextCursor = Number(payload.data?.nextCursor ?? 0);
      const hasMore = payload.data?.hasMore === true;
      const totalChars = Math.max(nextChunkText.length, Number(payload.data?.totalChars ?? nextChunkText.length));
      setAdvancedRawRunPreview((prev) => ({
        text: `${prev?.text ?? ""}${nextChunkText}`,
        nextCursor: Number.isFinite(nextCursor) ? Math.max(prev?.nextCursor ?? 0, nextCursor) : (prev?.nextCursor ?? 0),
        hasMore,
        totalChars: Number.isFinite(totalChars) ? Math.max(prev?.totalChars ?? 0, totalChars) : (prev?.totalChars ?? 0),
      }));
    } catch (error) {
      setAdvancedRawError(error instanceof Error ? error.message : "고급 원문 로드에 실패했습니다.");
    } finally {
      setAdvancedRawLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadBaselineOptions(): Promise<void> {
      if (!run?.profileId) {
        setBaselineOptions([]);
        setBaselineRunId("");
        return;
      }
      try {
        const response = await fetch(`/api/planning/v2/runs?profileId=${encodeURIComponent(run.profileId)}&limit=20`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord[]> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
          setBaselineOptions([]);
          setBaselineRunId("");
          return;
        }
        const options = payload.data
          .filter((entry) => entry.id !== run.id)
          .filter((entry) => entry.overallStatus === "SUCCESS" || entry.overallStatus === "PARTIAL_SUCCESS")
          .map((entry) => ({
            id: entry.id,
            ...(entry.title ? { title: entry.title } : {}),
            createdAt: entry.createdAt,
            ...(entry.overallStatus ? { overallStatus: entry.overallStatus } : {}),
          }));
        setBaselineOptions(options);
        const scenarioBaseline = asString(run.scenario?.baselineRunId);
        setBaselineRunId((prev) => {
          if (prev && options.some((option) => option.id === prev)) return prev;
          if (scenarioBaseline && options.some((option) => option.id === scenarioBaseline)) return scenarioBaseline;
          return options[0]?.id ?? "";
        });
      } catch {
        if (!active) return;
        setBaselineOptions([]);
        setBaselineRunId("");
      }
    }
    void loadBaselineOptions();
    return () => {
      active = false;
    };
  }, [run?.id, run?.profileId, run?.scenario?.baselineRunId]);

  useEffect(() => {
    let active = true;
    async function loadBaselineRun(): Promise<void> {
      if (!baselineRunId) {
        setBaselineRun(null);
        setBaselineError("");
        return;
      }
      setBaselineLoading(true);
      setBaselineError("");
      try {
        const response = await fetch(`/api/planning/runs/${encodeURIComponent(baselineRunId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !payload.data) {
          setBaselineRun(null);
          setBaselineError(payload?.error?.message ?? "기준 실행을 불러오지 못했습니다.");
          return;
        }
        setBaselineRun(payload.data);
      } catch (error) {
        if (!active) return;
        setBaselineRun(null);
        setBaselineError(error instanceof Error ? error.message : "기준 실행을 불러오지 못했습니다.");
      } finally {
        if (active) setBaselineLoading(false);
      }
    }
    void loadBaselineRun();
    return () => {
      active = false;
    };
  }, [baselineRunId]);

  const vm = useMemo(
    () => buildReportVM(run, report ?? { id }),
    [id, report, run],
  );
  const baselineVm = useMemo(
    () => baselineRun
      ? buildReportVM(baselineRun, { id: baselineRun.id, runId: baselineRun.id, createdAt: baselineRun.createdAt })
      : null,
    [baselineRun],
  );
  const runDelta = useMemo(
    () => (baselineVm ? computeRunDelta(baselineVm, vm) : null),
    [baselineVm, vm],
  );
  const interpretationInput = useMemo(
    () => toInterpretationInputFromReportVM(vm),
    [vm],
  );
  const badge = useMemo(
    () => statusBadge({
      worstCashKrw: vm.summaryCards.worstCashKrw,
      criticalWarnings: vm.summaryCards.criticalWarnings,
      dsrPct: vm.summaryCards.dsrPct,
      totalWarnings: vm.summaryCards.totalWarnings,
      goalsAchieved: vm.summaryCards.goalsAchieved,
    }),
    [vm.summaryCards],
  );
  const simulateStage = vm.stage.byId.simulate;
  const canRenderInterpretability = !simulateStage || simulateStage.status === "SUCCESS";
  const selectedProfileId = run?.profileId ?? "";
  const planningHref = appendProfileIdQuery("/planning", selectedProfileId);
  const runsHref = appendProfileIdQuery("/planning/runs", selectedProfileId);
  const reportsHubHref = appendProfileIdQuery("/planning/reports", selectedProfileId);

  return (
    <PageShell>
      <PageHeader
        title="재무설계 리포트"
        description="run 기반 대시보드"
        action={(
          <div className="flex items-center gap-3 text-sm">
            <Link className="font-semibold text-emerald-700" href={planningHref}>플래닝</Link>
            <Link className="font-semibold text-emerald-700" href={reportsHubHref}>리포트</Link>
            <Link className="font-semibold text-emerald-700" href={runsHref}>실행 기록</Link>
          </div>
        )}
      />

      {loading ? (
        <LoadingState title="리포트를 불러오는 중입니다" testId="planning-reports-loading-state" />
      ) : error ? (
        <ErrorState message={error} testId="planning-reports-error-state" />
      ) : !run ? (
        <EmptyState
          title="표시할 리포트 데이터가 없습니다"
          description="실행 기록을 다시 선택하거나 새로고침 후 다시 시도하세요."
          icon="data"
        />
      ) : (
        <div className="space-y-5" data-testid="planning-reports-detail-root">
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">id</span>: {vm.header.reportId}</p>
                <p><span className="font-semibold text-slate-900">createdAt</span>: {formatDate("ko-KR", vm.header.createdAt)}</p>
                <p><span className="font-semibold text-slate-900">runId</span>: {vm.header.runId}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}>
                상태: {badge.label}
              </span>
            </div>

            <p className="text-xs text-slate-600">{badge.reason}</p>

            <div className="flex flex-wrap gap-2">
              <a
                aria-label="리포트 보기"
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                href={`/api/planning/v2/runs/${encodeURIComponent(resolvedRunId || vm.header.runId)}/report`}
                rel="noreferrer"
                target="_blank"
              >
                리포트 보기
              </a>
              <a
                aria-label="리포트 HTML 다운로드"
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-slate-50"
                href={`/api/planning/v2/runs/${encodeURIComponent(resolvedRunId || vm.header.runId)}/report?download=1`}
              >
                다운로드(HTML)
              </a>
              <a
                aria-label="리포트 HTML export"
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-slate-50"
                href={`/api/planning/reports/${encodeURIComponent(resolvedRunId || vm.header.runId)}/export.html`}
              >
                Export HTML
              </a>
              <Button
                aria-controls="planning-reports-advanced-panel"
                aria-expanded={advancedOpen}
                data-testid="planning-reports-advanced-toggle"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                size="sm"
                variant="outline"
              >
                {advancedOpen ? "고급 보기 닫기" : "고급 보기"}
              </Button>
            </div>
          </Card>

          {canRenderInterpretability ? (
            <InterpretabilityGuideCard
              aggregatedWarnings={interpretationInput.aggregatedWarnings}
              goals={interpretationInput.goals}
              summaryMetrics={interpretationInput.summary}
              outcomes={interpretationInput.outcomes}
            />
          ) : (
            <Card className="p-5 text-sm text-slate-700">
              해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
            </Card>
          )}

          <ReportDashboard vm={vm} />

          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">기준 실행 대비 비교 (What-if)</h2>
              <select
                className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
                value={baselineRunId}
                onChange={(event) => setBaselineRunId(event.target.value)}
              >
                <option value="">기준 실행 선택</option>
                {baselineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title ? `${option.title} · ` : ""}{option.id.slice(0, 8)} · {formatDate("ko-KR", option.createdAt)}
                  </option>
                ))}
              </select>
            </div>
            {baselineLoading ? <LoadingState title="기준 실행 비교를 준비하는 중입니다" /> : null}
            {baselineError ? <ErrorState message={baselineError} /> : null}
            {!baselineLoading && !baselineError && runDelta ? (
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">지표</th>
                        <th className="px-3 py-2 text-right">기준</th>
                        <th className="px-3 py-2 text-right">시나리오</th>
                        <th className="px-3 py-2 text-right">변화</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {runDelta.metrics.map((metric) => (
                        <tr key={metric.key}>
                          <td className="px-3 py-2 font-semibold text-slate-900">{metric.label}</td>
                          <td className="px-3 py-2 text-right">{metric.baseline.toLocaleString("ko-KR")}</td>
                          <td className="px-3 py-2 text-right">{metric.scenario.toLocaleString("ko-KR")}</td>
                          <td className="px-3 py-2 text-right">
                            {metric.delta.toLocaleString("ko-KR")}
                            {" "}
                            <span className="text-[11px] text-slate-500">({metric.delta >= 0 ? "증가" : "감소"})</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-600">
                  경고 코드 변화: +{runDelta.warnings.added.length} / -{runDelta.warnings.removed.length}
                  {" · "}
                  목표 달성 수 변화: {runDelta.goals.achievedDelta >= 0 ? "+" : ""}{runDelta.goals.achievedDelta}
                </p>
              </div>
            ) : null}
          </Card>

          {resolvedRunId || vm.header.runId ? (
            <CandidateComparisonSection runId={resolvedRunId || vm.header.runId} />
          ) : null}

          {advancedOpen ? (
            <div className="space-y-2" id="planning-reports-advanced-panel">
              {advancedRawLoading ? (
                <LoadingState title="고급 원문을 불러오는 중입니다" />
              ) : null}
              {advancedRawError ? (
                <ErrorState message={advancedRawError} />
              ) : null}
              <ReportAdvancedRaw
                reproducibility={vm.reproducibility}
                raw={{
                  ...(vm.raw?.reportMarkdown ? { reportMarkdown: vm.raw.reportMarkdown } : {}),
                  ...(advancedRawRunPreview !== null
                    ? {
                      runJsonPreview: {
                        ...advancedRawRunPreview,
                        loading: advancedRawLoading,
                        ...(advancedRawError ? { error: advancedRawError } : {}),
                      },
                    }
                    : {}),
                }}
                onLoadMoreRunJson={() => void handleLoadMoreAdvancedRaw()}
              />
            </div>
          ) : null}
        </div>
      )}
    </PageShell>
  );
}
