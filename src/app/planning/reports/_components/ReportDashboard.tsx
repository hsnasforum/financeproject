import { Card } from "@/components/ui/Card";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  reportHeroMetaChipClassName,
  ReportHeroStatCard,
  ReportHeroStatGrid,
  reportSurfaceDisclosureClassName,
  reportSurfaceDisclosureSummaryClassName,
  reportSurfaceDetailClassName,
  reportSurfacePopoverPanelClassName,
  reportSurfacePopoverTriggerClassName,
} from "@/components/ui/ReportTone";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { type EvidenceItem } from "@/lib/planning/v2/insights/evidence";
import { type ReportVM } from "../_lib/reportViewModel";

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
    return stage.errorSummary || `단계가 생략되었습니다(${stage.reason ?? "UNKNOWN"}).`;
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
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  return "-";
}

function guideToneClass(tone: "slate" | "amber" | "rose" | "emerald"): string {
  if (tone === "rose") return "border-rose-300/40 bg-rose-900/30";
  if (tone === "amber") return "border-amber-300/40 bg-amber-900/30";
  if (tone === "emerald") return "border-emerald-300/40 bg-emerald-900/30";
  return "border-white/10 bg-white/10";
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
      reason: "현금 부족, 치명 경고, 높은 DSR 중 하나 이상이 보여 바로 조정이 필요한 상태입니다.",
    };
  }
  if (dsrPct >= 40 || totalWarnings >= 8) {
    return {
      label: "주의 구간",
      reason: "일부 지표가 경고 구간이라 다음 액션과 월 운영안을 먼저 확인해야 합니다.",
    };
  }
  return {
    label: "양호",
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
        className={reportSurfacePopoverTriggerClassName}
        data-testid={`core-metric-evidence-toggle-${itemId}`}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        <span>근거 보기</span>
        <span className="text-white/55">{open ? "닫기" : "열기"}</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
          <div className="pointer-events-none fixed inset-0 z-[120]">
            <div
              className={reportSurfacePopoverPanelClassName}
              data-testid={`core-metric-evidence-panel-${itemId}`}
              ref={panelRef}
              style={{
                left: `${panelPosition.left}px`,
                top: `${panelPosition.top}px`,
                width: `${panelPosition.width}px`,
              }}
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/80">Formula</p>
                  <p className="mt-1 text-[11px] leading-5 text-cyan-50">{evidenceItem.formula}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Inputs</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {evidenceItem.inputs.map((input, index) => (
                      <li className={`${reportSurfaceDetailClassName} px-3 py-2`} key={`${itemId}:input:${index}`}>
                        <p className="text-white/60">{input.label}</p>
                        <p className="mt-1 font-semibold text-white">{formatEvidenceInput(input.value)}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <div className={`${reportSurfaceDetailClassName} px-3 py-2`}>
                    <p className="font-semibold text-white/75">Assumptions</p>
                    {evidenceItem.assumptions.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-white/75">
                        {evidenceItem.assumptions.map((assumption, index) => (
                          <li key={`${itemId}:assumption:${index}`}>{assumption}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-white/60">가정 정보 없음</p>
                    )}
                  </div>
                  <div className={`${reportSurfaceDetailClassName} px-3 py-2`}>
                    <p className="font-semibold text-white/75">Notes</p>
                    {evidenceItem.notes && evidenceItem.notes.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-white/75">
                        {evidenceItem.notes.map((note, index) => (
                          <li key={`${itemId}:note:${index}`}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-white/60">추가 참고 없음</p>
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
  const monteStageKnown = Boolean(vm.stage.byId.monteCarlo);
  const debtStageKnown = Boolean(vm.stage.byId.debt);
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

  return (
    <div className="space-y-5" data-testid="report-dashboard">
      {simulateReady ? (
        <Card className="relative overflow-visible border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white" data-testid="report-summary-cards">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Action First</p>
              <h2 className="mt-2 text-xl font-black tracking-tight">
                {leadAction ? leadAction.title : "이번 달 먼저 볼 액션부터 정리했습니다."}
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {leadAction?.summary || summaryTone.reason}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className={`${reportHeroMetaChipClassName} text-[11px]`}>
                {summaryTone.label}
              </div>
              <div className={`${reportHeroMetaChipClassName} text-[11px]`}>
                {vm.snapshot.asOf ? `${vm.snapshot.asOf} 기준` : "저장 run 기준"}
              </div>
              <div className={`${reportHeroMetaChipClassName} text-[11px]`}>
                가정 {vm.assumptionsLines.length}개
              </div>
              <div className={`${reportHeroMetaChipClassName} text-[11px]`}>
                수정 가능
              </div>
            </div>
          </div>
          <ReportHeroStatGrid className="mt-4">
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

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">왜 이 액션인가</p>
              <p className="mt-2 text-sm leading-6 text-white/80">
                {leadAction
                  ? `${leadAction.summary}${leadAction.steps[0] ? ` 첫 단계는 ${leadAction.steps[0]}` : ""}`
                  : summaryTone.reason}
              </p>
              {leadAction?.cautions[0] ? (
                <p className="mt-2 text-xs text-white/60">주의: {leadAction.cautions[0]}</p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">계산 기준과 가정</p>
              <p className="mt-2 text-sm leading-6 text-white/80">{basisPreview}</p>
              {assumptionPreview ? (
                <p className="mt-2 text-xs text-white/60">가정 예시: {assumptionPreview}</p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-sm text-white/80">
          핵심 숫자 섹션은 시뮬레이션 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "simulate", "simulate 단계 미완료")})
        </Card>
      )}

      {simulateReady && monthlyOperatingGuide ? (
        <Card className="space-y-4 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-xl" data-testid="report-monthly-operating-guide">
          <div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Salary Operating Guide</p>
              <h2 className="mt-2 text-xl font-black tracking-tight">월급 운영 가이드</h2>
              <p className="mt-2 text-sm text-white/75">{monthlyOperatingGuide.headline}</p>
              <p className="mt-2 text-xs text-white/55">{monthlyOperatingGuide.basisLabel}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">현재 배분</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {monthlyOperatingGuide.currentSplit.map((item) => (
                <article className={`rounded-2xl border p-4 shadow-sm ${guideToneClass(item.tone)}`} key={`current-${item.title}`}>
                  <p className="text-[11px] font-semibold text-white/60">{item.title}</p>
                  <p className="mt-1 text-lg font-black tracking-tight text-white">{formatMoney(item.amountKrw)}</p>
                  <p className="mt-1 text-xs text-white/70">월 수입의 {formatPct("ko-KR", item.sharePct)}</p>
                  <p className="mt-2 text-xs leading-5 text-white/82">{item.description}</p>
                </article>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{monthlyOperatingGuide.nextPlanTitle}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {monthlyOperatingGuide.nextPlan.map((item) => (
                <article className={`rounded-2xl border p-4 shadow-sm ${guideToneClass(item.tone)}`} key={`plan-${item.title}`}>
                  <p className="text-[11px] font-semibold text-white/60">{item.title}</p>
                  {typeof item.amountKrw === "number" ? (
                    <p className="mt-1 text-lg font-black tracking-tight text-white">{formatMoney(item.amountKrw)}</p>
                  ) : null}
                  {typeof item.sharePct === "number" ? (
                    <p className="mt-1 text-xs text-white/70">
                      {monthlyOperatingGuide.nextPlanTitle === "남는 돈 운영안" ? `남는 돈의 ${formatPct("ko-KR", item.sharePct)}` : `기준 비중 ${formatPct("ko-KR", item.sharePct)}`}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs leading-5 text-white/82">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-2 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-xl" data-testid="assumptions-overrides-panel">
        <details className={reportSurfaceDisclosureClassName}>
          <summary className={reportSurfaceDisclosureSummaryClassName}>
            적용된 가정 오버라이드 ({appliedOverrides.length})
          </summary>
          {appliedOverrides.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-white/80">
              {appliedOverrides.map((override) => (
                <li data-testid="assumptions-overrides-item" key={`${override.key}:${override.updatedAt}`}>
                  <span className="font-semibold">{override.key}</span>
                  {" = "}
                  {override.value}
                  {override.reason ? ` · ${override.reason}` : ""}
                  {" · "}
                  {override.updatedAt}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-white/60">적용된 오버라이드가 없습니다.</p>
          )}
        </details>
      </Card>

      {hasNormalization ? (
        <Card className="space-y-2 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5 text-white shadow-xl" data-testid="report-normalization-disclosure">
          <details className={reportSurfaceDisclosureClassName}>
            <summary className={reportSurfaceDisclosureSummaryClassName}>
              자동 보정/기본값 적용 내역
            </summary>
            {normalization?.defaultsApplied.length ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-white/80">defaultsApplied</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-white/80">
                  {normalization.defaultsApplied.map((item) => (
                    <li key={`default-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {normalization?.fixesApplied.length ? (
              <div className="mt-2">
                <p className="text-xs font-semibold text-white/80">fixesApplied</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-white/80">
                  {normalization.fixesApplied.map((fix, index) => (
                    <li key={`${fix.path}-${index}`}>
                      {fix.path}: {fix.message}
                      {fix.from !== undefined || fix.to !== undefined
                        ? ` (${renderEvidenceValue(fix.from)} -> ${renderEvidenceValue(fix.to)})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        </Card>
      ) : null}

      {simulateReady ? (
        <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950 p-5 text-white shadow-xl" data-testid="planning-reports-warnings-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Watchlist</p>
              <h2 className="mt-1 text-base font-bold text-white">주의가 필요한 부분</h2>
            </div>
            <span className="rounded-full border border-rose-300/40 bg-rose-900/30 px-3 py-1 text-[11px] font-semibold text-rose-100">
              {topWarnings.length}개 우선 확인
            </span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-sm">
            <table className="min-w-full divide-y divide-white/10 text-sm text-white" data-testid="report-warnings-table">
              <thead className="bg-white/10">
                <tr>
                  <th className="px-3 py-2 text-left">경고</th>
                  <th className="px-3 py-2 text-left">심각도</th>
                  <th className="px-3 py-2 text-left">발생</th>
                  <th className="px-3 py-2 text-left">설명</th>
                  <th className="px-3 py-2 text-left">권장 액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {topWarnings.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-white/70" colSpan={5}>
                      경고가 없습니다.
                    </td>
                  </tr>
                ) : topWarnings.map((warning) => (
                  <tr key={`${warning.code}:${warning.subjectKey ?? "-"}`}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-white">{warning.title}</p>
                      <p className="text-[11px] text-white/60">{warning.code}{warning.subjectLabel ? ` · ${warning.subjectLabel}` : ""}</p>
                    </td>
                    <td className="px-3 py-2">{severityText(warning.severityMax)}</td>
                    <td className="px-3 py-2">{warning.count}회 · {warning.periodMinMax}</td>
                    <td className="px-3 py-2 text-white/82">{warning.plainDescription}</td>
                    <td className="px-3 py-2 text-[12px] text-white/70">{warning.suggestedActionId ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extraWarnings.length > 0 ? (
            <details className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/82 shadow-sm">
              <summary className="cursor-pointer font-semibold">+ {extraWarnings.length}개 더 보기</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {extraWarnings.map((warning) => (
                  <li key={`${warning.code}:${warning.subjectKey ?? "-"}:extra`}>
                    [{severityText(warning.severityMax)}] {warning.title} ({warning.count}회)
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {simulateReady ? (
        <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl" data-testid="report-goals-table">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Goals</p>
              <h2 className="mt-1 text-base font-bold text-white">목표 진행 현황</h2>
            </div>
            <span className="rounded-full border border-emerald-300/40 bg-emerald-900/30 px-3 py-1 text-[11px] font-semibold text-emerald-100">
              총 {vm.goalsTable.length}개
            </span>
          </div>
          {vm.goalsTable.length === 0 ? (
            <p className="text-sm text-white/72">목표 데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-sm">
              <table className="min-w-full divide-y divide-white/10 text-sm text-white">
                <thead className="bg-white/10">
                  <tr>
                    <th className="px-3 py-2 text-left">목표명</th>
                    <th className="px-3 py-2 text-right">목표액</th>
                    <th className="px-3 py-2 text-right">현재</th>
                    <th className="px-3 py-2 text-right">부족액</th>
                    <th className="px-3 py-2 text-right">기한</th>
                    <th className="px-3 py-2 text-left">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {vm.goalsTable.map((goal, index) => (
                    <tr key={`${goal.name}-${index}`}>
                      <td className="px-3 py-2 font-semibold text-white">{goal.name}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.targetAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.currentAmount)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(goal.shortfall)}</td>
                      <td className="px-3 py-2 text-right">{goal.targetMonth > 0 ? `M${goal.targetMonth}` : "-"}</td>
                      <td className="px-3 py-2">{goal.achieved ? "달성" : "진행 중"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {actionsReady ? (
        <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-5 text-white shadow-xl" data-testid="report-top-actions">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Action Plan</p>
              <h2 className="mt-1 text-base font-bold text-white">추천 실행 순서</h2>
            </div>
            <span className="rounded-full border border-amber-300/40 bg-amber-900/30 px-3 py-1 text-[11px] font-semibold text-amber-100">
              우선순위 {vm.topActions.length}개
            </span>
          </div>
          {vm.topActions.length === 0 ? (
            <p className="text-sm text-white/72">권장 액션이 없습니다.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {vm.topActions.map((action) => (
                <article className="rounded-3xl border border-white/10 bg-white/10 p-4 shadow-sm backdrop-blur" key={action.code}>
                  <p className="text-xs font-semibold text-white/60">{severityText(action.severity)}</p>
                  <h3 className="mt-1 text-base font-black tracking-tight text-white">{action.title}</h3>
                  <p className="mt-2 text-xs text-white/82">{action.summary}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-white/82">
                    {action.steps.slice(0, 3).map((step, index) => (
                      <li key={`${action.code}-step-${index}`}>{step}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card className="border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-sm text-white/80">
          실행 제안 섹션은 actions 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "actions", "actions 단계 미완료")})
        </Card>
      )}

      {monteReady && vm.monteCarloSummary ? (
        <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-5 text-white shadow-xl">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Monte Carlo</p>
            <h2 className="mt-1 text-base font-bold text-white">변동성 시뮬레이션</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {vm.monteCarloSummary.keyProbs.map((item) => (
              <p className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/82" key={item.key}>
                {item.label}: <span className="font-semibold text-white">{formatPct("ko-KR", item.probability * 100)}</span>
              </p>
            ))}
          </div>
        </Card>
      ) : monteStageKnown && !monteReady ? (
        <Card className="border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-sm text-white/80">
          변동성 시뮬레이션은 Monte Carlo 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "monteCarlo", "데이터 없음")})
        </Card>
      ) : null}

      {debtReady && vm.debtSummary ? (
        <Card className="space-y-3 border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-xl">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">Debt Summary</p>
            <h2 className="mt-1 text-base font-bold text-white">대출 부담 요약</h2>
          </div>
          <p className="text-sm text-white/82">월 상환액: <span className="font-semibold text-white">{formatMoney(vm.debtSummary.meta.totalMonthlyPaymentKrw)}</span></p>
          <p className="text-sm text-white/82">DSR: <span className="font-semibold text-white">{formatPct("ko-KR", vm.debtSummary.meta.debtServiceRatio * 100)}</span></p>
          <p className="text-sm text-white/82">대환 비교: <span className="font-semibold text-white">{vm.debtSummary.refinance?.length ?? 0}건</span></p>
        </Card>
      ) : debtStageKnown && !debtReady ? (
        <Card className="border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-sm text-white/80">
          대출 부담 요약은 debt 단계가 완료되어야 표시됩니다. ({stageMessage(vm, "debt", "데이터 없음")})
        </Card>
      ) : null}
    </div>
  );
}
