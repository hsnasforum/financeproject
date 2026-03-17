"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ReportHeroStatCard,
  ReportHeroStatGrid,
} from "@/components/ui/ReportTone";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { type Stage } from "@/lib/planning/engine";
import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import { PLANNER_ACTION_LINKS } from "@/lib/planner/compute";
import { type ReportVM } from "../_lib/reportViewModel";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

type Props = {
  vm: ReportVM;
};

function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatKrw("ko-KR", value);
}

function formatMetricMonths(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatMonths("ko-KR", value);
}

function severityText(severity: "info" | "warn" | "critical"): string {
  if (severity === "critical") return "치명";
  if (severity === "warn") return "경고";
  return "정보";
}

function isStageSuccess(vm: ReportVM, id: keyof ReportVM["stage"]["byId"]): boolean {
  const stage = vm.stage.byId[id];
  if (!stage) return true;
  return stage.status === "SUCCESS";
}

function stageMessage(vm: ReportVM, id: keyof ReportVM["stage"]["byId"], fallback: string): string {
  const stage = vm.stage.byId[id];
  if (!stage) return fallback;
  if (stage.status === "FAILED") {
    return stage.errorSummary || "단계 실패로 섹션을 표시할 수 없습니다.";
  }
  if (stage.status === "SKIPPED") {
    return stage.errorSummary || `단계가 생략되었습니다(${stage.reason ?? "미상"}).`;
  }
  if (stage.status === "RUNNING" || stage.status === "PENDING") {
    return "단계 진행 중입니다.";
  }
  return fallback;
}

function renderEvidenceValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "string") return value;
  if (value === null) return "없음";
  return "-";
}

function guideToneClass(tone: "slate" | "amber" | "rose" | "emerald"): string {
  if (tone === "rose") return "border-rose-100 bg-rose-50/50 text-rose-900 shadow-sm";
  if (tone === "amber") return "border-amber-100 bg-amber-50/50 text-amber-900 shadow-sm";
  if (tone === "emerald") return "border-emerald-100 bg-emerald-50/50 text-emerald-900 shadow-sm";
  return "border-slate-100 bg-slate-50/50 text-slate-900 shadow-sm";
}

function formatEvidenceInput(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  return String(value);
}

