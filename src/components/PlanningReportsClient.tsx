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
  bodyDialogActionsClassName,
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
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

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
        <Card className="print-card mb-4 border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-semibold text-rose-700">{error}</p>
        </Card>
      ) : null}
      {notice ? (
        <Card className="print-card mb-4 border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700">{notice}</p>
        </Card>
      ) : null}
      <div className="report-root grid gap-8 xl:grid-cols-[1fr_1.8fr]">
        <div className="space-y-8">
          <Card className="print-card overflow-hidden rounded-[2rem] border-slate-100 p-0 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 p-6 px-8">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">리포트 목록</h2>
              <Button className="no-print h-8 rounded-full px-4 font-black" disabled={loadingList} onClick={() => void loadReports()} size="sm" variant="outline">새로고침</Button>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-black uppercase tracking-widest">ID</th>
                      <th className="px-4 py-3 font-black uppercase tracking-widest">생성시각</th>
                      <th className="px-4 py-3 text-right font-black uppercase tracking-widest">동작</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 bg-white">
                    {listError ? (
                      <tr><td className="px-4 py-6 text-rose-700 font-bold" colSpan={3}>{listError}</td></tr>
                    ) : reports.length === 0 ? (
                      <tr><td className="px-4 py-6 text-slate-400 text-center font-bold" colSpan={3}>저장된 리포트가 없습니다.</td></tr>
                    ) : reports.map((report) => (
                      <tr className={cn("group transition-colors hover:bg-slate-50", selectedId === report.id && "bg-emerald-50/30")} key={report.id}>
                        <td className="px-4 py-3">
                          <button
                            className={cn("font-black text-slate-900 transition-colors group-hover:text-emerald-600", selectedId === report.id && "text-emerald-600 underline underline-offset-4 decoration-emerald-200")}
                            onClick={() => setSelectedId(report.id)}
                            type="button"
                          >
                            {report.id.slice(0, 8)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-500 tabular-nums">{formatDateTime(report.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            className="no-print font-black text-slate-300 hover:text-rose-600 transition-colors"
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
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="print-card rounded-[2.5rem] border-slate-100 p-8 shadow-sm lg:p-10">
            <SubSectionHeader title="리포트 대시보드" className="mb-8" />
            
            {detailError ? (
              <div className="rounded-[1.5rem] bg-rose-50 p-6 text-center border border-rose-100">
                <p className="text-sm font-black text-rose-700">{detailError}</p>
              </div>
            ) : !selected ? (
              <div className="py-20 text-center">
                <p className="text-sm font-black uppercase tracking-widest text-slate-300">목록에서 리포트를 선택해 주세요.</p>
              </div>
            ) : (
              <div className="space-y-10">
                <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-50 px-5 py-4 border border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Report Context</p>
                    <p className="text-[11px] font-bold text-slate-700">
                      ID: <span className="font-black">{selected.id}</span> · 생성: <span className="font-black tabular-nums">{formatDateTime(selected.createdAt)}</span>
                      {selected.runId ? (<> · Run: <span className="font-black">{selected.runId}</span></>) : null}
                    </p>
                  </div>
                </div>

                <div className="no-print flex flex-wrap gap-3">
                  <a
                    className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 active:scale-95 shadow-sm"
                    href={`/api/planning/v2/reports/${encodeURIComponent(selected.id)}/download`}
                  >
                    마크다운 다운로드
                  </a>
                  <Link
                    className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-700 transition-all hover:border-emerald-200 hover:bg-emerald-50 active:scale-95 shadow-sm"
                    href={`/planning/reports/${encodeURIComponent(selected.id)}`}
                  >
                    고정 링크 열기
                  </Link>
                </div>

                {!selected.runId ? (
                  <div className="rounded-2xl bg-amber-50 p-6 text-center border border-amber-100">
                    <p className="text-sm font-bold text-amber-800 leading-relaxed">이 리포트는 runId가 없는 수동 리포트입니다. 요약 대시보드를 구성할 실행 데이터가 없습니다.</p>
                  </div>
                ) : loadingRun ? (
                  <div className="py-12 flex justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                  </div>
                ) : runError ? (
                  <div className="rounded-2xl bg-rose-50 p-6 text-center border border-rose-100">
                    <p className="text-sm font-black text-rose-700">{runError}</p>
                  </div>
                ) : !selectedRun ? (
                  <div className="rounded-2xl bg-rose-50 p-6 text-center border border-rose-100">
                    <p className="text-sm font-black text-rose-700">실행 기록 데이터를 찾을 수 없습니다. 이미 삭제된 데이터일 수 있습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-12">
                    {selectedVmError ? (
                      <div className="rounded-2xl bg-rose-50 p-6 border border-rose-100">
                        <p className="text-sm font-black text-rose-700">리포트 구성 실패: {selectedVmError}</p>
                      </div>
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

                    <section className="space-y-6">
                      <SubSectionHeader
                        description="스냅샷 시점과 가정을 먼저 확인하세요."
                        title="1) 기준 정보"
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">스냅샷 ID</p>
                          <p className="text-sm font-black text-slate-900">{selectedRun.meta.snapshot?.id ?? selectedRun.input.snapshotId ?? "latest"}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">기준 시점 (asOf)</p>
                          <p className="text-sm font-black text-slate-900 tabular-nums">{selectedRun.meta.snapshot?.asOf ?? "-"}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">데이터 수집일</p>
                          <p className="text-sm font-black text-slate-900 tabular-nums">{selectedRun.meta.snapshot?.fetchedAt ? formatDateTime(selectedRun.meta.snapshot.fetchedAt) : "-"}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">플래닝 실행 시각</p>
                          <p className="text-sm font-black text-slate-900 tabular-nums">{formatDateTime(selectedRun.createdAt)}</p>
                        </div>
                      </div>
                      
                      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-inner">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">가정 요약 (Overrides)</p>
                        {assumptionsLines.length === 0 ? (
                          <p className="text-sm font-medium text-slate-400 italic">명시된 override 가정이 없습니다.</p>
                        ) : (
                          <ul className="space-y-2">
                            {assumptionsLines.map((line) => (
                              <li key={line} className="flex gap-3 text-sm font-bold text-slate-700">
                                <span className="text-emerald-500 font-black">•</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>

                    <section className="space-y-6">
                      <SubSectionHeader
                        description="핵심 지표 5개로 판단하는 위험 신호입니다."
                        title="2) Executive Summary"
                      />
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 hover:bg-white hover:shadow-md transition-all">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">말기 순자산</p>
                          <p className="mt-2 text-xl font-black text-slate-900 tabular-nums tracking-tight">{toMoney(summaryCards.endNetWorthKrw)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 hover:bg-white hover:shadow-md transition-all">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최저 현금</p>
                          <p className="mt-2 text-xl font-black text-slate-900 tabular-nums tracking-tight">{toMoney(summaryCards.worstCashKrw)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 hover:bg-white hover:shadow-md transition-all">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">목표 달성</p>
                          <p className="mt-2 text-xl font-black text-slate-900 tabular-nums tracking-tight">{achievedGoals} / {goalRows.length}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 hover:bg-white hover:shadow-md transition-all">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최대 DSR</p>
                          <p className="mt-2 text-xl font-black text-slate-900 tabular-nums tracking-tight">{formatRatioPct(badge.maxDsr)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 hover:bg-white hover:shadow-md transition-all">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">치명 경고</p>
                          <p className="mt-2 text-xl font-black text-rose-600 tabular-nums tracking-tight">{criticalWarningsCount}건</p>
                        </div>
                      </div>
                    </section>

                    <WarningsTable warnings={aggregatedWarnings} />
                    <GoalsTable locale="ko-KR" goals={goalRows} />
                    <TimelineSummaryTable locale="ko-KR" rows={timelineSummaryRows} />

                    <section className="space-y-6">
                      <SubSectionHeader
                        description="심각도 높은 액션부터 순서대로 제안합니다."
                        title={`5) Action Plan (Top ${LIMITS.actionsTop})`}
                      />
                      {actionRows.length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 p-8 text-center border border-slate-100">
                          <p className="text-sm font-bold text-slate-400 italic">권장 액션이 없습니다.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {visibleActionRows.map((action, index) => (
                            <article className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-emerald-100" key={`${action.code}-${index}`}>
                              <div className="flex items-center justify-between mb-4">
                                <Badge variant={action.severity === "critical" ? "destructive" : action.severity === "warn" ? "warning" : "secondary"} className="h-6 rounded-lg px-2.5 text-[10px] font-black border-none uppercase tracking-widest">
                                  {severityLabel(action.severity)}
                                </Badge>
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-black text-slate-700 shadow-sm">{index + 1}</span>
                              </div>
                              <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">{action.title}</h3>
                              <p className="mt-3 text-sm font-bold text-slate-600 leading-relaxed">{action.summary || "핵심 경고를 줄이기 위한 실행 계획입니다."}</p>
                              <div className="mt-6 flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <span>Evidence {action.whyCount}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-200" />
                                <span>Steps {action.steps.length}</span>
                                <span className="h-1 w-1 rounded-full bg-slate-200" />
                                <span>Cautions {action.cautions.length}</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      {actionRows.length > LIMITS.actionsTop ? (
                        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-6 py-4 border border-slate-100">
                          <span className="text-xs font-bold text-slate-500">
                            {showAllActions
                              ? `전체 ${actionRows.length}개 액션 표시 중`
                              : `추가 ${actionRows.length - visibleActionRows.length}개 액션이 생략되었습니다.`}
                          </span>
                          <Button
                            className="h-9 rounded-full px-6 font-black"
                            onClick={() => setShowAllActions((prev) => !prev)}
                            size="sm"
                            variant="outline"
                          >
                            {showAllActions ? "접기" : "전체 보기"}
                          </Button>
                        </div>
                      ) : null}
                    </section>

                    {scenarioRows.length > 0 ? (
                      <section className="space-y-6">
                        <SubSectionHeader
                          description="가정 변화에 따른 지표 성과 변화를 비교합니다."
                          title="6) Scenarios"
                        />
                        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                          <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 text-slate-400">
                              <tr>
                                <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">시나리오</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">말기 순자산</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">기준 대비</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">최저 현금</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">목표 달성</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">경고 수</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {scenarioRows.map((row) => (
                                <tr className="group transition-colors hover:bg-slate-50/50" key={row.id}>
                                  <td className="px-4 py-4 font-black text-slate-900">{row.title}</td>
                                  <td className="px-4 py-4 text-right font-bold tabular-nums">{toMoney(row.endNetWorthKrw)}</td>
                                  <td className={cn("px-4 py-4 text-right font-black tabular-nums", row.endNetWorthDeltaKrw < 0 ? "text-rose-600" : "text-emerald-600")}>
                                    {row.endNetWorthDeltaKrw >= 0 ? "+" : ""}{toMoney(row.endNetWorthDeltaKrw)}
                                  </td>
                                  <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{toMoney(row.worstCashKrw)}</td>
                                  <td className="px-4 py-4 text-right font-black tabular-nums text-slate-900">{row.goalsAchievedCount}</td>
                                  <td className="px-4 py-4 text-right font-black tabular-nums text-slate-900">{row.warningsCount}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}

                    {monteProbabilityRows.length > 0 || montePercentileRows.length > 0 ? (
                      <section className="space-y-6">
                        <SubSectionHeader title="7) Monte Carlo Analysis" />
                        <div className="grid gap-4 md:grid-cols-2">
                          {monteProbabilityRows.map((row) => (
                            <div key={row.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.label}</p>
                                <span className="text-lg font-black text-emerald-600 tabular-nums">{row.value}</span>
                              </div>
                              <p className="text-xs font-bold text-slate-600 leading-relaxed">{row.interpretation}</p>
                            </div>
                          ))}
                        </div>
                        {montePercentileRows.length > 0 ? (
                          <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                            <table className="min-w-full divide-y divide-slate-100 text-sm">
                              <thead className="bg-slate-50 text-slate-400">
                                <tr>
                                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">지표</th>
                                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">P10 (Worst)</th>
                                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">P50 (Median)</th>
                                  <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">P90 (Best)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {montePercentileRows.map((row) => (
                                  <tr className="group transition-colors hover:bg-slate-50/50" key={row.metric}>
                                    <td className="px-4 py-4 font-black text-slate-900">{row.metric}</td>
                                    <td className="px-4 py-4 text-right font-bold tabular-nums text-rose-600">{toMoney(row.p10)}</td>
                                    <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{toMoney(row.p50)}</td>
                                    <td className="px-4 py-4 text-right font-bold tabular-nums text-emerald-600">{toMoney(row.p90)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {(debtSummaryMeta || debtSummaries.length > 0) ? (
                      <section className="space-y-6">
                        <SubSectionHeader
                          description="상환 부담과 이자 비용을 함께 분석합니다."
                          title="8) Debt Analysis"
                        />
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-[1.5rem] bg-emerald-600 p-6 text-white shadow-xl shadow-emerald-900/20">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-1">현재 DSR</p>
                            <p className="text-3xl font-black tabular-nums tracking-tight">{formatRatioPct(debtSummaryMeta?.debtServiceRatio)}</p>
                          </div>
                          <div className="rounded-[1.5rem] bg-slate-50 p-6 border border-slate-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">월 총상환액</p>
                            <p className="text-2xl font-black text-slate-900 tabular-nums tracking-tight">{toMoney(debtSummaryMeta?.totalMonthlyPaymentKrw)}</p>
                          </div>
                        </div>
                        
                        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                          <table className="min-w-full divide-y divide-slate-100 text-sm">
                            <thead className="bg-slate-50 text-slate-400">
                              <tr>
                                <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">부채명</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">원금</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">금리(APR)</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">월 상환액</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">잔여 총이자</th>
                                <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">완료월</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {debtSummaries.map((row) => (
                                <tr className="group transition-colors hover:bg-slate-50/50" key={`${row.liabilityId}-${row.name}`}>
                                  <td className="px-4 py-4 font-black text-slate-900">{row.name}</td>
                                  <td className="px-4 py-4 text-right font-bold tabular-nums">{toMoney(row.principalKrw)}</td>
                                  <td className="px-4 py-4 text-right font-black tabular-nums text-emerald-600">{typeof row.aprPct === "number" ? `${row.aprPct.toFixed(2)}%` : "-"}</td>
                                  <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{toMoney(row.monthlyPaymentKrw)}</td>
                                  <td className="px-4 py-4 text-right font-bold tabular-nums text-rose-600">{toMoney(row.totalInterestRemainingKrw)}</td>
                                  <td className="px-4 py-4 text-right font-black tabular-nums text-slate-400">{typeof row.payoffMonthIndex === "number" ? `M${row.payoffMonthIndex + 1}` : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ) : null}
                  </div>
                )}

                <details className="no-print group rounded-[2rem] border border-slate-200 bg-slate-50/50 p-6 transition-all">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open:text-slate-600 list-none flex items-center gap-2">
                    <span className="transition-transform group-open:rotate-90">▶</span>
                    고급 보기 (Contract/VM/Markdown)
                  </summary>
                  <div className="mt-8 space-y-8">
                    <AdvancedJsonPanel sections={detailJsonSections} title="Contract/VM 메타 데이터" />
                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-inner">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">원본 Markdown 원문</p>
                      <pre className="print-markdown max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-5 text-[11px] leading-relaxed text-slate-300 font-mono print:max-h-none print:overflow-visible">
                        {selected.markdown}
                      </pre>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </Card>
        </div>
      </div>
      {deleteTargetId ? (
        <div
          aria-labelledby="planning-reports-delete-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
          role="dialog"
        >
          <BodyDialogSurface className="max-w-lg rounded-[2.5rem] p-8 shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 tracking-tight" id="planning-reports-delete-title">리포트 삭제 확인</h3>
            <p className="mt-3 text-sm font-bold text-slate-600 leading-relaxed">이 작업은 되돌릴 수 없습니다. 삭제를 진행하려면 아래 확인 문구를 정확히 입력해 주세요.</p>
            <div className="my-6 rounded-2xl bg-slate-100 p-4 font-mono text-[11px] font-black text-slate-700 border border-slate-200 shadow-inner break-all">
              {deleteExpectedConfirm}
            </div>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-sm"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder="위의 확인 문구를 입력하세요"
            />
            <div className={bodyDialogActionsClassName}>
              <Button
                disabled={deleteWorking}
                onClick={closeDeleteDialog}
                size="md"
                type="button"
                variant="outline"
                className="rounded-2xl h-12 px-8 font-black"
              >
                취소
              </Button>
              <Button
                disabled={deleteWorking || deleteConfirmText.trim() !== deleteExpectedConfirm}
                onClick={() => void submitDeleteReport()}
                size="md"
                type="button"
                variant="primary"
                className="rounded-2xl h-12 px-8 font-black shadow-lg shadow-rose-900/20"
              >
                {deleteWorking ? "삭제 중..." : "확인 및 삭제"}
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
        description="Run 기반 리포트 대시보드 조회 및 관리"
        action={(
          <div className="no-print flex items-center gap-4">
            <Button
              data-testid="report-print-button"
              onClick={handlePrint}
              size="sm"
              type="button"
              variant="outline"
              className="rounded-full font-black px-5 h-9"
            >
              PDF 인쇄
            </Button>
            <div className="flex gap-4 text-sm font-black">
              <Link className="text-slate-400 hover:text-emerald-600 transition-colors" href="/planning/trash">휴지통</Link>
              <Link className="text-slate-400 hover:text-emerald-600 transition-colors" href="/planning/runs">실행 기록</Link>
            </div>
          </div>
        )}
      />
      {content}
    </PageShell>
  );
}

export default PlanningReportsClient;
