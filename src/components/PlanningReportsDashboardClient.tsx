"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { aggregateReportWarningsFromRun } from "@/app/planning/reports/_lib/dashboardWarnings";
import { toInterpretationInputFromReportVM } from "@/app/planning/reports/_lib/reportInterpretationAdapter";
import { buildReportVM } from "@/app/planning/reports/_lib/reportViewModel";
import InterpretabilityGuideCard from "@/components/planning/InterpretabilityGuideCard";
import ProductCandidatesPanel from "@/components/planning/ProductCandidatesPanel";
import DisclosuresPanel from "@/components/planning/DisclosuresPanel";
import PlanningReportsClient from "@/components/PlanningReportsClient";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "@/lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "@/lib/planning/store/types";
import { reportFromNormalizationDisclosure, type NormalizationReport } from "@/lib/planning/v2/normalizationReport";
import { type ProfileNormalizationDisclosure } from "@/lib/planning/v2/normalizationDisclosure";
import { parsePlanningV2Response } from "@/lib/planning/api/contracts";
import { computeReportDeltas, type ReportDeltaItem } from "@/lib/planning/reports/computeDeltas";
import { REPORT_SECTION_IDS } from "@/lib/planning/navigation/sectionIds";

type PlanningReportsDashboardClientProps = {
  initialProfileId?: string;
  initialRunId?: string;
};

type GoalRow = {
  name: string;
  achieved: boolean;
  shortfall?: number;
};

type ActionRow = {
  title: string;
  steps: string[];
  severity: "critical" | "warn" | "info";
};

const ACTION_SEVERITY_ORDER: Record<ActionRow["severity"], number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toResultDto(run: PlanningRunRecord) {
  const rawDto = asRecord(run.outputs).resultDto;
  if (isResultDtoV1(rawDto)) return rawDto;
  return buildResultDtoV1FromRunRecord(run);
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleString("ko-KR", { hour12: false });
}

