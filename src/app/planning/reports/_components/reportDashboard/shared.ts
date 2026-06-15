import { formatKrw, formatMonths } from "@/lib/planning/i18n/format";
import { type Stage } from "@/lib/planning/engine";
import { type PlanningRunOverallStatus } from "@/lib/planning/store/types";
import { PLANNER_ACTION_LINKS } from "@/lib/planner/compute";
import { type ReportVM } from "../../_lib/reportViewModel";

export type ReportSummaryTone = {
  label: string;
  variant: "destructive" | "warning" | "success";
  reason: string;
};

export function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatKrw("ko-KR", value);
}

export function formatMetricMonths(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatMonths("ko-KR", value);
}

export function severityText(severity: "info" | "warn" | "critical"): string {
  if (severity === "critical") return "치명";
  if (severity === "warn") return "경고";
  return "정보";
}

export function isStageSuccess(vm: ReportVM, id: keyof ReportVM["stage"]["byId"]): boolean {
  const stage = vm.stage.byId[id];
  if (!stage) return true;
  return stage.status === "SUCCESS";
}

export function stageMessage(vm: ReportVM, id: keyof ReportVM["stage"]["byId"], fallback: string): string {
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

export function renderEvidenceValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "string") return value;
  if (value === null) return "없음";
  return "-";
}

export function guideToneClass(tone: "slate" | "amber" | "rose" | "emerald"): string {
  if (tone === "rose") return "border-rose-100 bg-rose-50/50 text-rose-900 shadow-sm";
  if (tone === "amber") return "border-amber-100 bg-amber-50/50 text-amber-900 shadow-sm";
  if (tone === "emerald") return "border-primary/10 bg-primary/10 text-navy shadow-sm";
  return "border-slate-100 bg-surface-muted/50 text-navy shadow-sm";
}

export function formatEvidenceInput(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("ko-KR");
  }
  return String(value);
}

export function compactText(value: string | undefined, maxLength: number): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function asStage(value: unknown): Stage | undefined {
  return value === "DEFICIT" || value === "DEBT" || value === "EMERGENCY" || value === "INVEST" ? value : undefined;
}

export function resolvePlanningStage(vm: ReportVM): Stage | undefined {
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

export function buildActionRecommendHref(input: {
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

export function resolveHousingSupportContext(vm: ReportVM): "goal" | "action" | null {
  if (vm.goalsTable.some((goal) => hasHousingSupportKeyword(goal.name))) {
    return "goal";
  }
  if (vm.actionRows.some((action) => hasHousingSupportKeyword(`${action.title} ${action.summary}`))) {
    return "action";
  }
  return null;
}

export function actionSummaryTone(input: {
  worstCashKrw?: number;
  criticalWarnings?: number;
  dsrPct?: number;
  totalWarnings?: number;
}): ReportSummaryTone {
  const worstCash = input.worstCashKrw ?? 0;
  const criticalWarnings = input.criticalWarnings ?? 0;
  const dsrPct = input.dsrPct ?? 0;
  const totalWarnings = input.totalWarnings ?? 0;

  if (worstCash <= 0 || criticalWarnings > 0 || dsrPct >= 60) {
    return {
      label: "위험 우선",
      variant: "destructive",
      reason: "현금 부족, 치명 경고, 높은 DSR 중 하나 이상이 보여 바로 조정이 필요한 상태입니다.",
    };
  }
  if (dsrPct >= 40 || totalWarnings >= 8) {
    return {
      label: "주의 구간",
      variant: "warning",
      reason: "일부 지표가 경고 구간이라 다음 액션과 월 운영안을 먼저 확인해야 합니다.",
    };
  }
  return {
    label: "양호",
    variant: "success",
    reason: "큰 위험 신호는 적지만, 다음 액션과 기준 가정을 확인하면서 유지하는 편이 안전합니다.",
  };
}

export { PLANNER_ACTION_LINKS };
