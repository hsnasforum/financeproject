"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AdvancedJsonPanel,
  GoalsTable,
  ResultGuideCard,
  TimelineSummaryTable,
  WarningsTable,
} from "@/components/planning/ResultGuideSections";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { formatKrw, formatPct } from "@/lib/planning/i18n/format";
import { buildConfirmString } from "@/lib/ops/confirm";
import { LIMITS } from "@/lib/planning/v2/limits";
import { mapGoalStatus, pickKeyTimelinePoints, resolveResultBadge, aggregateWarnings as aggregateGuideWarnings } from "@/lib/planning/v2/resultGuide";
import { buildResultDtoV1FromRunRecord, isResultDtoV1 } from "@/lib/planning/v2/resultDto";
import { type PlanningRunRecord } from "@/lib/planning/store/types";

type ReportListItem = {
  id: string;
  createdAt: string;
  kind: "run" | "manual";
  runId?: string;
};

type ReportDetail = ReportListItem & {
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

type ActionRow = {
  code: string;
  title: string;
  summary: string;
  severity: "critical" | "warn" | "info";
  whyCount: number;
  steps: string[];
  cautions: string[];
};

type ScenarioRow = {
  id: string;
  title: string;
  endNetWorthKrw: number;
  worstCashKrw: number;
  goalsAchievedCount: number;
  warningsCount: number;
  endNetWorthDeltaKrw: number;
  interpretation: string;
};

type DebtSummaryRow = {
  liabilityId: string;
  name: string;
  repaymentType: string;
  principalKrw: number;
  aprPct?: number;
  monthlyPaymentKrw: number;
  monthlyInterestKrw: number;
  totalInterestRemainingKrw: number;
  payoffMonthIndex?: number;
};

type PlanningReportsClientProps = {
  initialSelectedId?: string;
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

function toResultDto(run: PlanningRunRecord | null) {
  if (!run) return null;
  const outputs = asRecord(run.outputs);
  const rawDto = outputs.resultDto;
  return isResultDtoV1(rawDto) ? rawDto : buildResultDtoV1FromRunRecord(run);
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatRatioPct(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function toMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatKrw("ko-KR", value);
}

function toRepaymentTypeLabel(value: unknown): string {
  const raw = asString(value);
  if (raw === "amortizing") return "원리금 분할상환";
  if (raw === "interestOnly") return "이자만 상환";
  return raw || "-";
}

function toPolicyLabel(value: unknown): string {
  const raw = asString(value);
  if (raw === "balanced") return "균형형";
  if (raw === "safety") return "안정형";
  if (raw === "growth") return "성장형";
  return raw || "기본값";
}

function toAssumptionLines(run: PlanningRunRecord | null): string[] {
  if (!run) return [];
  const lines: string[] = [];
  lines.push(`기간: ${run.input.horizonMonths}개월`);
  lines.push(`배분 정책: ${toPolicyLabel(run.input.policyId)}`);
  if (run.input.snapshotId) {
    lines.push(`요청 스냅샷 ID: ${run.input.snapshotId}`);
  }
  const overrides = asRecord(run.input.assumptionsOverride);
  const inflation = asNumber(overrides.inflationPct) ?? asNumber(overrides.inflation);
  const expectedReturn = asNumber(overrides.investReturnPct) ?? asNumber(overrides.expectedReturn);
  if (typeof inflation === "number") lines.push(`인플레이션 가정: ${formatPct("ko-KR", inflation)}`);
  if (typeof expectedReturn === "number") lines.push(`투자수익률 가정: ${formatPct("ko-KR", expectedReturn)}`);
  return lines;
}

function parseSimulateWarnings(run: PlanningRunRecord | null): Array<Record<string, unknown>> {
  if (!run) return [];
  const dto = toResultDto(run);
  if (dto) {
    return dto.warnings.aggregated.map((warning) => ({
      reasonCode: warning.code,
      message: warning.sampleMessage ?? `${warning.code} 경고가 감지되었습니다.`,
      ...(typeof warning.firstMonth === "number" ? { month: warning.firstMonth } : {}),
    }));
  }
  const rows = asArray(run.outputs?.simulate?.warnings);
  return rows.map((row) => {
    if (typeof row === "string") {
      return {
        reasonCode: row,
        message: `${row} 경고가 감지되었습니다.`,
      };
    }
    const record = asRecord(row);
    const reasonCode = asString(record.reasonCode) || asString(record.code) || "UNKNOWN";
    return {
      reasonCode,
      message: asString(record.message) || `${reasonCode} 경고가 감지되었습니다.`,
      ...(record.month !== undefined ? { month: record.month } : {}),
      ...(record.meta !== undefined ? { meta: record.meta } : {}),
      ...(record.data !== undefined ? { data: record.data } : {}),
    };
  });
}

function parseTimelineRows(run: PlanningRunRecord | null): Array<Record<string, unknown>> {
  if (!run) return [];
  const dto = toResultDto(run);
  if (dto) {
    const dsrRatio = (() => {
      const raw = asNumber(dto.summary.dsrPct);
      if (typeof raw !== "number") return 0;
      return raw > 1 ? raw / 100 : raw;
    })();
    return dto.timeline.points.map((point) => ({
      month: point.monthIndex + 1,
      liquidAssets: asNumber(point.cashKrw) ?? 0,
      netWorth: asNumber(point.netWorthKrw) ?? 0,
      totalDebt: asNumber(point.totalDebtKrw) ?? 0,
      debtServiceRatio: dsrRatio,
    }));
  }
  const rows = asArray(run.outputs?.simulate?.keyTimelinePoints);
  return rows.map((entry) => {
    const record = asRecord(entry);
    const nestedRow = asRecord(record.row);
    return Object.keys(nestedRow).length > 0 ? nestedRow : record;
  });
}

function parseActions(run: PlanningRunRecord | null): ActionRow[] {
  if (!run) return [];
  const dto = toResultDto(run);
  const rows = dto?.actions?.items ? dto.actions.items as unknown[] : asArray(asRecord(run.outputs?.actions).actions);
  return rows.map((row, index) => {
    const record = asRecord(row);
    const severityRaw = asString(record.severity);
    const severity: ActionRow["severity"] = severityRaw === "critical" || severityRaw === "warn" ? severityRaw : "info";
    const whyCount = asArray(record.why).length;
    const steps = asArray(record.steps).map((item) => {
      if (typeof item === "string") return item.trim();
      const stepRecord = asRecord(item);
      return asString(stepRecord.text) || asString(stepRecord.title) || asString(stepRecord.description);
    }).filter((item) => item.length > 0);
    const cautions = asArray(record.cautions).map((item) => {
      if (typeof item === "string") return item.trim();
      return asString(asRecord(item).text);
    }).filter((item) => item.length > 0);
    return {
      code: asString(record.code) || `ACTION_${index + 1}`,
      title: asString(record.title) || `액션 ${index + 1}`,
      summary: asString(record.summary),
      severity,
      whyCount,
      steps,
      cautions,
    };
  }).sort((a, b) => {
    const severityDiff = ACTION_SEVERITY_ORDER[a.severity] - ACTION_SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.code.localeCompare(b.code);
  });
}

function parseScenarios(run: PlanningRunRecord | null): ScenarioRow[] {
  if (!run) return [];
  const dto = toResultDto(run);
  const scenarios = dto?.scenarios ? asRecord(dto.scenarios) : asRecord(run.outputs?.scenarios);
  const table = asArray(scenarios.table);
  const shortWhyByScenario = asRecord(scenarios.shortWhyByScenario);
  return table.map((row, index) => {
    const record = asRecord(row);
    const id = asString(record.id) || `scenario-${index + 1}`;
    const title = asString(record.title) || id;
    const endNetWorthKrw = asNumber(record.endNetWorthKrw) ?? 0;
    const goalsAchievedCount = asNumber(record.goalsAchievedCount) ?? 0;
    const warningsCount = asNumber(record.warningsCount) ?? 0;
    const worstCashKrw = asNumber(record.worstCashKrw) ?? 0;
    const diffVsBase = asRecord(record.diffVsBase);
    const endNetWorthDeltaKrw = asNumber(record.endNetWorthDeltaKrw) ?? asNumber(diffVsBase.endNetWorthDeltaKrw) ?? 0;
    const whyRows = asArray(shortWhyByScenario[id]).map((item) => asString(item)).filter((item) => item.length > 0);
    return {
      id,
      title,
      endNetWorthKrw,
      goalsAchievedCount,
      warningsCount,
      worstCashKrw,
      endNetWorthDeltaKrw,
      interpretation: whyRows[0] || "기준 대비 순자산/경고 변화를 함께 확인하세요.",
    };
  });
}

function parseDebtSummaries(run: PlanningRunRecord | null): DebtSummaryRow[] {
  if (!run) return [];
  const dto = toResultDto(run);
  const rows = dto?.debt?.summaries
    ? asArray(dto.debt.summaries)
    : asArray(asRecord(run.outputs?.debtStrategy).summaries);
  return rows.map((row, index) => {
    const record = asRecord(row);
    return {
      liabilityId: asString(record.liabilityId) || `debt-${index + 1}`,
      name: asString(record.name) || "부채",
      repaymentType: toRepaymentTypeLabel(record.type ?? record.repaymentType),
      principalKrw: asNumber(record.principalKrw) ?? 0,
      aprPct: asNumber(record.aprPct),
      monthlyPaymentKrw: asNumber(record.monthlyPaymentKrw) ?? 0,
      monthlyInterestKrw: asNumber(record.monthlyInterestKrw) ?? 0,
      totalInterestRemainingKrw: asNumber(record.totalInterestRemainingKrw) ?? 0,
      payoffMonthIndex: asNumber(record.payoffMonthIndex),
    };
  });
}

function toMonteProbabilityRows(run: PlanningRunRecord | null): Array<{ label: string; value: string; interpretation: string }> {
  if (!run) return [];
  const dto = toResultDto(run);
  const probabilities = dto?.monteCarlo
    ? asRecord(dto.monteCarlo.probabilities)
    : asRecord(run.outputs?.monteCarlo?.probabilities);
  const rows: Array<{ label: string; value: string; interpretation: string }> = [];
  for (const [key, rawValue] of Object.entries(probabilities)) {
    const numeric = asNumber(rawValue);
    if (typeof numeric !== "number") continue;
    if (key === "retirementDepletionBeforeEnd") {
      rows.push({
        label: "은퇴 자산 고갈 확률",
        value: `${Math.round(numeric * 100)}%`,
        interpretation: "기간 종료 전에 자산이 고갈될 가능성입니다. 비중이 높으면 지출/적립 조정이 필요합니다.",
      });
      continue;
    }
    rows.push({
      label: key,
      value: `${Math.round(numeric * 100)}%`,
      interpretation: "확률값이므로 단일 시점 보장값으로 해석하면 안 됩니다.",
    });
  }
  return rows;
}

function toMontePercentileRows(run: PlanningRunRecord | null): Array<{ metric: string; p10: number; p50: number; p90: number }> {
  if (!run) return [];
  const dto = toResultDto(run);
  const percentiles = dto?.monteCarlo
    ? asRecord(dto.monteCarlo.percentiles)
    : asRecord(run.outputs?.monteCarlo?.percentiles);
  const rows: Array<{ metric: string; p10: number; p50: number; p90: number }> = [];
  for (const [metric, value] of Object.entries(percentiles)) {
    const record = asRecord(value);
    const p10 = asNumber(record.p10);
    const p50 = asNumber(record.p50);
    const p90 = asNumber(record.p90);
    if (typeof p10 !== "number" || typeof p50 !== "number" || typeof p90 !== "number") continue;
    rows.push({ metric, p10, p50, p90 });
  }
  return rows;
}

function detailSections(report: ReportDetail | null, run: PlanningRunRecord | null) {
  if (!report) return [];
  return [
    { label: "report meta", value: { id: report.id, createdAt: report.createdAt, kind: report.kind, runId: report.runId } },
    ...(run ? [{ label: "run input", value: run.input }, { label: "run outputs", value: run.outputs }] : []),
  ];
}

function severityLabel(value: ActionRow["severity"]): string {
  if (value === "critical") return "치명";
  if (value === "warn") return "경고";
  return "정보";
}

export function PlanningReportsClient(props: PlanningReportsClientProps = {}) {
  const searchParams = useSearchParams();
  const selectedFromQuery = (searchParams.get("selected") ?? "").trim();
  const initialSelectedId = (props.initialSelectedId ?? "").trim();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<ReportDetail | null>(null);
  const [selectedRun, setSelectedRun] = useState<PlanningRunRecord | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);

  const preferredSelectedId = useMemo(
    () => selectedId || selectedFromQuery || initialSelectedId,
    [initialSelectedId, selectedFromQuery, selectedId],
  );

  async function loadReports(): Promise<void> {
    setLoadingList(true);
    try {
      const res = await fetch("/api/planning/v2/reports?limit=100", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportListItem[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setReports([]);
        setSelected(null);
        setSelectedRun(null);
        return;
      }
      setReports(payload.data);
      const selectedCandidate = payload.data.some((row) => row.id === preferredSelectedId)
        ? preferredSelectedId
        : (payload.data[0]?.id ?? "");
      setSelectedId(selectedCandidate);
    } catch {
      setReports([]);
      setSelected(null);
      setSelectedRun(null);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadReportDetail(id: string): Promise<void> {
    if (!id) {
      setSelected(null);
      setSelectedRun(null);
      return;
    }
    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
      if (!payload?.ok || !payload.data) {
        setSelected(null);
        setSelectedRun(null);
        return;
      }
      setSelected(payload.data);
    } catch {
      setSelected(null);
      setSelectedRun(null);
    }
  }

  async function loadRunDetail(runId: string): Promise<void> {
    if (!runId) {
      setSelectedRun(null);
      return;
    }
    setLoadingRun(true);
    try {
      const res = await fetch(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!payload?.ok || !payload.data) {
        setSelectedRun(null);
        return;
      }
      setSelectedRun(payload.data);
    } catch {
      setSelectedRun(null);
    } finally {
      setLoadingRun(false);
    }
  }

  async function deleteReportAction(id: string): Promise<void> {
    const expectedConfirm = buildConfirmString("DELETE report", id);
    const confirmText = window.prompt(
      `삭제 확인 문구를 입력하세요.\n${expectedConfirm}`,
      expectedConfirm,
    );
    if (!confirmText) return;

    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ confirmText })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        window.alert(payload?.error?.message ?? "리포트 삭제에 실패했습니다.");
        return;
      }
      await loadReports();
      window.alert("리포트를 휴지통으로 이동했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "리포트 삭제 중 오류가 발생했습니다.");
    }
  }

  useEffect(() => {
    void loadReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadReportDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const runId = selected?.runId ?? "";
    if (!runId) {
      setSelectedRun(null);
      setShowAllActions(false);
      return;
    }
    setShowAllActions(false);
    void loadRunDetail(runId);
  }, [selected?.runId]);

  const selectedDto = useMemo(
    () => toResultDto(selectedRun),
    [selectedRun],
  );
  const assumptionsLines = useMemo(
    () => toAssumptionLines(selectedRun),
    [selectedRun],
  );
  const simulateSummary = useMemo(
    () => selectedDto ? asRecord(selectedDto.summary) : asRecord(selectedRun?.outputs?.simulate?.summary),
    [selectedDto, selectedRun],
  );
  const simulateWarningsRaw = useMemo(
    () => parseSimulateWarnings(selectedRun),
    [selectedRun],
  );
  const aggregatedWarnings = useMemo(
    () => selectedDto
      ? selectedDto.warnings.aggregated.map((warning) => ({
        code: warning.code,
        severity: warning.severity === "critical" || warning.severity === "warn" ? warning.severity : "info",
        count: warning.count,
        ...(typeof warning.firstMonth === "number" ? { firstMonth: warning.firstMonth } : {}),
        ...(typeof warning.lastMonth === "number" ? { lastMonth: warning.lastMonth } : {}),
        sampleMessage: asString(warning.sampleMessage) || `${warning.code} 경고가 감지되었습니다.`,
      }))
      : aggregateGuideWarnings(simulateWarningsRaw),
    [selectedDto, simulateWarningsRaw],
  );
  const goalRows = useMemo(
    () => selectedDto
      ? mapGoalStatus(selectedDto.goals.map((goal) => ({
        goalId: goal.id,
        name: goal.title,
        achieved: goal.achieved,
        targetMonth: goal.targetMonth,
        targetAmount: goal.targetKrw,
        currentAmount: goal.currentKrw,
        shortfall: goal.shortfallKrw,
      })))
      : mapGoalStatus(asArray(selectedRun?.outputs?.simulate?.goalsStatus).map((row) => asRecord(row))),
    [selectedDto, selectedRun],
  );
  const timelineRows = useMemo(
    () => parseTimelineRows(selectedRun),
    [selectedRun],
  );
  const timelineSummaryRows = useMemo(
    () => pickKeyTimelinePoints(timelineRows),
    [timelineRows],
  );
  const badge = useMemo(
    () => resolveResultBadge({ timeline: timelineRows, warnings: aggregatedWarnings, goals: goalRows }),
    [aggregatedWarnings, goalRows, timelineRows],
  );
  const actionRows = useMemo(
    () => parseActions(selectedRun),
    [selectedRun],
  );
  const topActions = useMemo(
    () => actionRows.slice(0, LIMITS.actionsTop).map((row) => row.title),
    [actionRows],
  );
  const visibleActionRows = useMemo(
    () => (showAllActions ? actionRows : actionRows.slice(0, LIMITS.actionsTop)),
    [actionRows, showAllActions],
  );
  const scenarioRows = useMemo(
    () => parseScenarios(selectedRun),
    [selectedRun],
  );
  const monteProbabilityRows = useMemo(
    () => toMonteProbabilityRows(selectedRun),
    [selectedRun],
  );
  const montePercentileRows = useMemo(
    () => toMontePercentileRows(selectedRun),
    [selectedRun],
  );
  const debtSummary = useMemo(
    () => selectedDto
      ? asRecord(asRecord(selectedDto.raw?.debt).summary)
      : asRecord(selectedRun?.outputs?.debtStrategy?.summary),
    [selectedDto, selectedRun],
  );
  const debtWarnings = useMemo(
    () => selectedDto
      ? aggregateGuideWarnings(asArray(asRecord(selectedDto.raw?.debt).warnings).map((row) => {
        const record = asRecord(row);
        const code = asString(record.reasonCode) || asString(record.code) || "UNKNOWN";
        return {
          reasonCode: code,
          message: asString(record.message) || `${code} 경고가 감지되었습니다.`,
          ...(record.month !== undefined ? { month: record.month } : {}),
          ...(record.meta !== undefined ? { meta: record.meta } : {}),
          ...(record.data !== undefined ? { data: record.data } : {}),
        };
      }))
      : aggregateGuideWarnings(asArray(selectedRun?.outputs?.debtStrategy?.warnings).map((row) => {
        const record = asRecord(row);
        const code = asString(record.code) || "UNKNOWN";
        return {
          reasonCode: code,
          message: asString(record.message) || `${code} 경고가 감지되었습니다.`,
        };
      })),
    [selectedDto, selectedRun],
  );
  const debtSummaries = useMemo(
    () => parseDebtSummaries(selectedRun),
    [selectedRun],
  );
  const detailJsonSections = useMemo(
    () => detailSections(selected, selectedRun),
    [selected, selectedRun],
  );
  const achievedGoals = useMemo(
    () => goalRows.filter((goal) => goal.achieved).length,
    [goalRows],
  );
  const criticalWarningsCount = useMemo(
    () => aggregatedWarnings.filter((warning) => warning.severity === "critical").length,
    [aggregatedWarnings],
  );

  return (
    <PageShell>
      <PageHeader
        title="플래닝 리포트"
        description="run 기반 리포트 대시보드 조회/다운로드/삭제"
        action={(
          <div className="flex items-center gap-4 text-sm">
            <Link className="font-semibold text-emerald-700" href="/planning/trash">휴지통</Link>
            <Link className="font-semibold text-emerald-700" href="/planning/runs">실행 기록으로</Link>
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">리포트 목록</h2>
            <Button disabled={loadingList} onClick={() => void loadReports()} size="sm" variant="ghost">새로고침</Button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2">id</th>
                  <th className="px-2 py-2">생성시각</th>
                  <th className="px-2 py-2">runId</th>
                  <th className="px-2 py-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr><td className="px-2 py-3" colSpan={4}>리포트가 없습니다.</td></tr>
                ) : reports.map((report) => (
                  <tr className="border-b border-slate-100" key={report.id}>
                    <td className="px-2 py-2">
                      <button
                        className="font-semibold text-emerald-700"
                        onClick={() => setSelectedId(report.id)}
                        type="button"
                      >
                        {report.id}
                      </button>
                    </td>
                    <td className="px-2 py-2">{formatDateTime(report.createdAt)}</td>
                    <td className="px-2 py-2">{report.runId ?? "-"}</td>
                    <td className="px-2 py-2">
                      <button
                        className="font-semibold text-rose-700"
                        onClick={() => void deleteReportAction(report.id)}
                        type="button"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-bold text-slate-900">리포트 대시보드</h2>
          {!selected ? (
            <p className="mt-3 text-xs text-slate-500">리포트를 선택하세요.</p>
          ) : (
            <div className="mt-3 space-y-4 text-xs text-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span>id: {selected.id}</span>
                <span>·</span>
                <span>createdAt: {formatDateTime(selected.createdAt)}</span>
                {selected.runId ? (<><span>·</span><span>runId: {selected.runId}</span></>) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  href={`/api/planning/v2/reports/${encodeURIComponent(selected.id)}/download`}
                >
                  마크다운 다운로드
                </a>
                <Link
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  href={`/planning/reports/${encodeURIComponent(selected.id)}`}
                >
                  고정 링크
                </Link>
              </div>

              {!selected.runId ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  이 리포트는 runId가 없는 수동 리포트입니다. 요약 대시보드를 구성할 실행 데이터가 없습니다.
                </p>
              ) : loadingRun ? (
                <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">run 데이터를 불러오는 중...</p>
              ) : !selectedRun ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                  실행 기록 데이터를 찾을 수 없습니다. 실행 기록이 삭제되었을 수 있습니다.
                </p>
              ) : (
                <>
                  <div className="sticky top-3 z-20">
                    <ResultGuideCard
                      locale="ko-KR"
                      status={badge.status}
                      reason={badge.reason}
                      minCashKrw={badge.minCashKrw}
                      achievedGoals={achievedGoals}
                      totalGoals={goalRows.length}
                      maxDsr={badge.maxDsr}
                      topActions={topActions}
                    />
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-900">1) 기준정보</h3>
                    <p className="mt-1">스냅샷 시점과 가정을 먼저 확인한 뒤 아래 진단을 읽어야 해석 오류를 줄일 수 있습니다.</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">스냅샷 ID: <span className="font-semibold">{selectedRun.meta.snapshot?.id ?? selectedRun.input.snapshotId ?? "latest"}</span></div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">스냅샷 asOf: <span className="font-semibold">{selectedRun.meta.snapshot?.asOf ?? "-"}</span></div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">스냅샷 fetchedAt: <span className="font-semibold">{selectedRun.meta.snapshot?.fetchedAt ? formatDateTime(selectedRun.meta.snapshot.fetchedAt) : "-"}</span></div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">실행 시각: <span className="font-semibold">{formatDateTime(selectedRun.createdAt)}</span></div>
                    </div>
                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="font-semibold text-slate-900">가정 요약</p>
                      {assumptionsLines.length === 0 ? (
                        <p className="mt-1">명시된 override 가정이 없습니다.</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {assumptionsLines.map((line) => (
                            <li key={line}>- {line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="font-semibold text-slate-900">2) Executive Summary</h3>
                    <p className="mt-1">핵심 지표 5개만 먼저 보고 위험 신호를 빠르게 판단할 수 있습니다.</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">말기 순자산</p>
                        <p className="text-sm font-semibold text-slate-900">{toMoney(asNumber(simulateSummary.endNetWorthKrw))}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">최저 현금</p>
                        <p className="text-sm font-semibold text-slate-900">{toMoney(asNumber(simulateSummary.worstCashKrw))}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">목표 달성</p>
                        <p className="text-sm font-semibold text-slate-900">{achievedGoals}/{goalRows.length}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">최대 DSR</p>
                        <p className="text-sm font-semibold text-slate-900">{formatRatioPct(badge.maxDsr)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[11px] text-slate-500">치명 경고</p>
                        <p className="text-sm font-semibold text-slate-900">{criticalWarningsCount}건</p>
                      </div>
                    </div>
                  </section>

                  <WarningsTable warnings={aggregatedWarnings} />
                  <GoalsTable locale="ko-KR" goals={goalRows} />
                  <TimelineSummaryTable locale="ko-KR" rows={timelineSummaryRows} />

                  <section className="space-y-2">
                    <h3 className="font-semibold text-slate-900">5) Action Plan (Top {LIMITS.actionsTop})</h3>
                    <p>심각도 높은 액션부터 처리하면 경고와 목표 미달을 빠르게 줄일 수 있습니다.</p>
                    {actionRows.length === 0 ? (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">권장 액션이 없습니다.</p>
                    ) : (
                      <ol className="space-y-2">
                        {visibleActionRows.map((action, index) => (
                          <li className="rounded-xl border border-slate-200 bg-white px-3 py-2" key={`${action.code}-${index}`}>
                            <p className="font-semibold text-slate-900">
                              {index + 1}. [{severityLabel(action.severity)}] {action.title}
                            </p>
                            <p className="mt-1">{action.summary || "핵심 경고를 줄이기 위한 실행 계획입니다."}</p>
                            <p className="mt-1 text-slate-500">근거 {action.whyCount}건 · 단계 {action.steps.length}건 · 주의 {action.cautions.length}건</p>
                          </li>
                        ))}
                      </ol>
                    )}
                    {actionRows.length > LIMITS.actionsTop ? (
                      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span>
                          {showAllActions
                            ? `전체 ${actionRows.length}개 액션 표시 중`
                            : `추가 ${actionRows.length - visibleActionRows.length}개 액션이 생략되었습니다.`}
                        </span>
                        <button
                          className="font-semibold text-emerald-700"
                          onClick={() => setShowAllActions((prev) => !prev)}
                          type="button"
                        >
                          {showAllActions ? "접기" : "더 보기"}
                        </button>
                      </div>
                    ) : null}
                  </section>

                  {scenarioRows.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="font-semibold text-slate-900">6) Scenarios</h3>
                      <p>기준 대비 지표 변화를 보면 어떤 가정에서 성과가 악화되는지 빠르게 파악할 수 있습니다.</p>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left">시나리오</th>
                              <th className="px-3 py-2 text-right">말기 순자산</th>
                              <th className="px-3 py-2 text-right">기준 대비</th>
                              <th className="px-3 py-2 text-right">최저 현금</th>
                              <th className="px-3 py-2 text-right">목표 달성</th>
                              <th className="px-3 py-2 text-right">경고 수</th>
                              <th className="px-3 py-2 text-left">해석</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {scenarioRows.map((row) => (
                              <tr key={row.id}>
                                <td className="px-3 py-2 font-semibold text-slate-900">{row.title}</td>
                                <td className="px-3 py-2 text-right">{toMoney(row.endNetWorthKrw)}</td>
                                <td className={`px-3 py-2 text-right ${row.endNetWorthDeltaKrw < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                                  {toMoney(row.endNetWorthDeltaKrw)}
                                </td>
                                <td className="px-3 py-2 text-right">{toMoney(row.worstCashKrw)}</td>
                                <td className="px-3 py-2 text-right">{row.goalsAchievedCount}</td>
                                <td className="px-3 py-2 text-right">{row.warningsCount}</td>
                                <td className="px-3 py-2">{row.interpretation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  {monteProbabilityRows.length > 0 || montePercentileRows.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="font-semibold text-slate-900">7) Monte Carlo</h3>
                      {monteProbabilityRows.length > 0 ? (
                        <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          {monteProbabilityRows.map((row) => (
                            <p key={row.label}>
                              <span className="font-semibold text-slate-900">{row.label}: {row.value}</span>
                              <span className="ml-1">{row.interpretation}</span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {montePercentileRows.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left">지표</th>
                                <th className="px-3 py-2 text-right">P10</th>
                                <th className="px-3 py-2 text-right">P50</th>
                                <th className="px-3 py-2 text-right">P90</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {montePercentileRows.map((row) => (
                                <tr key={row.metric}>
                                  <td className="px-3 py-2 font-semibold text-slate-900">{row.metric}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.p10)}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.p50)}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.p90)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {Object.keys(debtSummary).length > 0 || debtSummaries.length > 0 ? (
                    <section className="space-y-2">
                      <h3 className="font-semibold text-slate-900">8) Debt Analysis</h3>
                      <p>상환부담과 이자비용을 함께 보면 리파이낸스/상환전략 우선순위를 정하기 쉽습니다.</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          현재 DSR: <span className="font-semibold">{formatRatioPct(asNumber(debtSummary.debtServiceRatio))}</span>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          월 총상환액: <span className="font-semibold">{toMoney(asNumber(debtSummary.totalMonthlyPaymentKrw))}</span>
                        </div>
                      </div>
                      <WarningsTable warnings={debtWarnings} />
                      {debtSummaries.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-3 py-2 text-left">부채명</th>
                                <th className="px-3 py-2 text-left">상환방식</th>
                                <th className="px-3 py-2 text-right">원금</th>
                                <th className="px-3 py-2 text-right">금리(APR)</th>
                                <th className="px-3 py-2 text-right">월 상환액</th>
                                <th className="px-3 py-2 text-right">월 이자</th>
                                <th className="px-3 py-2 text-right">잔여 총이자</th>
                                <th className="px-3 py-2 text-right">상환완료월</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {debtSummaries.map((row) => (
                                <tr key={`${row.liabilityId}-${row.name}`}>
                                  <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                                  <td className="px-3 py-2">{row.repaymentType}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.principalKrw)}</td>
                                  <td className="px-3 py-2 text-right">{typeof row.aprPct === "number" ? `${row.aprPct.toFixed(2)}%` : "-"}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.monthlyPaymentKrw)}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.monthlyInterestKrw)}</td>
                                  <td className="px-3 py-2 text-right">{toMoney(row.totalInterestRemainingKrw)}</td>
                                  <td className="px-3 py-2 text-right">{typeof row.payoffMonthIndex === "number" ? `M${row.payoffMonthIndex + 1}` : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">부채별 상세 데이터가 없습니다.</p>
                      )}
                    </section>
                  ) : null}
                </>
              )}

              <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">고급 보기 (원본 JSON/Markdown)</summary>
                <div className="mt-3 space-y-3">
                  <AdvancedJsonPanel sections={detailJsonSections} title="원본 JSON 보기" />
                  <details className="rounded-xl border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">원본 Markdown 보기</summary>
                    <pre className="mt-3 max-h-[50vh] overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                      {selected.markdown}
                    </pre>
                  </details>
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

export default PlanningReportsClient;
