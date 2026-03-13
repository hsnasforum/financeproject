"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  safeBuildReportVMFromRun,
  type ReportActionRow,
  type ReportVM,
} from "@/app/planning/reports/_lib/reportViewModel";
import {
  AdvancedJsonPanel,
  GoalsTable,
  ResultGuideCard,
  TimelineSummaryTable,
  WarningsTable,
} from "@/components/planning/ResultGuideSections";
import {
  BodyDialogSurface,
  BodyInset,
  BodySectionHeading,
  BodyStatusInset,
  BodyTableFrame,
  bodyActionLinkGroupClassName,
  bodyDialogActionsClassName,
  bodyFieldClassName,
} from "@/components/ui/BodyTone";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { withDevCsrf } from "@/lib/dev/clientCsrf";
import { formatKrw } from "@/lib/planning/i18n/format";
import { buildConfirmString } from "@/lib/ops/confirm";
import { LIMITS } from "@/lib/planning/v2/limits";
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

type PlanningReportsClientProps = {
  initialSelectedId?: string;
  embedded?: boolean;
};

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

function detailSections(report: ReportDetail | null, run: PlanningRunRecord | null, vm: ReportVM | null) {
  if (!report || !vm) return [];
  return [
    { label: "report meta", value: { id: report.id, createdAt: report.createdAt, kind: report.kind, runId: report.runId } },
    ...(vm.contract ? [{ label: "report contract", value: vm.contract }] : []),
    {
      label: "run header",
      value: {
        runId: vm.header.runId,
        createdAt: vm.header.createdAt,
        ...(run?.overallStatus ? { overallStatus: run.overallStatus } : {}),
      },
    },
    { label: "snapshot", value: vm.snapshot },
    { label: "summary cards", value: vm.summaryCards },
    {
      label: "guide summary",
      value: {
        badge: vm.guide.badge,
        warningsCount: vm.guide.warnings.length,
        goalsCount: vm.guide.goals.length,
        timelinePointCount: vm.guide.timelineSummaryRows.length,
      },
    },
    ...(vm.reproducibility ? [{ label: "reproducibility", value: vm.reproducibility }] : []),
  ];
}