function compactText(value: string | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asStage(value: unknown): Stage | undefined {
  return value === "DEFICIT" || value === "DEBT" || value === "EMERGENCY" || value === "INVEST" ? value : undefined;
}

function resolvePlanningStage(vm: ReportVM): Stage | undefined {
  const raw = asRecord(vm.raw);
  const run = asRecord(raw?.runJson);
  const outputs = asRecord(run?.outputs);
  const engine = asRecord(outputs?.engine);
  const engineFinancialStatus = asRecord(engine?.financialStatus);
  const simulate = asRecord(outputs?.simulate);
  const simulateFinancialStatus = asRecord(simulate?.financialStatus);

  return (
    asStage(engineFinancialStatus?.stage)
    ?? asStage(engine?.stage)
    ?? asStage(simulateFinancialStatus?.stage)
    ?? asStage(simulate?.stage)
  );
}

function buildActionRecommendHref(input: {
  baseHref: string;
  runId?: string;
  stage?: Stage;
  overallStatus?: PlanningRunOverallStatus;
  actionCode?: "BUILD_EMERGENCY_FUND" | "COVER_LUMP_SUM_GOAL";
}): string {
  const url = new URL(input.baseHref, "https://financeproject.local");
  url.searchParams.set("from", "planning-report");
  if (input.runId) {
    url.searchParams.set("planning.runId", input.runId);
  }
  if (input.stage) {
    url.searchParams.set("planning.summary.stage", input.stage);
  }
  if (input.overallStatus) {
    url.searchParams.set("planning.summary.overallStatus", input.overallStatus);
  }
  if (input.actionCode) {
    url.searchParams.set("planning.actionCode", input.actionCode);
  }
  return `${url.pathname}${url.search}`;
}

const HOUSING_SUPPORT_KEYWORDS = ["주거", "주택", "집", "내집", "아파트", "전세", "월세", "청약"] as const;

function hasHousingSupportKeyword(value: string | undefined): boolean {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return HOUSING_SUPPORT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function resolveHousingSupportContext(vm: ReportVM): "goal" | "action" | null {
  if (vm.goalsTable.some((goal) => hasHousingSupportKeyword(goal.name))) {
    return "goal";
  }
  if (vm.actionRows.some((action) => hasHousingSupportKeyword(`${action.title} ${action.summary}`))) {
    return "action";
  }
  return null;
}

function actionSummaryTone(input: {
  worstCashKrw?: number;
  criticalWarnings?: number;
  dsrPct?: number;
  totalWarnings?: number;
}) {
  const worstCash = input.worstCashKrw ?? 0;
  const criticalWarnings = input.criticalWarnings ?? 0;
  const dsrPct = input.dsrPct ?? 0;
  const totalWarnings = input.totalWarnings ?? 0;

  if (worstCash <= 0 || criticalWarnings > 0 || dsrPct >= 60) {
    return {
      label: "위험 우선",
      variant: "destructive" as const,
      reason: "현금 부족, 치명 경고, 높은 DSR 중 하나 이상이 보여 바로 조정이 필요한 상태입니다.",
    };
  }
  if (dsrPct >= 40 || totalWarnings >= 8) {
    return {
      label: "주의 구간",
      variant: "warning" as const,
      reason: "일부 지표가 경고 구간이라 다음 액션과 월 운영안을 먼저 확인해야 합니다.",
    };
  }
  return {
    label: "양호",
    variant: "success" as const,
    reason: "큰 위험 신호는 적지만, 다음 액션과 기준 가정을 확인하면서 유지하는 편이 안전합니다.",
  };
}

function CoreMetricEvidenceDock({ item }: { item?: EvidenceItem }) {
  const evidenceItem = item ?? null;
  const itemId = evidenceItem?.id ?? "none";
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number; width: number }>({
    left: 12,
    top: 12,
    width: 760,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const recalculatePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(920, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const top = Math.max(12, rect.bottom + 10);
    setPanelPosition({ left, top, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    recalculatePosition();
    const handleRelayout = () => recalculatePosition();
    window.addEventListener("resize", handleRelayout);
    window.addEventListener("scroll", handleRelayout, true);
    return () => {
      window.removeEventListener("resize", handleRelayout);
      window.removeEventListener("scroll", handleRelayout, true);
    };
  }, [open, recalculatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  if (!evidenceItem) return null;

  return (
    <div className="mt-3">
      <button
        data-testid={`core-metric-evidence-toggle-${itemId}`}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all hover:border-emerald-200 hover:text-emerald-600 shadow-sm"
      >
        <span>근거 {open ? "닫기" : "보기"}</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
          <div className="pointer-events-none fixed inset-0 z-[120]">
            <div
              data-testid={`core-metric-evidence-panel-${itemId}`}
              ref={panelRef}
              style={{
                left: `${panelPosition.left}px`,
                top: `${panelPosition.top}px`,
                width: `${panelPosition.width}px`,
              }}
              className="pointer-events-auto absolute rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">계산 공식</p>
                  <p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{evidenceItem.formula}</p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">입력값</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {evidenceItem.inputs.map((input, index) => (
                      <li className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2" key={`${itemId}:input:${index}`}>
                        <p className="text-[10px] font-bold text-slate-400">{input.label}</p>
                        <p className="mt-0.5 text-xs font-black text-slate-900 tabular-nums">{formatEvidenceInput(input.value)}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">가정</p>
                    {evidenceItem.assumptions.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs font-bold text-slate-600">
                        {evidenceItem.assumptions.map((assumption, index) => (
                          <li key={`${itemId}:assumption:${index}`}>{assumption}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs font-bold text-slate-300 italic">가정 정보 없음</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">참고 메모</p>
                    {evidenceItem.notes && evidenceItem.notes.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs font-bold text-slate-600">
                        {evidenceItem.notes.map((note, index) => (
                          <li key={`${itemId}:note:${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs font-bold text-slate-300 italic">추가 참고 없음</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

export default function ReportDashboard({ vm }: Props) {
  const topWarnings = vm.warningAgg.slice(0, 10);
  const extraWarnings = vm.warningAgg.slice(10);
  const simulateReady = isStageSuccess(vm, "simulate");
  const actionsReady = isStageSuccess(vm, "actions");
  const monteReady = isStageSuccess(vm, "monteCarlo");
  const debtReady = isStageSuccess(vm, "debt");
  const appliedOverrides = vm.reproducibility?.appliedOverrides ?? [];
  const normalization = vm.normalization;
  const hasNormalization = (normalization?.defaultsApplied.length ?? 0) > 0
    || (normalization?.fixesApplied.length ?? 0) > 0;
  const evidenceById = new Map((vm.evidence?.items ?? []).map((item) => [item.id, item]));
  const monthlyOperatingGuide = vm.monthlyOperatingGuide;
  const leadAction = vm.actionRows[0] ?? null;
  const summaryTone = actionSummaryTone({
    worstCashKrw: vm.summaryCards.worstCashKrw,
    criticalWarnings: vm.summaryCards.criticalWarnings,
    dsrPct: vm.summaryCards.dsrPct,
    totalWarnings: vm.summaryCards.totalWarnings,
  });
  const basisPreview = compactText(
    monthlyOperatingGuide?.basisLabel || vm.assumptionsLines[0],
    120,
  ) || "저장된 실행 결과와 기본 가정 기준으로 계산했습니다.";
  const assumptionPreview = compactText(vm.assumptionsLines[0], 120);
  const renderOverrideReason = (reason?: string) => reason?.trim() || "입력값 기준으로 조정";
  const planningStage = resolvePlanningStage(vm);
  const emergencyRecommendHref = planningStage
    ? buildActionRecommendHref({
      baseHref: PLANNER_ACTION_LINKS.emergencyRecommend.href,
      runId: vm.header.runId,
      stage: planningStage,
      overallStatus: vm.stage.overallStatus,
      actionCode: "BUILD_EMERGENCY_FUND",
    })
    : null;
  const goalRecommendHref = planningStage
    ? buildActionRecommendHref({
      baseHref: PLANNER_ACTION_LINKS.savingRecommend.href,
      runId: vm.header.runId,
      stage: planningStage,
      overallStatus: vm.stage.overallStatus,
      actionCode: "COVER_LUMP_SUM_GOAL",
    })
    : null;
  const housingSupportContext = resolveHousingSupportContext(vm);
  const housingSupportTitle = housingSupportContext === "goal"
    ? "주거 관련 목표가 있다면 청약 일정부터 다시 확인해 보세요."
    : "현재 실행 제안에 주거 관련 확인 항목이 있어 청약 공고를 먼저 좁혀 볼 수 있습니다.";
  const housingSupportSummary = housingSupportContext === "goal"
    ? "플래닝에서는 다음에 볼 주거 정보를 먼저 좁혀 줍니다. 세부 조건과 실제 계약 판단은 주거 화면에서 다시 확인하세요."
    : "여기서는 다음에 볼 주거 정보를 빠르게 좁혀 줍니다. 세부 조건과 실제 계약 판단은 주거 화면에서 다시 확인하세요.";

  return (
    <div className="space-y-8" data-testid="report-dashboard">
      {simulateReady ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-summary-cards">
          <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
            <div className="max-w-3xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">우선 액션</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 leading-tight">
                {leadAction ? leadAction.title : "이번 달 먼저 볼 액션부터 정리했습니다."}
              </h2>
              <p className="mt-3 text-sm font-bold text-slate-500 leading-relaxed">
                {leadAction?.summary || summaryTone.reason}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={summaryTone.variant} className="rounded-full px-4 py-1 font-black shadow-sm">
                {summaryTone.label}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-4 py-1 font-black border-slate-200 bg-white text-slate-500 shadow-sm">
                {vm.snapshot.asOf ? `${vm.snapshot.asOf} 기준` : "저장된 실행 기준"}
              </Badge>
            </div>
          </div>

          <ReportHeroStatGrid className="mt-8">
            <ReportHeroStatCard
              description="실수령에서 지출과 상환을 뺀 현재 여력"
              label="매달 남는 돈"
              value={formatMoney(vm.summaryCards.monthlySurplusKrw)}
            >
              <CoreMetricEvidenceDock item={evidenceById.get("monthlySurplus")} />
            </ReportHeroStatCard>
            <ReportHeroStatCard
              description="현재 현금 기준 버틸 수 있는 개월 수"
              label="비상금 버팀력"
              value={formatMetricMonths(vm.summaryCards.emergencyFundMonths)}
            >
              <CoreMetricEvidenceDock item={evidenceById.get("emergency")} />
            </ReportHeroStatCard>
            <ReportHeroStatCard
              description="소득 대비 월 상환 부담 비중"
              label="대출 상환 비중"
              value={typeof vm.summaryCards.dsrPct === "number" ? formatPct("ko-KR", vm.summaryCards.dsrPct) : "-"}
            >
              <CoreMetricEvidenceDock item={evidenceById.get("dsrPct")} />
            </ReportHeroStatCard>
            <ReportHeroStatCard
              description={`치명 경고 ${vm.summaryCards.criticalWarnings ?? 0}건`}
              label="목표 진행"
              value={vm.summaryCards.goalsAchieved ?? "-"}
            />
          </ReportHeroStatGrid>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 shadow-inner">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">왜 이 액션을 먼저 보나요</p>
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-700">
                {leadAction
                  ? `${leadAction.summary}${leadAction.steps[0] ? ` 첫 단계는 ${leadAction.steps[0]}입니다.` : ""}`
                  : summaryTone.reason}
              </p>
              {leadAction?.cautions[0] ? (
                <div className="mt-4 flex gap-2 items-start rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 border border-amber-100">
                  <span className="shrink-0">※</span>
                  <span>{leadAction.cautions[0]}</span>
                </div>
              ) : null}
            </div>
            <div className="rounded-[2rem] border border-slate-100 bg-slate-50 p-6 shadow-inner">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">계산 기준</p>
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-700">{basisPreview}</p>
              {assumptionPreview ? (
                <p className="mt-3 text-xs font-bold text-slate-400 italic">가정 예시: {assumptionPreview}</p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="rounded-[2rem] border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-400 italic">핵심 숫자 섹션은 시뮬레이션 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "simulate", "simulate 단계 미완료")})</p>
        </Card>
      )}

      {simulateReady && monthlyOperatingGuide ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-monthly-operating-guide">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">월급 운영 요약</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">월급 운영 가이드</h2>
            <p className="mt-3 text-base font-black leading-snug text-slate-700">{monthlyOperatingGuide.headline}</p>
            <p className="mt-2 text-xs font-bold text-slate-400 italic">※ {monthlyOperatingGuide.basisLabel}</p>
          </div>

          <div className="space-y-10">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">현재 월수입 배분</p>
              <div className="grid gap-4 md:grid-cols-3">
                {monthlyOperatingGuide.currentSplit.map((item) => (
                  <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`current-${item.title}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                    <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{formatMoney(item.amountKrw)}</p>
                    <p className="mt-1 text-[11px] font-bold opacity-70">월 수입의 {formatPct("ko-KR", item.sharePct)}</p>
                    <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 ml-1">{monthlyOperatingGuide.nextPlanTitle}</p>
              <div className="grid gap-4 md:grid-cols-3">
                {monthlyOperatingGuide.nextPlan.map((item) => (
                  <article className={cn("rounded-[1.5rem] border p-5", guideToneClass(item.tone))} key={`plan-${item.title}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{item.title}</p>
                    {typeof item.amountKrw === "number" ? (
                      <p className="mt-2 text-lg font-black tracking-tight tabular-nums">{formatMoney(item.amountKrw)}</p>
                    ) : null}
                    {typeof item.sharePct === "number" ? (
                      <p className="mt-1 text-[11px] font-bold opacity-70">
                        {monthlyOperatingGuide.nextPlanTitle === "남는 돈 운영안" ? `가용 재원의 ${formatPct("ko-KR", item.sharePct)}` : `권장 비중 ${formatPct("ko-KR", item.sharePct)}`}
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs font-medium leading-relaxed opacity-90">{item.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="rounded-[2rem] border-slate-100 bg-white p-6 shadow-sm" data-testid="assumptions-overrides-panel">
          <details className="group/disclosure">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open/disclosure:text-slate-600 list-none flex items-center gap-2">
              <span className="transition-transform group-open/disclosure:rotate-90">▶</span>
              적용된 가정 오버라이드 ({appliedOverrides.length})
            </summary>
            {appliedOverrides.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-slate-50 pt-4">
                {appliedOverrides.map((override) => (
                  <li className="text-[11px] font-bold text-slate-600 flex flex-wrap gap-2" key={`${override.key}:${override.updatedAt}`}>
                    <span className="text-emerald-600 font-black">조정 항목</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-900">{renderOverrideReason(override.reason)}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-900">{override.value}</span>
                    <span className="ml-auto text-[10px] text-slate-300 tabular-nums">{override.updatedAt}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-xs font-bold text-slate-300 italic text-center">적용된 오버라이드가 없습니다.</p>
            )}
          </details>
        </Card>

        {hasNormalization ? (
          <Card className="rounded-[2rem] border-slate-100 bg-white p-6 shadow-sm" data-testid="report-normalization-disclosure">
            <details className="group/disclosure">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 group-open/disclosure:text-slate-600 list-none flex items-center gap-2">
                <span className="transition-transform group-open/disclosure:rotate-90">▶</span>
                자동 보정/기본값 적용 내역
              </summary>
              <div className="mt-4 space-y-4 border-t border-slate-50 pt-4">
                {normalization?.defaultsApplied.length ? (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">기본값 자동 적용</p>
                    <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-slate-600">
                      {normalization.defaultsApplied.map((item) => (
                        <li key={`default-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {normalization?.fixesApplied.length ? (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">자동 보정</p>
                    <ul className="list-disc space-y-1 pl-4 text-[11px] font-bold text-slate-600">
                      {normalization.fixesApplied.map((fix, index) => (
                        <li key={`${fix.path}-${index}`}>
                          <span className="text-emerald-600">{fix.path}</span>: {fix.message}
                          {fix.from !== undefined || fix.to !== undefined
                            ? <span className="ml-1 text-slate-400">({renderEvidenceValue(fix.from)} → {renderEvidenceValue(fix.to)})</span>
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          </Card>
        ) : null}
      </div>

      {simulateReady ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="planning-reports-warnings-section">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">주의 목록</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">주의가 필요한 부분</h2>
            </div>
            <Badge variant="destructive" className="rounded-full px-4 py-1 font-black">
              {topWarnings.length}개 우선 확인
            </Badge>
          </div>
          
          <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
            <table className="min-w-full divide-y divide-slate-100 text-sm" data-testid="report-warnings-table">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">경고 항목</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">심각도</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">발생 이력</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">상세 설명</th>
                  <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">권장 액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {topWarnings.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-slate-400 text-center font-bold" colSpan={5}>검출된 경고가 없습니다.</td>
                  </tr>
                ) : topWarnings.map((warning) => (
                  <tr className="group transition-colors hover:bg-slate-50/50" key={`${warning.code}:${warning.subjectKey ?? "-"}`}>
                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900">{warning.title}</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{warning.code}{warning.subjectLabel ? ` · ${warning.subjectLabel}` : ""}</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={warning.severityMax === "critical" ? "destructive" : "warning"} className="h-5 px-1.5 text-[9px] font-black border-none">
                        {severityText(warning.severityMax)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-xs font-bold text-slate-500 tabular-nums">{warning.count}회 · {warning.periodMinMax}</td>
                    <td className="px-4 py-4 text-xs font-medium text-slate-600 leading-relaxed">{warning.plainDescription}</td>
                    <td className="px-4 py-4">
                      {warning.suggestedActionId ? (
                        <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest underline underline-offset-4 decoration-emerald-200">{warning.suggestedActionId}</span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extraWarnings.length > 0 ? (
            <details className="group/extra mt-4 rounded-[1.5rem] border border-slate-100 bg-slate-50/50 px-5 py-4 transition-all">
              <summary className="cursor-pointer text-xs font-black text-slate-400 group-open/extra:text-slate-600 list-none flex items-center gap-2">
                <span className="transition-transform group-open/extra:rotate-90">▶</span>
                추가 {extraWarnings.length}개 경고 더 보기
              </summary>
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {extraWarnings.map((warning) => (
                  <li className="text-[11px] font-bold text-slate-600 flex items-center gap-3" key={`${warning.code}:${warning.subjectKey ?? "-"}:extra`}>
                    <Badge variant={warning.severityMax === "critical" ? "destructive" : "warning"} className="h-4 px-1 text-[8px] font-black border-none shrink-0">
                      {severityText(warning.severityMax)}
                    </Badge>
                    <span className="font-black text-slate-900">{warning.title}</span>
                    <span className="text-slate-300 tabular-nums">({warning.count}회)</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {simulateReady ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-goals-table">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">목표</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">목표 진행 현황</h2>
            </div>
            <Badge variant="secondary" className="rounded-full px-4 py-1 font-black bg-emerald-50 text-emerald-700 border-none">
              총 {vm.goalsTable.length}개 목표
            </Badge>
          </div>
          
          {vm.goalsTable.length === 0 ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">목표 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-inner">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-slate-400">
                  <tr>
                    <th className="px-4 py-4 text-left font-black uppercase tracking-widest text-[10px]">목표명</th>
                    <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">목표액</th>
                    <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">현재 자산</th>
                    <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">부족액</th>
                    <th className="px-4 py-4 text-right font-black uppercase tracking-widest text-[10px]">기한</th>
                    <th className="px-4 py-4 text-center font-black uppercase tracking-widest text-[10px]">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {vm.goalsTable.map((goal, index) => (
                    <tr className="group transition-colors hover:bg-slate-50/50" key={`${goal.name}-${index}`}>
                      <td className="px-4 py-4 font-black text-slate-900">{goal.name}</td>
                      <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{formatMoney(goal.targetAmount)}</td>
                      <td className="px-4 py-4 text-right font-bold tabular-nums text-slate-700">{formatMoney(goal.currentAmount)}</td>
                      <td className={cn("px-4 py-4 text-right font-black tabular-nums", goal.shortfall > 0 ? "text-rose-600" : "text-emerald-600")}>
                        {goal.shortfall > 0 ? formatMoney(goal.shortfall) : "충족"}
                      </td>
                      <td className="px-4 py-4 text-right font-black tabular-nums text-slate-400">{goal.targetMonth > 0 ? `M${goal.targetMonth}` : "-"}</td>
                      <td className="px-4 py-4 text-center">
                        <Badge variant={goal.achieved ? "success" : "secondary"} className="rounded-lg px-2 py-0.5 text-[10px] font-black border-none uppercase">
                          {goal.achieved ? "달성" : "진행 중"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {actionsReady ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10" data-testid="report-top-actions">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">실행 순서</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">추천 실행 순서</h2>
            </div>
            <Badge variant="warning" className="rounded-full px-4 py-1 font-black shadow-sm">
              우선순위 {vm.topActions.length}개
            </Badge>
          </div>

          {housingSupportContext ? (
            <div className="mb-8 rounded-[1.75rem] border border-sky-100 bg-sky-50/70 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">주거 판단 보조</p>
              <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-sm font-black leading-relaxed text-slate-900">{housingSupportTitle}</p>
                  <p className="mt-2 text-xs font-bold leading-relaxed text-slate-600">{housingSupportSummary}</p>
                </div>
                <Link
                  className="inline-flex items-center rounded-xl bg-sky-600 px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-sky-900/10 transition hover:bg-sky-700 active:scale-95"
                  href={PLANNER_ACTION_LINKS.subscriptionHousing.href}
                >
                  청약 공고 다시 보기
                </Link>
              </div>
            </div>
          ) : null}
          
          {vm.topActions.length === 0 ? (
            <div className="py-12 rounded-[2rem] border border-dashed border-slate-100 text-center">
              <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">권장 액션이 없습니다.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {vm.topActions.map((action) => {
                const actionCtaLink = action.code === "BUILD_EMERGENCY_FUND" && emergencyRecommendHref
                  ? { href: emergencyRecommendHref, label: PLANNER_ACTION_LINKS.emergencyRecommend.label }
                  : action.code === "COVER_LUMP_SUM_GOAL" && goalRecommendHref
                    ? { href: goalRecommendHref, label: PLANNER_ACTION_LINKS.savingRecommend.label }
                    : action.code === "REDUCE_DEBT_SERVICE"
                      ? { href: PLANNER_ACTION_LINKS.creditLoanProducts.href, label: PLANNER_ACTION_LINKS.creditLoanProducts.label }
                    : null;

                return (
                  <article className="rounded-[2rem] border border-slate-100 bg-slate-50/50 p-6 shadow-inner transition-all hover:bg-white hover:shadow-md" key={action.code}>
                    <Badge variant={action.severity === "critical" ? "destructive" : "warning"} className="h-5 px-1.5 text-[9px] font-black border-none mb-3">
                      {severityText(action.severity)}
                    </Badge>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight leading-snug">{action.title}</h3>
                    <p className="mt-3 text-xs font-bold leading-relaxed text-slate-500">{action.summary}</p>
                    <div className="mt-6 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">핵심 단계</p>
                      <ul className="space-y-1.5">
                        {action.steps.slice(0, 3).map((step, index) => (
                          <li className="flex gap-2 text-[11px] font-bold text-slate-700" key={`${action.code}-step-${index}`}>
                            <span className="text-emerald-500 shrink-0">•</span>
                            <span className="leading-tight">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {actionCtaLink ? (
                      <div className="mt-6 border-t border-slate-100 pt-4">
                        <Link
                          className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-700 active:scale-95"
                          href={actionCtaLink.href}
                        >
                          {actionCtaLink.label}
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card className="rounded-[2rem] border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-400 italic">실행 제안 섹션은 actions 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "actions", "actions 단계 미완료")})</p>
        </Card>
      )}

      {monteReady && vm.monteCarloSummary ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">확률 시뮬레이션</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">변동성 시뮬레이션</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {vm.monteCarloSummary.keyProbs.map((item) => (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5" key={item.key}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{item.label}</p>
                <p className="text-xl font-black text-slate-900 tabular-nums">{formatPct("ko-KR", item.probability * 100)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {debtReady && vm.debtSummary ? (
        <Card className="rounded-[2.5rem] border-slate-100 bg-white p-8 shadow-sm lg:p-10">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">대출 요약</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">대출 부담 요약</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">월 상환액</p>
              <p className="text-xl font-black text-slate-900 tabular-nums">{formatMoney(vm.debtSummary.meta.totalMonthlyPaymentKrw)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">현재 DSR</p>
              <p className="text-xl font-black text-emerald-600 tabular-nums">{formatPct("ko-KR", vm.debtSummary.meta.debtServiceRatio * 100)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">대환 비교</p>
              <p className="text-xl font-black text-slate-900 tabular-nums">{vm.debtSummary.refinance?.length ?? 0}건 가능</p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
