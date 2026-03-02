import { REASON_CODES } from "./types";
import { WARNING_SEVERITY_BY_CODE, type WarningSeverity } from "./report/warningsAggregate";

const REASON_CODE_SET = new Set<string>(REASON_CODES);
const WARNING_SEVERITY_ORDER: Record<WarningSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

export const CONTRIBUTION_SKIPPED_WARN_THRESHOLD = 3;

export type WarningLike = {
  reasonCode?: unknown;
  message?: unknown;
  month?: unknown;
  meta?: unknown;
  data?: unknown;
};

export type AggregatedWarningRow = {
  code: string;
  severity: WarningSeverity;
  count: number;
  firstMonth?: number;
  lastMonth?: number;
  sampleMessage: string;
};

export type GoalStatusLike = {
  goalId?: unknown;
  name?: unknown;
  achieved?: unknown;
  targetMonth?: unknown;
  progressPct?: unknown;
  shortfall?: unknown;
  targetAmount?: unknown;
  currentAmount?: unknown;
};

export type GoalStatusRow = {
  goalId: string;
  name: string;
  achieved: boolean;
  targetMonth: number;
  progressPct: number;
  shortfallKrw: number;
  interpretation: string;
};

export type TimelineRowLike = {
  month?: unknown;
  liquidAssets?: unknown;
  netWorth?: unknown;
  totalDebt?: unknown;
  debtServiceRatio?: unknown;
};

export type TimelinePointRow = {
  label: "시작" | "중간" | "마지막";
  monthIndex: number;
  month: number;
  liquidAssetsKrw: number;
  netWorthKrw: number;
  totalDebtKrw: number;
  debtServiceRatio: number;
  interpretation: string;
};

export type ResultBadgeStatus = "ok" | "warn" | "risk";

export type ResultBadgeSummary = {
  status: ResultBadgeStatus;
  reason: string;
  minCashKrw: number;
  maxDsr: number;
  missedGoals: number;
  contributionSkippedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function monthIndexFromWarning(warning: WarningLike): number | undefined {
  const meta = asRecord(warning.meta);
  const data = asRecord(warning.data);

  const metaMonthIndex = asFiniteNumber(meta.monthIndex);
  if (typeof metaMonthIndex === "number" && metaMonthIndex >= 0) return Math.trunc(metaMonthIndex);

  const dataMonthIndex = asFiniteNumber(data.monthIndex);
  if (typeof dataMonthIndex === "number" && dataMonthIndex >= 0) return Math.trunc(dataMonthIndex);

  const metaMonth = asFiniteNumber(meta.month);
  if (typeof metaMonth === "number" && metaMonth >= 1) return Math.trunc(metaMonth - 1);

  const dataMonth = asFiniteNumber(data.month);
  if (typeof dataMonth === "number" && dataMonth >= 1) return Math.trunc(dataMonth - 1);

  const month = asFiniteNumber(warning.month);
  if (typeof month === "number" && month >= 1) return Math.trunc(month - 1);

  return undefined;
}

function severityByCode(code: string): WarningSeverity {
  if (REASON_CODE_SET.has(code)) {
    return WARNING_SEVERITY_BY_CODE[code as keyof typeof WARNING_SEVERITY_BY_CODE];
  }
  return "info";
}

export function aggregateWarnings(warnings: WarningLike[]): AggregatedWarningRow[] {
  const grouped = new Map<string, AggregatedWarningRow>();

  for (const warning of warnings) {
    const code = asString(warning.reasonCode) || "UNKNOWN";
    const message = asString(warning.message) || `${code} 경고가 감지되었습니다.`;
    const severity = severityByCode(code);
    const monthIndex = monthIndexFromWarning(warning);

    const existing = grouped.get(code);
    if (!existing) {
      grouped.set(code, {
        code,
        severity,
        count: 1,
        ...(typeof monthIndex === "number"
          ? { firstMonth: monthIndex + 1, lastMonth: monthIndex + 1 }
          : {}),
        sampleMessage: message,
      });
      continue;
    }

    existing.count += 1;
    if (typeof monthIndex === "number") {
      const month = monthIndex + 1;
      existing.firstMonth = typeof existing.firstMonth === "number"
        ? Math.min(existing.firstMonth, month)
        : month;
      existing.lastMonth = typeof existing.lastMonth === "number"
        ? Math.max(existing.lastMonth, month)
        : month;
    }
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const severityDiff = WARNING_SEVERITY_ORDER[a.severity] - WARNING_SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    if (b.count !== a.count) return b.count - a.count;
    return a.code.localeCompare(b.code);
  });
}

function resolveShortfall(goal: GoalStatusLike): number {
  const shortfall = asFiniteNumber(goal.shortfall);
  if (typeof shortfall === "number") return Math.max(shortfall, 0);

  const targetAmount = asFiniteNumber(goal.targetAmount);
  const currentAmount = asFiniteNumber(goal.currentAmount);
  if (typeof targetAmount === "number" && typeof currentAmount === "number") {
    return Math.max(targetAmount - currentAmount, 0);
  }
  return 0;
}

function resolveGoalInterpretation(achieved: boolean, shortfallKrw: number): string {
  if (achieved) return "기한 내 목표를 달성했습니다.";
  if (shortfallKrw <= 0) return "목표 달성 직전 상태입니다.";
  return "기한 내 달성을 위해 추가 적립 또는 지출 조정이 필요합니다.";
}

