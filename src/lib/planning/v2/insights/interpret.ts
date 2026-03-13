import { lookupWarningGlossaryKo } from "./warningGlossary.ko";
import { type ActionItemV2 } from "../actions/types";
import { type GoalRow } from "../report/mapGoals";

export type UserInsight = {
  severity: "ok" | "warn" | "risk";
  headline: string;
  bullets: string[];
  nextSteps: Array<{ title: string; why: string }>;
  translatedWarnings: Array<{
    code: string;
    level: "info" | "warn" | "critical";
    title: string;
    meaning: string;
    impact: string;
    suggestion: string;
    count?: number;
    months?: { first?: number; last?: number };
  }>;
};

export type BuildUserInsightArgs = {
  summary: {
    endNetWorthKrw?: number;
    worstCashKrw?: number;
    worstCashMonthIndex?: number;
    dsrPct?: number;
    goalsAchievedText?: string;
    monthlyExpensesKrw?: number;
  };
  aggregatedWarnings: Array<{
    code: string;
    severity: "info" | "warn" | "critical";
    count: number;
    firstMonth?: number;
    lastMonth?: number;
    sampleMessage?: string;
  }>;
  goals: GoalRow[];
  actionsTop?: ActionItemV2[];
  snapshotMeta?: { missing?: boolean; staleDays?: number };
  monteCarlo?: { retirementDepletionBeforeEnd?: number };
};

const SNAPSHOT_VERY_STALE_DAYS = 120;

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePct(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (typeof raw !== "number") return undefined;
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
}

function parseGoalsAchievedText(text: string | undefined): { achieved: number; total: number } | undefined {
  if (typeof text !== "string") return undefined;
  const [achievedRaw, totalRaw] = text.trim().split("/");
  const achieved = Number(achievedRaw);
  const total = Number(totalRaw);
  if (!Number.isFinite(achieved) || !Number.isFinite(total)) return undefined;
  return {
    achieved: Math.max(0, Math.trunc(achieved)),
    total: Math.max(0, Math.trunc(total)),
  };
}

function resolveGoalsMissed(goals: GoalRow[], goalsAchievedText: string | undefined): boolean {
  if (goals.length > 0) {
    return goals.some((goal) => !goal.achieved || goal.shortfall > 0);
  }
  const parsed = parseGoalsAchievedText(goalsAchievedText);
  if (!parsed) return false;
  return parsed.total > parsed.achieved;
}

function severityOrder(level: "info" | "warn" | "critical"): number {
  if (level === "critical") return 0;
  if (level === "warn") return 1;
  return 2;
}

function buildCashBullet(summary: BuildUserInsightArgs["summary"]): string {
  const worstCash = asNumber(summary.worstCashKrw);
  const monthlyExpenses = asNumber(summary.monthlyExpensesKrw);

  if (typeof worstCash !== "number") {
    return "현금 흐름 정보가 부족해 보수적으로 해석했습니다.";
  }

  if (worstCash <= 0) {
    return "지금 구조대로면 현금이 바닥나는 달이 생길 수 있습니다.";
  }

  if (typeof monthlyExpenses === "number" && monthlyExpenses > 0 && worstCash <= monthlyExpenses * 0.5) {
    return "현금 여유가 크지 않아 갑작스러운 지출에 취약할 수 있습니다.";
  }

  return "현금 완충 여력이 있어 단기 지출 변동을 버틸 수 있는 편입니다.";
}

function buildDsrBullet(summary: BuildUserInsightArgs["summary"]): string {
  const dsrPct = normalizePct(summary.dsrPct);
  if (typeof dsrPct !== "number") {
    return "DSR 정보가 충분하지 않아 부채 탭에서 월 상환 부담을 함께 확인하세요.";
  }

  if (dsrPct >= 60) return `대출 상환 비중이 ${dsrPct.toFixed(1)}%로 높아 계획이 쉽게 흔들릴 수 있습니다.`;
  if (dsrPct >= 40) return `대출 상환 비중이 ${dsrPct.toFixed(1)}%로 적지 않아 지출 변동에 민감합니다.`;
  return `대출 상환 비중은 ${dsrPct.toFixed(1)}%로 비교적 관리 가능한 수준입니다.`;
}