function toGoals(run: PlanningRunRecord | null): GoalRow[] {
  if (!run) return [];
  const rows = asArray(run.outputs?.simulate?.goalsStatus);
  if (rows.length > 0) {
    return rows.map((entry) => {
      const row = asRecord(entry);
      const target = asNumber(row.targetAmount);
      const current = asNumber(row.currentAmount);
      const shortfall = asNumber(row.shortfall)
        ?? (typeof target === "number" && typeof current === "number" ? Math.max(0, target - current) : undefined);
      return {
        name: asString(row.name) || asString(row.goalId) || "목표",
        achieved: row.achieved === true,
        ...(typeof shortfall === "number" ? { shortfall } : {}),
      };
    });
  }

  const dto = toResultDto(run);
  return dto.goals.map((goal) => ({
    name: goal.title,
    achieved: goal.achieved === true,
    ...(typeof goal.shortfallKrw === "number" ? { shortfall: goal.shortfallKrw } : {}),
  }));
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function toTopActions(run: PlanningRunRecord | null): ActionRow[] {
  if (!run) return [];
  const rows = asArray(run.outputs?.actions?.actions);
  const parsed = rows.map((entry, index) => {
    const row = asRecord(entry);
    const severityRaw = asString(row.severity).toLowerCase();
    const severity: ActionRow["severity"] = severityRaw === "critical" || severityRaw === "warn"
      ? severityRaw
      : "info";
    const steps = asArray(row.steps)
      .map((step) => truncateText(asString(step), 80))
      .filter((step) => step.length > 0)
      .slice(0, 3);
    return {
      title: asString(row.title) || `액션 ${index + 1}`,
      steps,
      severity,
    } satisfies ActionRow;
  });

  return parsed
    .sort((left, right) => ACTION_SEVERITY_ORDER[left.severity] - ACTION_SEVERITY_ORDER[right.severity])
    .slice(0, 3);
}

function severityLabel(value: ActionRow["severity"]): string {
  if (value === "critical") return "치명";
  if (value === "warn") return "경고";
  return "정보";
}

function directionLabel(direction: ReportDeltaItem["direction"]): string {
  if (direction === "up") return "증가";
  if (direction === "down") return "감소";
  return "변화 없음";
}

function formatMetricValue(unitKind: ReportDeltaItem["unitKind"], value: number): string {
  if (unitKind === "krw") return formatKrw("ko-KR", value);
  if (unitKind === "pct") return formatPct("ko-KR", value);
  if (unitKind === "months") return formatMonths("ko-KR", value);
  return Math.round(value).toLocaleString("ko-KR");
}

function formatMetricDelta(unitKind: ReportDeltaItem["unitKind"], delta: number): string {
  if (delta === 0) return formatMetricValue(unitKind, 0);
  const sign = delta > 0 ? "+" : "-";
  const absolute = Math.abs(delta);
  if (unitKind === "krw") return `${sign}${formatKrw("ko-KR", absolute)}`;
  if (unitKind === "pct") return `${sign}${formatPct("ko-KR", absolute)}`;
  if (unitKind === "months") return `${sign}${formatMonths("ko-KR", absolute)}`;
  return `${sign}${Math.round(absolute).toLocaleString("ko-KR")}`;
}

function parseNormalizationDisclosure(value: unknown): ProfileNormalizationDisclosure | null {
  const row = asRecord(value);
  const defaultsApplied = asArray(row.defaultsApplied)
    .map((entry) => asString(entry))
    .filter((entry) => entry.length > 0);
  const fixesApplied = asArray(row.fixesApplied)
    .map((entry) => {
      const fix = asRecord(entry);
      const path = asString(fix.path);
      if (!path) return null;
      const message = asString(fix.message);
      return {
        path,
        ...(fix.from !== undefined ? { from: fix.from } : {}),
        ...(fix.to !== undefined ? { to: fix.to } : {}),
        ...(message ? { message } : {}),
      };
    })
    .filter((entry): entry is ProfileNormalizationDisclosure["fixesApplied"][number] => entry !== null);

  if (defaultsApplied.length < 1 && fixesApplied.length < 1) return null;
  return {
    defaultsApplied,
    fixesApplied,
  };
}

export default function PlanningReportsDashboardClient(props: PlanningReportsDashboardClientProps) {
  const searchParams = useSearchParams();
  const [runs, setRuns] = useState<PlanningRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const profileId = props.initialProfileId ?? "";
  const queryRunId = asString(searchParams.get("runId"));
  const queryBaseRunId = asString(searchParams.get("baseRunId"));

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );
  const selectedRunVm = useMemo(
    () => (
      selectedRun
        ? buildReportVM(selectedRun, {
          id: selectedRun.id,
          runId: selectedRun.id,
          createdAt: selectedRun.createdAt,
        })
        : null
    ),
    [selectedRun],
  );
  const baselineOptions = useMemo(() => {
    return runs
      .filter((run) => run.id !== selectedRunId)
      .filter((run) => run.overallStatus === "SUCCESS" || run.overallStatus === "PARTIAL_SUCCESS")
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, [runs, selectedRunId]);
  const baselineRun = useMemo(
    () => runs.find((run) => run.id === baselineRunId) ?? null,
    [baselineRunId, runs],
  );
  const baselineRunVm = useMemo(
    () => (
      baselineRun
        ? buildReportVM(baselineRun, {
          id: baselineRun.id,
          runId: baselineRun.id,
          createdAt: baselineRun.createdAt,
        })
        : null
    ),
    [baselineRun],
  );
  const reportDeltaRows = useMemo(
    () => (selectedRunVm && baselineRunVm ? computeReportDeltas(selectedRunVm, baselineRunVm) : []),
    [baselineRunVm, selectedRunVm],
  );
  const interpretationInput = useMemo(() => {
    if (!selectedRunVm) return null;
    return toInterpretationInputFromReportVM(selectedRunVm);
  }, [selectedRunVm]);
  const canRenderInterpretability = useMemo(() => {
    if (!selectedRun) return false;
    if (!Array.isArray(selectedRun.stages) || selectedRun.stages.length < 1) return true;
    const simulateStage = selectedRun.stages.find((stage) => stage.id === "simulate");
    return !simulateStage || simulateStage.status === "SUCCESS";
  }, [selectedRun]);
  const summaryCards = useMemo(() => {
    if (!selectedRunVm) {
      return {
        endNetWorthKrw: undefined,
        worstCashKrw: undefined,
        debtServiceRatioPct: undefined,
        warningsCount: undefined,
      };
    }
    return {
      endNetWorthKrw: selectedRunVm.summaryCards.endNetWorthKrw,
      worstCashKrw: selectedRunVm.summaryCards.worstCashKrw,
      debtServiceRatioPct: selectedRunVm.summaryCards.dsrPct,
      warningsCount: selectedRunVm.summaryCards.totalWarnings
        ?? selectedRunVm.warningAgg.reduce((sum, row) => sum + row.count, 0),
    };
  }, [selectedRunVm]);
  const warningRows = useMemo(() => aggregateReportWarningsFromRun(selectedRun), [selectedRun]);
  const goalRows = useMemo(() => toGoals(selectedRun), [selectedRun]);
  const topActions = useMemo(() => toTopActions(selectedRun), [selectedRun]);
  const runNormalizationReport = useMemo<NormalizationReport>(() => {
    const disclosure = parseNormalizationDisclosure(selectedRun?.meta?.normalization);
    return reportFromNormalizationDisclosure(disclosure, "실행 결과");
  }, [selectedRun]);
  const planningHref = useMemo(
    () => appendProfileIdQuery("/planning", profileId),
    [profileId],
  );
  const runsHref = useMemo(
    () => appendProfileIdQuery("/planning/runs", profileId),
    [profileId],
  );
  const handlePrint = (): void => {
    if (typeof window === "undefined") return;
    window.print();
  };

  useEffect(() => {
    if (!queryBaseRunId) return;
    if (!baselineOptions.some((run) => run.id === queryBaseRunId)) return;
    setCompareMode(true);
    setBaselineRunId(queryBaseRunId);
  }, [baselineOptions, queryBaseRunId]);

  useEffect(() => {
    if (!compareMode) return;
    setBaselineRunId((previous) => {
      if (previous && baselineOptions.some((run) => run.id === previous)) {
        return previous;
      }
      return baselineOptions[0]?.id ?? "";
    });
  }, [baselineOptions, compareMode]);

  useEffect(() => {
    let active = true;
    async function loadRuns(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (profileId) params.set("profileId", profileId);
        const response = await fetch(`/api/planning/v2/runs?${params.toString()}`, { cache: "no-store" });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<PlanningRunRecord[]>(rawPayload);
        if (!active) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
          setRuns([]);
          setSelectedRunId("");
          setBaselineRunId("");
          setCompareMode(false);
          setError(payload.error.message ?? "실행 기록을 불러오지 못했습니다.");
          return;
        }
        setRuns(payload.data);
        const preferredRunId = queryRunId || props.initialRunId || "";
        const nextSelectedRunId = preferredRunId && payload.data.some((run) => run.id === preferredRunId)
          ? preferredRunId
          : (payload.data[0]?.id ?? "");
        setSelectedRunId(nextSelectedRunId);
      } catch (loadError) {
        if (!active) return;
        setRuns([]);
        setSelectedRunId("");
        setBaselineRunId("");
        setCompareMode(false);
        setError(loadError instanceof Error ? loadError.message : "실행 기록 조회 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRuns();
    return () => {
      active = false;
    };
  }, [profileId, props.initialRunId, queryRunId]);

  return (
    <PageShell className="report-root">
      <PageHeader
        title="플래닝 리포트"
        description="저장된 실행(run) 기준으로 요약 대시보드를 확인합니다."
        action={(
          <div className="no-print flex items-center gap-3 text-sm">
            <Button
              data-testid="report-print-button"
              onClick={handlePrint}
              size="sm"
              type="button"
              variant="outline"
            >
              PDF 인쇄
            </Button>
            <Link className="font-semibold text-emerald-700" href={planningHref}>플래닝</Link>
            <Link className="font-semibold text-emerald-700" href={runsHref}>실행 기록</Link>
          </div>
        )}
      />

      {loading ? (
        <LoadingState title="실행 기록을 불러오는 중입니다" />
      ) : null}

      {!loading && error ? (
        <ErrorState message={error} />
      ) : null}

      {!loading && !error && runs.length < 1 ? (
        <EmptyState
          title="저장된 실행 기록이 없습니다"
          description="/planning에서 실행 후 저장하면 이 화면에서 리포트를 확인할 수 있습니다."
          icon="data"
        />
      ) : null}

      {!loading && !error && runs.length > 0 && selectedRun ? (
        <div className="report-root space-y-5" data-testid="report-dashboard">
          <Card className="print-card space-y-3">
            <div className="no-print flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-slate-600" htmlFor="report-run-selector">
                실행 선택
              </label>
              <select
                className="h-10 min-w-[280px] rounded-xl border border-slate-300 px-3 text-sm"
                id="report-run-selector"
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
              >
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {`${run.title?.trim() || `실행 ${run.id}`} · ${formatDateTime(run.createdAt)}`}
                  </option>
                ))}
              </select>
              <a
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/report`}
                rel="noreferrer"
                target="_blank"
              >
                View HTML
              </a>
              <a
                className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                href={`/api/planning/v2/runs/${encodeURIComponent(selectedRun.id)}/report?download=1`}
                rel="noreferrer"
                target="_blank"
              >
                Download HTML
              </a>
              <Button
                data-testid="compare-toggle"
                onClick={() => setCompareMode((previous) => !previous)}
                size="sm"
                type="button"
                variant={compareMode ? "primary" : "outline"}
              >
                {compareMode ? "비교 끄기" : "비교 켜기"}
              </Button>
            </div>

            {compareMode ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600" htmlFor="report-baseline-selector">
                    기준 실행
                  </label>
                  <select
                    className="h-10 min-w-[280px] rounded-xl border border-slate-300 px-3 text-sm"
                    data-testid="baseline-selector"
                    id="report-baseline-selector"
                    value={baselineRunId}
                    onChange={(event) => setBaselineRunId(event.target.value)}
                  >
                    <option value="">기준 실행 선택</option>
                    {baselineOptions.map((run) => (
                      <option key={run.id} value={run.id}>
                        {`${run.title?.trim() || `실행 ${run.id}`} · ${formatDateTime(run.createdAt)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {!baselineRun ? (
                  <p className="text-xs text-slate-600">비교 가능한 기준 실행이 없습니다.</p>
                ) : reportDeltaRows.length < 1 ? (
                  <p className="text-xs text-slate-600">표시 가능한 변화 지표가 없습니다.</p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="delta-cards">
                    {reportDeltaRows.map((item) => (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" key={item.key}>
                        <p className="text-[11px] font-semibold text-slate-600">{item.label}</p>
                        <p className="text-sm text-slate-700">
                          기준 {formatMetricValue(item.unitKind, item.baseValue)}
                        </p>
                        <p className="text-sm text-slate-700">
                          현재 {formatMetricValue(item.unitKind, item.currentValue)}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatMetricDelta(item.unitKind, item.delta)}
                          {" · "}
                          {directionLabel(item.direction)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </Card>

          {interpretationInput ? (
            canRenderInterpretability ? (
              <div className="print-card">
                <InterpretabilityGuideCard
                  aggregatedWarnings={interpretationInput.aggregatedWarnings}
                  goals={interpretationInput.goals}
                  summaryMetrics={interpretationInput.summary}
                  outcomes={interpretationInput.outcomes}
                  summaryEvidence={interpretationInput.summaryEvidence}
                />
              </div>
            ) : (
              <Card className="print-card p-4 text-sm text-slate-700">
                해석 가이드는 simulate 단계 성공 시에만 표시됩니다.
              </Card>
            )
          ) : null}

          <Card className="print-card space-y-3" data-testid="report-summary-cards">
            <h2 className="text-base font-bold text-slate-900">Summary</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">말기 순자산</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.endNetWorthKrw === "number" ? formatKrw("ko-KR", summaryCards.endNetWorthKrw) : "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">최저 현금</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.worstCashKrw === "number" ? formatKrw("ko-KR", summaryCards.worstCashKrw) : "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">부채상환비율(DSR)</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.debtServiceRatioPct === "number" ? formatPct("ko-KR", summaryCards.debtServiceRatioPct) : "-"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">경고 수</p>
                <p className="text-sm font-semibold text-slate-900">
                  {typeof summaryCards.warningsCount === "number" ? summaryCards.warningsCount.toLocaleString("ko-KR") : "-"}
                </p>
              </div>
            </div>
          </Card>

          <div className="print-card">
            <ProductCandidatesPanel />
          </div>

          <div className="print-card">
            <DisclosuresPanel report={runNormalizationReport} />
          </div>

          <Card className="print-card space-y-3" id={REPORT_SECTION_IDS.warnings}>
            <h2 className="text-base font-bold text-slate-900">Warnings</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm" data-testid="report-warnings-table">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">code</th>
                    <th className="px-3 py-2 text-left">message</th>
                    <th className="px-3 py-2 text-right">count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {warningRows.length < 1 ? (
                    <tr>
                      <td className="px-3 py-2 text-slate-600" colSpan={3}>경고가 없습니다.</td>
                    </tr>
                  ) : warningRows.map((row) => (
                    <tr key={`${row.code}:${row.message}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.code}</td>
                      <td className="px-3 py-2 text-slate-700">{row.message}</td>
                      <td className="px-3 py-2 text-right">{row.count.toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="print-card space-y-3">
            <h2 className="text-base font-bold text-slate-900">Goals</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">name</th>
                    <th className="px-3 py-2 text-left">achieved</th>
                    <th className="px-3 py-2 text-right">shortfall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {goalRows.length < 1 ? (
                    <tr>
                      <td className="px-3 py-2 text-slate-600" colSpan={3}>목표 정보가 없습니다.</td>
                    </tr>
                  ) : goalRows.map((row, index) => (
                    <tr key={`${row.name}:${index}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-3 py-2">{row.achieved ? "달성" : "미달"}</td>
                      <td className="px-3 py-2 text-right">
                        {typeof row.shortfall === "number" ? formatKrw("ko-KR", row.shortfall) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="print-card space-y-3" data-testid="report-top-actions">
            <h2 className="text-base font-bold text-slate-900">Top Actions</h2>
            {topActions.length < 1 ? (
              <p className="text-sm text-slate-600">액션 정보가 없습니다.</p>
            ) : (
              <ol className="space-y-2">
                {topActions.map((action, index) => (
                  <li className="rounded-lg border border-slate-200 p-3" key={`${action.title}:${index}`}>
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. [{severityLabel(action.severity)}] {action.title}
                    </p>
                    {action.steps.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-700">
                        {action.steps.map((step, stepIndex) => (
                          <li key={`${action.title}:${stepIndex}`}>{step}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">세부 단계 정보가 없습니다.</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <details className="no-print rounded-xl border border-slate-200 p-3" data-testid="report-advanced-toggle">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700">고급 보기 (Markdown 리포트 관리)</summary>
            <div className="mt-3" data-testid="report-advanced-raw">
              <PlanningReportsClient embedded />
            </div>
          </details>
        </div>
      ) : null}
    </PageShell>
  );
}