export function mapGoalStatus(goalsStatus: GoalStatusLike[]): GoalStatusRow[] {
  return goalsStatus.map((goal, index) => {
    const shortfallKrw = resolveShortfall(goal);
    const achieved = Boolean(goal.achieved);
    const targetMonthRaw = asFiniteNumber(goal.targetMonth);
    return {
      goalId: asString(goal.goalId) || `goal-${index + 1}`,
      name: asString(goal.name) || `목표 ${index + 1}`,
      achieved,
      targetMonth: typeof targetMonthRaw === "number" && targetMonthRaw > 0 ? Math.trunc(targetMonthRaw) : 0,
      progressPct: asFiniteNumber(goal.progressPct) ?? 0,
      shortfallKrw,
      interpretation: resolveGoalInterpretation(achieved, shortfallKrw),
    };
  }).sort((a, b) => {
    const aMonth = a.targetMonth > 0 ? a.targetMonth : Number.POSITIVE_INFINITY;
    const bMonth = b.targetMonth > 0 ? b.targetMonth : Number.POSITIVE_INFINITY;
    if (aMonth !== bMonth) return aMonth - bMonth;
    return a.name.localeCompare(b.name);
  });
}

function timelineInterpretation(cash: number, dsr: number): string {
  if (cash <= 0) return "현금이 0 이하로 내려가 보완 조치가 필요합니다.";
  if (dsr >= 0.6) return "DSR이 높아 상환부담이 큽니다.";
  if (dsr >= 0.4) return "DSR 경고 구간으로 지출/상환 조정이 필요합니다.";
  return "현금흐름과 부채부담이 비교적 안정적입니다.";
}

function parseTimelineRow(row: TimelineRowLike, monthIndex: number): TimelinePointRow {
  const monthRaw = asFiniteNumber(row.month);
  const month = typeof monthRaw === "number" && monthRaw > 0 ? Math.trunc(monthRaw) : monthIndex + 1;
  const liquidAssetsKrw = asFiniteNumber(row.liquidAssets) ?? 0;
  const netWorthKrw = asFiniteNumber(row.netWorth) ?? 0;
  const totalDebtKrw = asFiniteNumber(row.totalDebt) ?? 0;
  const debtServiceRatio = asFiniteNumber(row.debtServiceRatio) ?? 0;

  return {
    label: "중간",
    monthIndex,
    month,
    liquidAssetsKrw,
    netWorthKrw,
    totalDebtKrw,
    debtServiceRatio,
    interpretation: timelineInterpretation(liquidAssetsKrw, debtServiceRatio),
  };
}

export function pickKeyTimelinePoints(timeline: TimelineRowLike[]): TimelinePointRow[] {
  if (timeline.length === 0) return [];
  const candidates = [0, Math.floor((timeline.length - 1) / 2), timeline.length - 1];
  const seen = new Set<number>();
  const rows: TimelinePointRow[] = [];

  for (const monthIndex of candidates) {
    if (monthIndex < 0 || monthIndex >= timeline.length || seen.has(monthIndex)) continue;
    seen.add(monthIndex);
    rows.push(parseTimelineRow(timeline[monthIndex] ?? {}, monthIndex));
  }

  return rows.map((row, index) => ({
    ...row,
    label: index === 0 ? "시작" : index === rows.length - 1 ? "마지막" : "중간",
  }));
}

function summarizeTimeline(timeline: TimelineRowLike[]): { minCashKrw: number; maxDsr: number } {
  if (timeline.length === 0) {
    return {
      minCashKrw: 0,
      maxDsr: 0,
    };
  }

  return timeline.reduce(
    (acc, row) => {
      const cash = asFiniteNumber(row.liquidAssets) ?? 0;
      const dsr = asFiniteNumber(row.debtServiceRatio) ?? 0;
      return {
        minCashKrw: Math.min(acc.minCashKrw, cash),
        maxDsr: Math.max(acc.maxDsr, dsr),
      };
    },
    {
      minCashKrw: Number.POSITIVE_INFINITY,
      maxDsr: 0,
    },
  );
}

export function resolveResultBadge(input: {
  timeline: TimelineRowLike[];
  warnings: AggregatedWarningRow[];
  goals: GoalStatusRow[];
}): ResultBadgeSummary {
  const timelineSummary = summarizeTimeline(input.timeline);
  const minCashKrw = Number.isFinite(timelineSummary.minCashKrw) ? timelineSummary.minCashKrw : 0;
  const maxDsr = timelineSummary.maxDsr;
  const missedGoals = input.goals.filter((goal) => !goal.achieved).length;
  const hasNegativeCashflow = input.warnings.some((warning) => warning.code === "NEGATIVE_CASHFLOW");
  const contributionSkippedCount = input.warnings.find((warning) => warning.code === "CONTRIBUTION_SKIPPED")?.count ?? 0;

  if (minCashKrw <= 0 || hasNegativeCashflow || maxDsr >= 0.6) {
    return {
      status: "risk",
      reason: "현금 부족 또는 과도한 부채부담 신호가 있어 즉시 조정이 필요합니다.",
      minCashKrw,
      maxDsr,
      missedGoals,
      contributionSkippedCount,
    };
  }

  if (maxDsr >= 0.4 || missedGoals > 0 || contributionSkippedCount >= CONTRIBUTION_SKIPPED_WARN_THRESHOLD) {
    return {
      status: "warn",
      reason: "일부 지표가 경고 구간입니다. 목표/지출/상환 계획을 점검하세요.",
      minCashKrw,
      maxDsr,
      missedGoals,
      contributionSkippedCount,
    };
  }

  return {
    status: "ok",
    reason: "현재 가정 기준으로 주요 지표가 안정 범위입니다.",
    minCashKrw,
    maxDsr,
    missedGoals,
    contributionSkippedCount,
  };
}