function buildMonteCarloBullet(mcDepletionProb?: number): { score: number; text: string } | null {
  if (typeof mcDepletionProb !== "number" || !Number.isFinite(mcDepletionProb)) return null;

  if (mcDepletionProb >= 0.3) {
    return {
      score: 5,
      text: "보수적으로 보면 3~4번 중 1번 정도는 자금이 먼저 마를 수 있어 안전마진이 부족합니다.",
    };
  }

  if (mcDepletionProb >= 0.1) {
    return {
      score: 3,
      text: "변동성을 고려하면 자금이 모자랄 가능성이 있어 보수 시나리오 확인이 필요합니다.",
    };
  }

  return {
    score: 1,
    text: "현재 기준 고갈 가능성은 낮지만 확정적인 보장은 아닙니다.",
  };
}

function buildThirdBullet(args: {
  goalsMissed: boolean;
  snapshotMissing: boolean;
  snapshotVeryStale: boolean;
  mcDepletionProb?: number;
  hasRetirementWarning: boolean;
  totalWarnings: number;
}): string {
  const candidates: Array<{ score: number; text: string }> = [];

  if (args.goalsMissed) {
    candidates.push({
      score: 4,
      text: "일부 목표는 지금 속도로는 늦어질 수 있어 목표 시점이나 적립액 조정이 필요합니다.",
    });
  }

  const monteCarloBullet = buildMonteCarloBullet(args.mcDepletionProb);
  if (monteCarloBullet) {
    candidates.push(monteCarloBullet);
  }

  if (args.hasRetirementWarning) {
    candidates.push({
      score: 4,
      text: "은퇴 구간에서 부족 신호가 보여 적립 전략을 다시 보는 편이 좋습니다.",
    });
  }

  if (args.snapshotMissing) {
    candidates.push({
      score: 5,
      text: "최신 기준 데이터가 없어 기본값으로 계산했습니다. 동기화 후 다시 보는 편이 정확합니다.",
    });
  } else if (args.snapshotVeryStale) {
    candidates.push({
      score: 3,
      text: "기준 데이터가 조금 오래돼 최근 금리·물가 상황이 덜 반영됐을 수 있습니다.",
    });
  }

  if (args.totalWarnings >= 8) {
    candidates.push({
      score: 2,
      text: `주의 신호가 ${args.totalWarnings}건 쌓여 있어 보수적으로 조정하는 편이 좋습니다.`,
    });
  }

  if (candidates.length === 0) {
    return "큰 위험 신호는 작지만, 입력값이 바뀌면 결과도 달라질 수 있습니다.";
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.text ?? "핵심 위험 요인을 추가로 확인하세요.";
}

function buildNextSteps(args: {
  actionsTop?: ActionItemV2[];
  cashRisk: boolean;
  highDsr: boolean;
  goalsMissed: boolean;
  snapshotVeryStale: boolean;
  snapshotMissing: boolean;
}): Array<{ title: string; why: string }> {
  if (Array.isArray(args.actionsTop) && args.actionsTop.length > 0) {
    return args.actionsTop.slice(0, 3).map((action) => ({
      title: action.title || action.code,
      why: action.summary || action.steps[0] || "핵심 위험을 낮추기 위한 우선 조치입니다.",
    }));
  }

  const rows: Array<{ title: string; why: string }> = [];
  const push = (title: string, why: string) => {
    if (rows.some((row) => row.title === title)) return;
    rows.push({ title, why });
  };

  if (args.cashRisk) {
    push("월 잉여(수입-지출) 개선", "적자가 반복되면 현금이 빠르게 소진되어 계획이 중단될 수 있습니다.");
    push("자동이체 금액 조정", "적립 자동이체를 현실화하면 현금 고갈 구간을 줄일 수 있습니다.");
  }

  if (args.highDsr) {
    push("대출 기간/금리 재검토", "상환 부담을 낮추면 목표 적립 여유를 회복할 수 있습니다.");
  }

  if (args.goalsMissed) {
    push("목표월/월 적립액 재설정", "현재 소득·지출 수준에 맞춰 목표를 현실화해야 달성률이 높아집니다.");
  }

  if (args.snapshotVeryStale || args.snapshotMissing) {
    push("스냅샷 동기화(/ops/assumptions)", "오래된 가정 데이터는 해석 정확도를 떨어뜨릴 수 있습니다.");
  }

  if (rows.length < 3) {
    push("변경안 재실행 비교", "한 번에 하나씩 변경하고 결과를 비교하면 원인 파악이 쉬워집니다.");
  }

  return rows.slice(0, 3);
}

export function buildUserInsight(args: BuildUserInsightArgs): UserInsight {
  const worstCashKrw = asNumber(args.summary.worstCashKrw);
  const dsrPct = normalizePct(args.summary.dsrPct);
  const depletionProb = asNumber(args.monteCarlo?.retirementDepletionBeforeEnd);
  const hasCriticalWarning = args.aggregatedWarnings.some((warning) => warning.severity === "critical");
  const goalsMissed = resolveGoalsMissed(args.goals, args.summary.goalsAchievedText);
  const totalWarnings = args.aggregatedWarnings.reduce((sum, warning) => sum + warning.count, 0);
  const warningCountHigh = totalWarnings >= 8;
  const snapshotMissing = args.snapshotMeta?.missing === true;
  const snapshotStaleDays = asNumber(args.snapshotMeta?.staleDays);
  const snapshotVeryStale = typeof snapshotStaleDays === "number" && snapshotStaleDays > SNAPSHOT_VERY_STALE_DAYS;
  const hasRetirementWarning = args.aggregatedWarnings.some((warning) => warning.code === "RETIREMENT_SHORT");

  const severity: UserInsight["severity"] = (worstCashKrw ?? Number.POSITIVE_INFINITY) <= 0
    || hasCriticalWarning
    || (dsrPct ?? 0) >= 60
    || (depletionProb ?? 0) >= 0.3
    ? "risk"
    : ((dsrPct ?? 0) >= 40 || goalsMissed || warningCountHigh || snapshotVeryStale)
      ? "warn"
      : "ok";

  const headline = severity === "risk"
    ? "지금 구조로는 버거운 시점이 보여서 우선순위 조정이 필요합니다."
    : severity === "warn"
      ? "몇 가지만 조정하면 훨씬 안정적으로 갈 수 있는 상태입니다."
      : "현재 기준으로는 큰 위험 신호 없이 비교적 안정적인 흐름입니다.";

  const bullets = [
    buildCashBullet(args.summary),
    buildDsrBullet(args.summary),
    buildThirdBullet({
      goalsMissed,
      snapshotMissing,
      snapshotVeryStale,
      mcDepletionProb: depletionProb,
      hasRetirementWarning,
      totalWarnings,
    }),
  ];

  const nextSteps = buildNextSteps({
    actionsTop: args.actionsTop,
    cashRisk: (worstCashKrw ?? Number.POSITIVE_INFINITY) <= 0,
    highDsr: (dsrPct ?? 0) >= 40,
    goalsMissed,
    snapshotVeryStale,
    snapshotMissing,
  });

  const translatedWarnings = [...args.aggregatedWarnings]
    .sort((a, b) => {
      const bySeverity = severityOrder(a.severity) - severityOrder(b.severity);
      if (bySeverity !== 0) return bySeverity;
      if (b.count !== a.count) return b.count - a.count;
      return a.code.localeCompare(b.code);
    })
    .slice(0, 8)
    .map((warning) => {
      const translated = lookupWarningGlossaryKo(warning.code);
      return {
        code: warning.code,
        level: warning.severity,
        title: translated.title,
        meaning: translated.meaning,
        impact: translated.impact,
        suggestion: translated.suggestion,
        count: warning.count,
        ...(
          typeof warning.firstMonth === "number" || typeof warning.lastMonth === "number"
            ? {
                months: {
                  ...(typeof warning.firstMonth === "number" ? { first: warning.firstMonth } : {}),
                  ...(typeof warning.lastMonth === "number" ? { last: warning.lastMonth } : {}),
                },
              }
            : {}
        ),
      };
    });

  return {
    severity,
    headline,
    bullets,
    nextSteps,
    translatedWarnings,
  };
}