function severityLabel(value: ReportActionRow["severity"]): string {
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [runError, setRunError] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteWorking, setDeleteWorking] = useState(false);

  const loadReports = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    setListError("");
    try {
      const res = await fetch("/api/planning/v2/reports?limit=100", { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportListItem[]> | null;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setReports([]);
        setSelected(null);
        setSelectedRun(null);
        setListError(payload?.error?.message ?? "리포트 목록을 불러오지 못했습니다.");
        return;
      }
      const reportRows = payload.data;
      setReports(reportRows);
      setSelectedId((currentSelectedId) => {
        const preferredSelectedId = currentSelectedId || selectedFromQuery || initialSelectedId;
        if (reportRows.some((row) => row.id === preferredSelectedId)) return preferredSelectedId;
        return reportRows[0]?.id ?? "";
      });
    } catch {
      setReports([]);
      setSelected(null);
      setSelectedRun(null);
      setListError("리포트 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingList(false);
    }
  }, [initialSelectedId, selectedFromQuery]);

  async function loadReportDetail(id: string): Promise<void> {
    if (!id) {
      setSelected(null);
      setSelectedRun(null);
      setDetailError("");
      setRunError("");
      return;
    }
    setDetailError("");
    setRunError("");
    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<ReportDetail> | null;
      if (!payload?.ok || !payload.data) {
        setSelected(null);
        setSelectedRun(null);
        setDetailError(payload?.error?.message ?? "리포트 상세를 불러오지 못했습니다.");
        return;
      }
      setSelected(payload.data);
    } catch {
      setSelected(null);
      setSelectedRun(null);
      setDetailError("리포트 상세를 불러오지 못했습니다.");
    }
  }

  async function loadRunDetail(runId: string): Promise<void> {
    if (!runId) {
      setSelectedRun(null);
      setRunError("");
      return;
    }
    setLoadingRun(true);
    setRunError("");
    try {
      const res = await fetch(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const payload = (await res.json().catch(() => null)) as ApiResponse<PlanningRunRecord> | null;
      if (!payload?.ok || !payload.data) {
        setSelectedRun(null);
        setRunError(payload?.error?.message ?? "실행 기록 데이터를 불러오지 못했습니다.");
        return;
      }
      setSelectedRun(payload.data);
    } catch {
      setSelectedRun(null);
      setRunError("실행 기록 데이터를 불러오지 못했습니다.");
    } finally {
      setLoadingRun(false);
    }
  }

  function openDeleteDialog(id: string): void {
    setDeleteTargetId(id);
    setDeleteConfirmText("");
    setError("");
    setNotice("");
  }

  function closeDeleteDialog(): void {
    setDeleteTargetId("");
    setDeleteConfirmText("");
  }

  async function submitDeleteReport(): Promise<void> {
    if (!deleteTargetId) return;
    const expectedConfirm = buildConfirmString("DELETE report", deleteTargetId);
    if (deleteConfirmText.trim() !== expectedConfirm) {
      setError(`삭제 확인 문구가 일치하지 않습니다. (${expectedConfirm})`);
      setNotice("");
      return;
    }

    setDeleteWorking(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/planning/v2/reports/${encodeURIComponent(deleteTargetId)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(withDevCsrf({ confirmText: deleteConfirmText.trim() })),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<{ deleted?: boolean }> | null;
      if (!res.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "리포트 삭제에 실패했습니다.");
        setNotice("");
        return;
      }
      await loadReports();
      closeDeleteDialog();
      setNotice("리포트를 휴지통으로 이동했습니다.");
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "리포트 삭제 중 오류가 발생했습니다.");
      setNotice("");
    } finally {
      setDeleteWorking(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

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

  const selectedVm = useMemo(
    () => selectedRun
      ? safeBuildReportVMFromRun(selectedRun, selected ? {
        id: selected.id,
        runId: selected.runId,
        createdAt: selected.createdAt,
      } : undefined)
      : { vm: null, error: null },
    [selected, selectedRun],
  );
  const selectedVmData = selectedVm.vm;
  const selectedVmError = selectedVm.error;
  const assumptionsLines = useMemo(
    () => selectedVmData?.assumptionsLines ?? [],
    [selectedVmData],
  );
  const summaryCards = useMemo(
    () => selectedVmData?.summaryCards ?? {},
    [selectedVmData],
  );
  const aggregatedWarnings = useMemo(
    () => selectedVmData?.guide.warnings ?? [],
    [selectedVmData],
  );
  const goalRows = useMemo(
    () => selectedVmData?.guide.goals ?? [],
    [selectedVmData],
  );
  const timelineSummaryRows = useMemo(
    () => selectedVmData?.guide.timelineSummaryRows ?? [],
    [selectedVmData],
  );
  const badge = useMemo(
    () => selectedVmData?.guide.badge ?? {
      status: "ok" as const,
      reason: "현재 가정 기준으로 주요 지표가 안정 범위입니다.",
      minCashKrw: 0,
      maxDsr: 0,
      missedGoals: 0,
      contributionSkippedCount: 0,
    },
    [selectedVmData],
  );
  const actionRows = useMemo(
    () => selectedVmData?.actionRows ?? [],
    [selectedVmData],
  );
  const topActions = useMemo(
    () => selectedVmData?.topActions.map((row) => row.title).slice(0, LIMITS.actionsTop) ?? [],
    [selectedVmData],
  );
  const visibleActionRows = useMemo(
    () => (showAllActions ? actionRows : actionRows.slice(0, LIMITS.actionsTop)),
    [actionRows, showAllActions],
  );
  const scenarioRows = useMemo(
    () => selectedVmData?.scenarioRows ?? [],
    [selectedVmData],
  );
  const monteProbabilityRows = useMemo(
    () => selectedVmData?.monteProbabilityRows ?? [],
    [selectedVmData],
  );
  const montePercentileRows = useMemo(
    () => selectedVmData?.montePercentileRows ?? [],
    [selectedVmData],
  );
  const debtSummaryMeta = useMemo(
    () => selectedVmData?.debtSummary?.meta,
    [selectedVmData],
  );
  const debtWarnings = useMemo(
    () => (selectedVmData?.debtSummary?.warnings ?? []).map((warning) => ({
      code: warning.code,
      severity: "warn" as const,
      count: 1,
      sampleMessage: warning.message,
    })),
    [selectedVmData],
  );
  const debtSummaries = useMemo(
    () => selectedVmData?.debtSummaryRows ?? [],
    [selectedVmData],
  );
  const detailJsonSections = useMemo(
    () => detailSections(selected, selectedRun, selectedVmData),
    [selected, selectedRun, selectedVmData],
  );
  const achievedGoals = useMemo(
    () => goalRows.filter((goal) => goal.achieved).length,
    [goalRows],
  );
  const criticalWarningsCount = useMemo(
    () => (
      typeof summaryCards.criticalWarnings === "number"
        ? summaryCards.criticalWarnings
        : aggregatedWarnings.filter((warning) => warning.severity === "critical").length
    ),
    [aggregatedWarnings, summaryCards.criticalWarnings],
  );
  const handlePrint = (): void => {
    if (typeof window === "undefined") return;
    window.print();
  };

  const deleteExpectedConfirm = deleteTargetId ? buildConfirmString("DELETE report", deleteTargetId) : "";

  const content = (
    <>
      {error ? (
        <Card className="print-card mb-4 border border-rose-200 bg-rose-50">
          <p className="text-sm font-semibold text-rose-700">{error}</p>
        </Card>
      ) : null}
      {notice ? (
        <Card className="print-card mb-4 border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-700">{notice}</p>
        </Card>
      ) : null}
      <div className="report-root grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card className="print-card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">리포트 목록</h2>
            <Button className="no-print" disabled={loadingList} onClick={() => void loadReports()} size="sm" variant="ghost">새로고침</Button>
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
                {listError ? (
                  <tr><td className="px-2 py-3 text-rose-700" colSpan={4}>{listError}</td></tr>
                ) : reports.length === 0 ? (
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
                        className="no-print font-semibold text-rose-700"
                        onClick={() => openDeleteDialog(report.id)}
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

        <Card className="print-card">
          <h2 className="text-base font-bold text-slate-900">리포트 대시보드</h2>
          {detailError ? (
            <BodyStatusInset className="mt-3 text-xs" tone="danger">
              {detailError}
            </BodyStatusInset>
          ) : !selected ? (
            <p className="mt-3 text-xs text-slate-500">리포트를 선택하세요.</p>
          ) : (
            <div className="mt-3 space-y-4 text-xs text-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span>id: {selected.id}</span>
                <span>·</span>
                <span>createdAt: {formatDateTime(selected.createdAt)}</span>
                {selected.runId ? (<><span>·</span><span>runId: {selected.runId}</span></>) : null}
              </div>

              <div className={`no-print ${bodyActionLinkGroupClassName}`}>
                <a
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-50"
                  href={`/api/planning/v2/reports/${encodeURIComponent(selected.id)}/download`}
                >
                  마크다운 다운로드
                </a>
                <Link
                  className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-50"
                  href={`/planning/reports/${encodeURIComponent(selected.id)}`}
                >
                  고정 링크
                </Link>
              </div>

              {!selected.runId ? (
                <BodyStatusInset tone="warning">
                  이 리포트는 runId가 없는 수동 리포트입니다. 요약 대시보드를 구성할 실행 데이터가 없습니다.
                </BodyStatusInset>
              ) : loadingRun ? (
                <BodyStatusInset>run 데이터를 불러오는 중...</BodyStatusInset>
              ) : runError ? (
                <BodyStatusInset tone="danger">
                  {runError}
                </BodyStatusInset>
              ) : !selectedRun ? (
                <BodyStatusInset tone="danger">
                  실행 기록 데이터를 찾을 수 없습니다. 실행 기록이 삭제되었을 수 있습니다.
                </BodyStatusInset>
              ) : (
                <>
                  {selectedVmError ? (
                    <BodyStatusInset tone="danger">
                      선택한 실행의 리포트를 구성하지 못했습니다. {selectedVmError}
                    </BodyStatusInset>
                  ) : null}
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
                    <BodySectionHeading
                      description="스냅샷 시점과 가정을 먼저 확인한 뒤 아래 진단을 읽어야 해석 오류를 줄일 수 있습니다."
                      title="1) 기준정보"
                    />
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <BodyInset>스냅샷 ID: <span className="font-semibold">{selectedRun.meta.snapshot?.id ?? selectedRun.input.snapshotId ?? "latest"}</span></BodyInset>
                      <BodyInset>스냅샷 asOf: <span className="font-semibold">{selectedRun.meta.snapshot?.asOf ?? "-"}</span></BodyInset>
                      <BodyInset>스냅샷 fetchedAt: <span className="font-semibold">{selectedRun.meta.snapshot?.fetchedAt ? formatDateTime(selectedRun.meta.snapshot.fetchedAt) : "-"}</span></BodyInset>
                      <BodyInset>실행 시각: <span className="font-semibold">{formatDateTime(selectedRun.createdAt)}</span></BodyInset>
                    </div>
                    <BodyInset className="mt-2">
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
                    </BodyInset>
                    {selectedVmData?.contract ? (
                      <BodyInset className="mt-2">
                        <p className="font-semibold text-slate-900">Contract 상태</p>
                        <p className="mt-1">engine schema: {selectedVmData.contract.engineSchemaVersion}</p>
                        {selectedVmData.contract.fallbacks.length > 0 ? (
                          <p className="mt-1">
                            fallback:
                            {" "}
                            {selectedVmData.contract.fallbacks.join(", ")}
                          </p>
                        ) : null}
                      </BodyInset>
                    ) : null}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <BodySectionHeading
                      description="핵심 지표 5개만 먼저 보고 위험 신호를 빠르게 판단할 수 있습니다."
                      title="2) Executive Summary"
                    />
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <BodyInset>
                        <p className="text-[11px] text-slate-500">말기 순자산</p>
                        <p className="text-sm font-semibold text-slate-900">{toMoney(summaryCards.endNetWorthKrw)}</p>
                      </BodyInset>
                      <BodyInset>
                        <p className="text-[11px] text-slate-500">최저 현금</p>
                        <p className="text-sm font-semibold text-slate-900">{toMoney(summaryCards.worstCashKrw)}</p>
                      </BodyInset>
                      <BodyInset>
                        <p className="text-[11px] text-slate-500">목표 달성</p>
                        <p className="text-sm font-semibold text-slate-900">{achievedGoals}/{goalRows.length}</p>
                      </BodyInset>
                      <BodyInset>
                        <p className="text-[11px] text-slate-500">최대 DSR</p>
                        <p className="text-sm font-semibold text-slate-900">{formatRatioPct(badge.maxDsr)}</p>
                      </BodyInset>
                      <BodyInset>
                        <p className="text-[11px] text-slate-500">치명 경고</p>
                        <p className="text-sm font-semibold text-slate-900">{criticalWarningsCount}건</p>
                      </BodyInset>
                    </div>
                  </section>

                  <WarningsTable warnings={aggregatedWarnings} />
                  <GoalsTable locale="ko-KR" goals={goalRows} />
                  <TimelineSummaryTable locale="ko-KR" rows={timelineSummaryRows} />

                  <section className="space-y-2">
                    <BodySectionHeading
                      description="심각도 높은 액션부터 처리하면 경고와 목표 미달을 빠르게 줄일 수 있습니다."
                      title={`5) Action Plan (Top ${LIMITS.actionsTop})`}
                    />
                    {actionRows.length === 0 ? (
                      <BodyStatusInset>권장 액션이 없습니다.</BodyStatusInset>
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
                      <BodyInset className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          {showAllActions
                            ? `전체 ${actionRows.length}개 액션 표시 중`
                            : `추가 ${actionRows.length - visibleActionRows.length}개 액션이 생략되었습니다.`}
                        </span>
                        <button
                          className="no-print font-semibold text-emerald-700"
                          onClick={() => setShowAllActions((prev) => !prev)}
                          type="button"
                        >
                          {showAllActions ? "접기" : "더 보기"}
                        </button>
                      </BodyInset>
                    ) : null}
                  </section>

                  {scenarioRows.length > 0 ? (
                    <section className="space-y-2">
                      <BodySectionHeading
                        description="기준 대비 지표 변화를 보면 어떤 가정에서 성과가 악화되는지 빠르게 파악할 수 있습니다."
                        title="6) Scenarios"
                      />
                      <BodyTableFrame>
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
                      </BodyTableFrame>
                    </section>
                  ) : null}

                  {monteProbabilityRows.length > 0 || montePercentileRows.length > 0 ? (
                    <section className="space-y-2">
                      <BodySectionHeading title="7) Monte Carlo" />
                      {monteProbabilityRows.length > 0 ? (
                        <BodyInset className="space-y-1">
                          {monteProbabilityRows.map((row) => (
                            <p key={row.label}>
                              <span className="font-semibold text-slate-900">{row.label}: {row.value}</span>
                              <span className="ml-1">{row.interpretation}</span>
                            </p>
                          ))}
                        </BodyInset>
                      ) : null}
                      {montePercentileRows.length > 0 ? (
                        <BodyTableFrame>
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
                        </BodyTableFrame>
                      ) : null}
                    </section>
                  ) : null}

                  {(debtSummaryMeta || debtSummaries.length > 0) ? (
                    <section className="space-y-2">
                      <BodySectionHeading
                        description="상환부담과 이자비용을 함께 보면 리파이낸스/상환전략 우선순위를 정하기 쉽습니다."
                        title="8) Debt Analysis"
                      />
                      <div className="grid gap-2 md:grid-cols-2">
                        <BodyInset>
                          현재 DSR: <span className="font-semibold">{formatRatioPct(debtSummaryMeta?.debtServiceRatio)}</span>
                        </BodyInset>
                        <BodyInset>
                          월 총상환액: <span className="font-semibold">{toMoney(debtSummaryMeta?.totalMonthlyPaymentKrw)}</span>
                        </BodyInset>
                      </div>
                      <WarningsTable warnings={debtWarnings} />
                      {debtSummaries.length > 0 ? (
                        <BodyTableFrame>
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
                        </BodyTableFrame>
                      ) : (
                        <BodyStatusInset>부채별 상세 데이터가 없습니다.</BodyStatusInset>
                      )}
                    </section>
                  ) : null}
                </>
              )}

              <details className="no-print rounded-xl border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">고급 보기 (contract/VM/Markdown)</summary>
                <div className="mt-3 space-y-3">
                  <AdvancedJsonPanel sections={detailJsonSections} title="Contract/VM 메타 보기" />
                  <details className="rounded-xl border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">원본 Markdown 보기</summary>
                    <pre className="print-markdown mt-3 max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100 print:max-h-none print:overflow-visible">
                      {selected.markdown}
                    </pre>
                  </details>
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>
      {deleteTargetId ? (
        <div
          aria-labelledby="planning-reports-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
        >
          <BodyDialogSurface className="max-w-lg">
            <h3 className="text-base font-black text-slate-900" id="planning-reports-delete-title">리포트 삭제 확인</h3>
            <p className="mt-2 text-sm text-slate-700">확인 문구를 정확히 입력해야 삭제가 진행됩니다.</p>
            <BodyInset className="mt-2 bg-slate-100 font-mono text-xs text-slate-700">{deleteExpectedConfirm}</BodyInset>
            <input
              className={bodyFieldClassName}
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <div className={bodyDialogActionsClassName}>
              <Button
                disabled={deleteWorking}
                onClick={closeDeleteDialog}
                size="sm"
                type="button"
                variant="outline"
              >
                취소
              </Button>
              <Button
                disabled={deleteWorking || deleteConfirmText.trim() !== deleteExpectedConfirm}
                onClick={() => void submitDeleteReport()}
                size="sm"
                type="button"
                variant="primary"
              >
                {deleteWorking ? "삭제 중..." : "삭제 진행"}
              </Button>
            </div>
          </BodyDialogSurface>
        </div>
      ) : null}
    </>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <PageShell className="report-root">
      <PageHeader
        title="플래닝 리포트"
        description="run 기반 리포트 대시보드 조회/다운로드/삭제"
        action={(
          <div className="no-print flex items-center gap-4 text-sm">
            <Button
              data-testid="report-print-button"
              onClick={handlePrint}
              size="sm"
              type="button"
              variant="outline"
            >
              PDF 인쇄
            </Button>
            <Link className="font-semibold text-emerald-700" href="/planning/trash">휴지통</Link>
            <Link className="font-semibold text-emerald-700" href="/planning/runs">실행 기록으로</Link>
          </div>
        )}
      />
      {content}
    </PageShell>
  );
}

export default PlanningReportsClient;
