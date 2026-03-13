"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import CandidateComparisonSection from "@/app/planning/reports/_components/CandidateComparisonSection";
import ReportAdvancedRaw from "@/app/planning/reports/_components/ReportAdvancedRaw";
import ReportBenefitsSection from "@/app/planning/reports/_components/ReportBenefitsSection";
import ReportRecommendationsSection from "@/app/planning/reports/_components/ReportRecommendationsSection";
import {
  safeBuildReportVMFromRun,
  type ReportActionRow,
  type ReportVM,
} from "@/app/planning/reports/_lib/reportViewModel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { parsePlanningV2Response } from "@/lib/planning/api/contracts";
import { formatKrw, formatMonths, formatPct } from "@/lib/planning/i18n/format";
import { appendProfileIdQuery } from "@/lib/planning/profileScope";
import { mergeRunListWithPreferredRun, resolveSelectedRunId } from "@/lib/planning/reports/runSelection";
import { type PlanningRunOverallStatus, type PlanningRunRecord } from "@/lib/planning/store/types";
import { buildResultDtoV1FromRunRecord } from "@/lib/planning/v2/resultDto";

type PlanningReportsPrototypeClientProps = {
  initialRuns?: PlanningRunRecord[];
  initialProfileId?: string;
  initialRunId?: string;
  initialLoadNotice?: string;
};

type PrototypeCategoryId =
  | "coach"
  | "data"
  | "flow"
  | "offers"
  | "risk"
  | "scenarios"
  | "evidence";

type PrototypeCategoryTab = {
  id: PrototypeCategoryId;
  label: string;
  summary: string;
};

const CATEGORY_TABS: PrototypeCategoryTab[] = [
  { id: "coach", label: "이번 달 코칭", summary: "지금 먼저 해야 할 일과 자동 판정을 봅니다." },
  { id: "data", label: "자동 수집", summary: "엔진이 읽은 정보와 판단 기준을 봅니다." },
  { id: "flow", label: "돈 흐름", summary: "현재 돈의 흐름과 월 배분 구조를 봅니다." },
  { id: "offers", label: "상품/혜택", summary: "지금 상황에서 볼 만한 상품과 혜택을 봅니다." },
  { id: "risk", label: "위험/목표", summary: "반복 경고와 목표 부족 구간을 봅니다." },
  { id: "scenarios", label: "시나리오", summary: "선택지 비교와 장기 검증을 봅니다." },
  { id: "evidence", label: "원문 검증", summary: "원문 데이터와 세부 근거를 마지막에 확인합니다." },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function formatMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatKrw("ko-KR", value);
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatPct("ko-KR", value);
}

function formatMonthValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatMonths("ko-KR", value);
}

function statusLabel(value: PlanningRunOverallStatus | undefined): string {
  if (value === "SUCCESS") return "성공";
  if (value === "PARTIAL_SUCCESS") return "부분 성공";
  if (value === "FAILED") return "실패";
  if (value === "RUNNING") return "실행 중";
  if (value === "CANCELLED") return "취소";
  return "상태 미상";
}

function statusTone(value: PlanningRunOverallStatus | undefined): string {
  if (value === "SUCCESS") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (value === "PARTIAL_SUCCESS") return "border-amber-200 bg-amber-50 text-amber-800";
  if (value === "FAILED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function severityTone(value: ReportActionRow["severity"]): string {
  if (value === "critical") return "border-rose-200 bg-rose-50";
  if (value === "warn") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-slate-50";
}

function severityLabel(value: ReportActionRow["severity"]): string {
  if (value === "critical") return "치명";
  if (value === "warn") return "경고";
  return "정보";
}

function monthlySurplusTone(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-slate-200 bg-white";
  if (value < 0) return "border-rose-300 bg-rose-50";
  if (value < 300_000) return "border-amber-300 bg-amber-50";
  return "border-emerald-300 bg-emerald-50";
}

function emergencyFundTone(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-slate-200 bg-white";
  if (value < 3) return "border-rose-300 bg-rose-50";
  if (value < 6) return "border-amber-300 bg-amber-50";
  return "border-emerald-300 bg-emerald-50";
}

function dsrTone(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-slate-200 bg-white";
  if (value >= 40) return "border-rose-300 bg-rose-50";
  if (value >= 30) return "border-amber-300 bg-amber-50";
  return "border-emerald-300 bg-emerald-50";
}

type ScenarioChoiceMeta = {
  badge: string;
  title: string;
  summary: string;
  assumptionsHint: string;
  whoFor: string;
  riskNote: string;
};

function scenarioChoiceMeta(value: string): ScenarioChoiceMeta {
  const normalized = value.trim().toLowerCase();
  if (normalized === "base") {
    return {
      badge: "현재 유지",
      title: "현재 방식 유지",
      summary: "지금 입력한 소비·저축 흐름과 기본 가정을 그대로 둔 기준 경로입니다.",
      assumptionsHint: "예금/적금 중심이면 그 보수적 흐름이 그대로 반영되고, 이미 투자 가정을 넣었다면 그 값이 기준이 됩니다.",
      whoFor: "지금 계획을 바꾸지 않았을 때 결과가 어떤지 먼저 확인하려는 경우",
      riskNote: "다른 선택지의 숫자는 이 기준 대비 얼마나 달라지는지로 읽는 편이 맞습니다.",
    };
  }
  if (normalized === "conservative") {
    return {
      badge: "안전여력 우선",
      title: "안전여력 우선",
      summary: "비상금과 현금성 여유를 더 중시하는 선택에 가까운 보수적 가정입니다.",
      assumptionsHint: "수익률 기대는 낮추고 물가나 생활비 압박은 더 빡빡하게 보는 쪽에 가깝습니다.",
      whoFor: "원금 손실이나 현금 부족을 특히 피하고 싶은 경우",
      riskNote: "방어력은 좋아질 수 있지만 장기 말기 순자산은 덜 커질 수 있습니다.",
    };
  }
  if (normalized === "aggressive") {
    return {
      badge: "수익 확대 탐색",
      title: "수익 확대 탐색",
      summary: "ETF·주식 같은 투자 비중을 더 활용하는 선택에 가까운 공격적 가정입니다.",
      assumptionsHint: "기대수익은 더 높게 보고, 현금성 자산에만 머무르지 않는 방향을 가정합니다.",
      whoFor: "흑자와 비상금이 어느 정도 있고 장기적으로 더 불리는 선택을 고민하는 경우",
      riskNote: "중간 변동성과 손실 가능성도 함께 커질 수 있으니 최저 현금과 목표 미달 위험을 같이 봐야 합니다.",
    };
  }
  return {
    badge: "선택 시나리오",
    title: value,
    summary: "기준과 다른 가정을 적용한 비교 시나리오입니다.",
    assumptionsHint: "현재 구조와 다른 가정값을 넣어 결과 차이를 보는 용도입니다.",
    whoFor: "다른 선택지를 시험해보고 싶은 경우",
    riskNote: "결과 숫자만 보지 말고 최저 현금과 경고 수를 같이 확인해야 합니다.",
  };
}

function scenarioDirectionLabel(deltaKrw: number): string {
  if (deltaKrw > 0) return "늘어납니다";
  if (deltaKrw < 0) return "줄어듭니다";
  return "비슷합니다";
}

function buildScenarioInterpretation(vm: ReportVM, row: ReportVM["scenarioRows"][number]): string {
  const meta = scenarioChoiceMeta(row.title);
  const deltaAbs = Math.abs(row.endNetWorthDeltaKrw);
  if (row.id === "base" || row.title.trim().toLowerCase() === "base") {
    return `${meta.summary} 목표 달성 ${row.goalsAchievedCount}개, 경고 ${row.warningsCount}건으로 다른 선택지의 기준점이 됩니다.`;
  }

  const warningDelta = row.warningsCount - (vm.scenarioRows.find((item) => item.id === "base")?.warningsCount ?? row.warningsCount);
  const warningText = warningDelta > 0
    ? `경고는 기준보다 ${warningDelta}건 많습니다.`
    : warningDelta < 0
      ? `경고는 기준보다 ${Math.abs(warningDelta)}건 적습니다.`
      : "경고 수는 기준과 비슷합니다.";

  return `${meta.title} 선택에 가까운 가정에서는 말기 순자산이 기준 대비 ${formatMoney(deltaAbs)} ${scenarioDirectionLabel(row.endNetWorthDeltaKrw)}. 최저 현금은 ${formatMoney(row.worstCashKrw)}까지 내려가고, 목표는 ${row.goalsAchievedCount}개 달성했습니다. ${warningText}`;
}

function scenarioReadyReasons(vm: ReportVM): string[] {
  const reasons: string[] = [];
  const monthlySurplus = vm.summaryCards.monthlySurplusKrw;
  const emergencyMonths = vm.summaryCards.emergencyFundMonths;
  const dsr = vm.summaryCards.dsrPct;

  if (typeof monthlySurplus === "number" && monthlySurplus < 0) {
    reasons.push("매달 적자인 상태라면 시나리오 비교보다 적자 해소와 고정비 조정이 먼저입니다.");
  }
  if (typeof emergencyMonths === "number" && emergencyMonths < 3) {
    reasons.push(`비상금이 ${formatMonthValue(emergencyMonths)} 수준이면 먼저 안전자금을 채운 뒤 선택 실험을 보는 편이 좋습니다.`);
  }
  if (typeof dsr === "number" && dsr >= 40) {
    reasons.push(`DSR이 ${formatPercent(dsr)}로 높아 대출 부담을 낮추는 쪽이 시나리오 비교보다 우선입니다.`);
  }
  return reasons;
}

function canUseScenarioChoices(vm: ReportVM): boolean {
  return scenarioReadyReasons(vm).length < 1;
}

function scenarioDeltaTone(deltaKrw: number): string {
  if (deltaKrw > 0) return "text-emerald-700";
  if (deltaKrw < 0) return "text-rose-700";
  return "text-slate-900";
}

type AdvisoryVerdict = {
  label: "위험" | "점검" | "안정";
  message: string;
  tone: string;
};

function resolveAdvisoryVerdict(vm: ReportVM): AdvisoryVerdict {
  const monthlySurplus = vm.summaryCards.monthlySurplusKrw;
  const emergencyMonths = vm.summaryCards.emergencyFundMonths;
  const dsr = vm.summaryCards.dsrPct;
  if (
    (typeof monthlySurplus === "number" && monthlySurplus < 0)
    || (typeof emergencyMonths === "number" && emergencyMonths < 3)
    || (typeof dsr === "number" && dsr >= 40)
  ) {
    return {
      label: "위험",
      message: "현금흐름/안전자금/부채부담 중 즉시 조정이 필요한 항목이 있습니다.",
      tone: "border-rose-300 bg-rose-50 text-rose-800",
    };
  }
  if (
    (typeof emergencyMonths === "number" && emergencyMonths < 6)
    || (typeof dsr === "number" && dsr >= 30)
  ) {
    return {
      label: "점검",
      message: "기본 구조는 유지 가능하나 목표 달성 속도와 방어 여력 보강이 필요합니다.",
      tone: "border-amber-300 bg-amber-50 text-amber-900",
    };
  }
  return {
    label: "안정",
    message: "핵심 지표는 안정 범위이며 목표 달성 효율 최적화 단계입니다.",
    tone: "border-emerald-300 bg-emerald-50 text-emerald-800",
  };
}

const TEMP_ASSUMPTIONS_LINES = [
  "기간: 360개월",
  "물가 2.2% · 투자수익 5.4% · 예금수익 3.1%",
  "월 고정비/저축은 최근 6개월 평균 기준",
];

const TEMP_MONTHLY_OPERATING_GUIDE: NonNullable<ReportVM["monthlyOperatingGuide"]> = {
  headline: "현재 구조는 흑자 기반으로 유지 가능하며, 잉여금 분배 최적화가 필요합니다.",
  basisLabel: "월 잉여금 900,000원 기준으로 비상금/목표/여유예산 4:4:2 권장",
  currentSplit: [
    { title: "생활비/고정운영", amountKrw: 2_600_000, sharePct: 74, tone: "amber", description: "주거/통신/보험/정기지출" },
    { title: "대출 상환", amountKrw: 0, sharePct: 0, tone: "slate", description: "현재 상환 대출 없음" },
    { title: "남는 돈", amountKrw: 900_000, sharePct: 26, tone: "emerald", description: "저축/투자/비상자금 재원" },
  ],
  nextPlanTitle: "남는 돈 운영안",
  nextPlan: [
    { title: "비상금/안전자금", amountKrw: 360_000, sharePct: 40, tone: "emerald", description: "예기치 못한 지출 대비 우선 확보" },
    { title: "목표저축", amountKrw: 360_000, sharePct: 40, tone: "slate", description: "은퇴/주거/교육 목표 자금" },
    { title: "자유예산", amountKrw: 180_000, sharePct: 20, tone: "amber", description: "유연한 소비/취미/비정기 지출" },
  ],
};

const TEMP_ACTION_ROWS: ReportVM["actionRows"] = [
  {
    code: "BOOST_RETIREMENT_CONTRIBUTION",
    title: "은퇴자금 적립 속도 보강",
    summary: "목표 시점 대비 부족 가능성이 있어 자동이체 금액을 단계적으로 상향하는 것이 필요합니다.",
    severity: "warn",
    whyCount: 2,
    steps: ["월 목표저축 36만원 -> 45만원 상향", "성과 점검 주기 월 1회 고정", "분기별 리밸런싱 규칙 설정"],
    cautions: [],
  },
  {
    code: "EMERGENCY_BUFFER_RULE",
    title: "비상금 상한선/하한선 규칙 고정",
    summary: "비상금은 5~6개월 범위 유지가 권장되며, 하한선 미만 시 투자보다 우선 충전해야 합니다.",
    severity: "info",
    whyCount: 1,
    steps: ["비상금 하한 4.5개월, 목표 6개월 설정", "하한 미만 시 자동이체 우선순위 전환"],
    cautions: [],
  },
  {
    code: "GOAL_TRACKING",
    title: "목표별 트래킹 기준 통일",
    summary: "기한·부족액·월 납입액을 동일 단위로 관리해 목표 달성률 해석을 단순화해야 합니다.",
    severity: "info",
    whyCount: 1,
    steps: ["목표별 월 납입액 확정", "기한 임박 순 정렬", "부족액 500만원 이상 목표 집중 관리"],
    cautions: [],
  },
];

const TEMP_GOAL_ROWS: ReportVM["goalsTable"] = [
  {
    name: "은퇴 준비자금",
    targetAmount: 250_000_000,
    currentAmount: 176_000_000,
    shortfall: 74_000_000,
    targetMonth: 240,
    achieved: false,
    comment: "부족액 존재",
  },
  {
    name: "내집마련 초기자금",
    targetAmount: 120_000_000,
    currentAmount: 102_000_000,
    shortfall: 18_000_000,
    targetMonth: 96,
    achieved: false,
    comment: "진행 중(달성 가능)",
  },
  {
    name: "비상자금 6개월",
    targetAmount: 18_000_000,
    currentAmount: 18_300_000,
    shortfall: 0,
    targetMonth: 12,
    achieved: true,
    achievedMonth: 10,
    comment: "달성",
  },
];

const TEMP_WARNING_ROWS: ReportVM["warningAgg"] = [
  {
    code: "RETIREMENT_SHORTFALL",
    title: "은퇴 목표 부족 가능",
    plainDescription: "현재 적립 속도 기준으로 은퇴 목표 대비 부족 가능성이 있습니다.",
    suggestedActionId: "BOOST_RETIREMENT_CONTRIBUTION",
    severity: "warn",
    severityMax: "warn",
    count: 2,
    periodMinMax: "M120~M240",
    subjectKey: "retirement",
    subjectLabel: "은퇴자금",
    sampleMessage: "은퇴자금 부족 가능",
    firstMonth: 119,
    lastMonth: 239,
  },
  {
    code: "SNAPSHOT_STALE",
    title: "데이터 기준 시점 경과",
    plainDescription: "스냅샷 기준 시점이 오래되어 최신성 점검이 필요합니다.",
    severity: "info",
    severityMax: "info",
    count: 1,
    periodMinMax: "M1",
    sampleMessage: "스냅샷 최신성 확인 필요",
    firstMonth: 0,
    lastMonth: 0,
  },
];

const TEMP_SCENARIO_ROWS: ReportVM["scenarioRows"] = [
  {
    id: "base",
    title: "base",
    endNetWorthKrw: 176_448_282,
    worstCashKrw: 900_000,
    goalsAchievedCount: 2,
    warningsCount: 2,
    endNetWorthDeltaKrw: 0,
    interpretation: "현재 방식 유지 시 기준 시나리오",
  },
  {
    id: "conservative",
    title: "conservative",
    endNetWorthKrw: 169_102_440,
    worstCashKrw: 1_100_000,
    goalsAchievedCount: 2,
    warningsCount: 1,
    endNetWorthDeltaKrw: -7_345_842,
    interpretation: "안전자산 비중 확대 시",
  },
  {
    id: "aggressive",
    title: "aggressive",
    endNetWorthKrw: 191_384_770,
    worstCashKrw: 520_000,
    goalsAchievedCount: 3,
    warningsCount: 3,
    endNetWorthDeltaKrw: 14_936_488,
    interpretation: "수익 확대 가정 시",
  },
];

const TEMP_MONTE_PROBABILITY_ROWS: ReportVM["monteProbabilityRows"] = [
  {
    label: "은퇴 자산 고갈 확률",
    value: "12.4%",
    interpretation: "하위 경로 기준으로는 은퇴 후 자금 고갈 가능성이 일부 존재합니다.",
  },
  {
    label: "목표 달성 안정 확률",
    value: "78.6%",
    interpretation: "현재 납입액 유지 시 주요 목표를 기한 내 달성할 확률입니다.",
  },
];

const TEMP_MONTE_PERCENTILE_ROWS: ReportVM["montePercentileRows"] = [
  { metric: "말기 순자산", p10: 128_000_000, p50: 176_448_282, p90: 229_000_000 },
  { metric: "최저 현금", p10: -1_200_000, p50: 900_000, p90: 2_100_000 },
];

type PrototypeVmHydration = {
  vm: ReportVM;
  hasFallback: boolean;
  fallbackKeys: string[];
};

function buildPrototypeDemoRun(profileId: string): PlanningRunRecord {
  const createdAt = new Date().toISOString();
  const run: PlanningRunRecord = {
    version: 1,
    id: "demo-prototype-run",
    profileId: profileId || "demo-profile",
    title: "MMD 데모 실행",
    createdAt,
    overallStatus: "SUCCESS",
    input: {
      horizonMonths: 360,
      runScenarios: true,
      getActions: true,
      includeProducts: true,
      monteCarlo: { paths: 500, seed: 20260308 },
    },
    meta: {
      snapshot: {
        id: "demo-snapshot",
        asOf: "2026-03-08",
        fetchedAt: createdAt,
        missing: false,
        warningsCount: 1,
        sourcesCount: 13,
      },
      health: {
        warningsCodes: ["RETIREMENT_SHORTFALL"],
        criticalCount: 0,
        snapshotStaleDays: 0,
      },
    },
    outputs: {
      engineSchemaVersion: 1,
      engine: {
        stage: "INVEST",
        financialStatus: {
          stage: "INVEST",
          trace: {
            savingCapacity: 900_000,
            savingRate: 0.26,
            liquidAssets: 18_300_000,
            debtBalance: 0,
            emergencyFundTarget: 15_000_000,
            emergencyFundGap: 0,
            triggeredRules: [],
          },
        },
        stageDecision: {
          priority: "INVEST",
          investmentAllowed: true,
          warnings: [],
        },
      },
      simulate: {
        ref: {
          name: "simulate",
          path: "demo-run/simulate.json",
        },
        summary: {
          endNetWorthKrw: 176_448_282,
          worstCashKrw: 900_000,
          worstCashMonthIndex: 14,
          goalsAchievedCount: 2,
          goalsMissedCount: 1,
        },
        warnings: [
          {
            reasonCode: "RETIREMENT_SHORTFALL",
            severity: "warn",
            message: "은퇴 목표 대비 부족 가능성이 있습니다.",
            month: 120,
            meta: { subjectKey: "retirement", subjectLabel: "은퇴자금" },
          },
          {
            reasonCode: "RETIREMENT_SHORTFALL",
            severity: "warn",
            message: "은퇴 목표 대비 부족 가능성이 있습니다.",
            month: 240,
            meta: { subjectKey: "retirement", subjectLabel: "은퇴자금" },
          },
        ],
        goalsStatus: [
          {
            goalId: "retirement",
            name: "은퇴 준비자금",
            targetAmount: 250_000_000,
            currentAmount: 176_000_000,
            shortfall: 74_000_000,
            targetMonth: 240,
            achieved: false,
            onTrack: false,
          },
          {
            goalId: "housing",
            name: "내집마련 초기자금",
            targetAmount: 120_000_000,
            currentAmount: 102_000_000,
            shortfall: 18_000_000,
            targetMonth: 96,
            achieved: false,
            onTrack: true,
          },
          {
            goalId: "emergency",
            name: "비상자금 6개월",
            targetAmount: 18_000_000,
            currentAmount: 18_300_000,
            shortfall: 0,
            targetMonth: 12,
            achieved: true,
            achievedMonth: 10,
            onTrack: true,
          },
        ],
      },
      debtStrategy: {
        ref: {
          name: "debtStrategy",
          path: "demo-run/debt-strategy.json",
        },
        summary: {
          debtServiceRatio: 0.27,
          totalMonthlyPaymentKrw: 0,
          warningsCount: 0,
        },
      },
    } as unknown as PlanningRunRecord["outputs"],
  };
  run.outputs.resultDto = buildResultDtoV1FromRunRecord(run);
  return run;
}

function hydratePrototypeVmWithTempValues(vm: ReportVM): PrototypeVmHydration {
  let next = vm;
  const fallbackKeys: string[] = [];

  const summaryPatch: Partial<ReportVM["summaryCards"]> = {};
  if (typeof vm.summaryCards.monthlySurplusKrw !== "number") summaryPatch.monthlySurplusKrw = 900_000;
  if (typeof vm.summaryCards.emergencyFundMonths !== "number") summaryPatch.emergencyFundMonths = 5.3;
  if (typeof vm.summaryCards.dsrPct !== "number") summaryPatch.dsrPct = 27;
  if (typeof vm.summaryCards.endNetWorthKrw !== "number") summaryPatch.endNetWorthKrw = 176_448_282;
  if (typeof vm.summaryCards.totalWarnings !== "number") summaryPatch.totalWarnings = 2;
  if (Object.keys(summaryPatch).length > 0) {
    next = { ...next, summaryCards: { ...next.summaryCards, ...summaryPatch } };
    fallbackKeys.push("summaryCards");
  }

  if (next.assumptionsLines.length < 1) {
    next = { ...next, assumptionsLines: TEMP_ASSUMPTIONS_LINES };
    fallbackKeys.push("assumptions");
  }

  if (!next.monthlyOperatingGuide || next.monthlyOperatingGuide.nextPlan.length < 1) {
    next = { ...next, monthlyOperatingGuide: TEMP_MONTHLY_OPERATING_GUIDE };
    fallbackKeys.push("monthlyOperatingGuide");
  }

  if (next.actionRows.length < 1) {
    next = { ...next, actionRows: TEMP_ACTION_ROWS };
    fallbackKeys.push("actionRows");
  }

  if (next.goalsTable.length < 1) {
    next = { ...next, goalsTable: TEMP_GOAL_ROWS };
    fallbackKeys.push("goalsTable");
  }

  if (next.warningAgg.length < 1) {
    next = { ...next, warningAgg: TEMP_WARNING_ROWS };
    fallbackKeys.push("warningAgg");
  }

  if (next.scenarioRows.length < 1) {
    next = { ...next, scenarioRows: TEMP_SCENARIO_ROWS };
    fallbackKeys.push("scenarioRows");
  }

  if (next.monteProbabilityRows.length < 1) {
    next = { ...next, monteProbabilityRows: TEMP_MONTE_PROBABILITY_ROWS };
    fallbackKeys.push("monteProbabilityRows");
  }

  if (next.montePercentileRows.length < 1) {
    next = { ...next, montePercentileRows: TEMP_MONTE_PERCENTILE_ROWS };
    fallbackKeys.push("montePercentileRows");
  }

  if (!next.monteCarloSummary || next.monteCarloSummary.notes.length < 1) {
    next = {
      ...next,
      monteCarloSummary: {
        ...(next.monteCarloSummary ?? { keyProbs: [], percentiles: [], notes: [] }),
        notes: [
          "임시값은 시연 목적이며 실제 실행 시 결과로 교체됩니다.",
          "실서비스에서는 run별 엔진 결과와 스냅샷 최신성이 우선합니다.",
        ],
      },
    };
    fallbackKeys.push("monteCarloSummary");
  }

  return {
    vm: next,
    hasFallback: fallbackKeys.length > 0,
    fallbackKeys,
  };
}

function PrototypeSection(props: {
  id: string;
  step: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 rounded-[26px] border border-[#d6dee9] bg-white p-5 shadow-[0_20px_45px_-40px_rgba(15,23,42,0.55)] md:p-7" id={props.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0b4f8a]">{props.eyebrow}</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.02em] text-[#0f172a]">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{props.description}</p>
        </div>
        <span className="rounded-full border border-[#b8c9e0] bg-[#eef4ff] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#16457a]">
          {props.step}
        </span>
      </div>
      {props.children}
    </section>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <article className={`rounded-2xl border p-4 shadow-sm shadow-slate-200/70 ring-1 ring-white md:p-5 ${props.tone ?? "border-slate-200 bg-white"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">{props.label}</p>
      <p className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#081229]">{props.value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{props.hint}</p>
    </article>
  );
}

function AutopilotFlowPanel({ vm }: { vm: ReportVM }) {
  const verdict = resolveAdvisoryVerdict(vm);
  const warningsCount = typeof vm.summaryCards.totalWarnings === "number"
    ? vm.summaryCards.totalWarnings
    : vm.warningAgg.reduce((sum, row) => sum + row.count, 0);
  const goalsTotal = vm.goalsTable.length;
  const goalsDone = vm.goalsTable.filter((goal) => goal.achieved).length;
  const topAction = vm.actionRows[0];
  const topWarning = vm.warningAgg[0];
  const nextGoal = vm.goalsTable.find((goal) => !goal.achieved);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden border-[#10284a] bg-[linear-gradient(135deg,#08162f_0%,#0f2d4d_55%,#0e4b4c_100%)] p-6 text-white md:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8fc2ff]">Monthly Coaching</p>
          <h3 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">
            지금은 {topAction?.title ?? "핵심 실행오더 정리"}부터 처리하는 것이 맞습니다.
          </h3>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#dbe9ff]">
            {topAction?.summary ?? verdict.message}
          </p>

          <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9fc8ff]">자동 판단</p>
            <p className="mt-2 text-lg font-black text-white">현재 판정: {verdict.label}</p>
            <p className="mt-2 text-sm leading-6 text-[#dbe9ff]">{verdict.message}</p>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {topAction?.steps.slice(0, 3).map((step) => (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#eef5ff]" key={step}>
                {step}
              </span>
            )) ?? null}
          </div>
        </Card>

        <div className="grid gap-3">
          <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4 shadow-sm shadow-slate-200/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">이번 달 핵심 수치</p>
            <p className="mt-2 text-3xl font-black tracking-[-0.03em] text-[#0f172a]">{formatMoney(vm.summaryCards.monthlySurplusKrw)}</p>
            <p className="mt-1 text-sm text-slate-600">월 잉여금</p>
          </article>
          <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4 shadow-sm shadow-slate-200/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">다음 체크 포인트</p>
            <p className="mt-2 text-lg font-black tracking-[-0.03em] text-[#0f172a]">
              {nextGoal?.name ?? "추가 목표 설정 필요"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {nextGoal ? `부족액 ${formatMoney(nextGoal.shortfall)}` : "아직 목표가 없습니다."}
            </p>
          </article>
          <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4 shadow-sm shadow-slate-200/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">주의 신호</p>
            <p className="mt-2 text-lg font-black tracking-[-0.03em] text-[#0f172a]">
              {topWarning?.title ?? "특이 경고 없음"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              경고 {warningsCount.toLocaleString("ko-KR")}건 · 목표 {goalsDone.toLocaleString("ko-KR")}/{goalsTotal.toLocaleString("ko-KR")}개
            </p>
          </article>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">입력 수</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f172a]">2~3개</p>
          <p className="mt-1 text-sm text-slate-600">월 수입, 고정지출, 핵심 목표</p>
        </article>
        <article className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">자동 판정</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f172a]">{verdict.label}</p>
          <p className="mt-1 text-sm text-slate-600">리스크, 목표, 잉여금 종합</p>
        </article>
        <article className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">경고/목표</p>
          <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#0f172a]">
            {warningsCount.toLocaleString("ko-KR")} / {goalsTotal.toLocaleString("ko-KR")}
          </p>
          <p className="mt-1 text-sm text-slate-600">경고 수 / 등록 목표 수</p>
        </article>
        <article className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">첫 실행오더</p>
          <p className="mt-2 text-lg font-black tracking-[-0.03em] text-[#0f172a]">{topAction?.title ?? "핵심 실행오더 생성"}</p>
          <p className="mt-1 text-sm text-slate-600">가장 먼저 처리할 항목</p>
        </article>
      </div>
    </div>
  );
}

function CollectionStatusPanel({ vm }: { vm: ReportVM }) {
  const items = [
    {
      label: "수입/지출 구조",
      value: typeof vm.summaryCards.monthlySurplusKrw === "number" ? "분석 완료" : "기초값 필요",
      hint: typeof vm.summaryCards.monthlySurplusKrw === "number" ? "월 잉여금 산출 완료" : "월 잉여금 산출 전",
    },
    {
      label: "안전자금 판단",
      value: typeof vm.summaryCards.emergencyFundMonths === "number" ? `${formatMonthValue(vm.summaryCards.emergencyFundMonths)}` : "계산 대기",
      hint: "생활비 기준 버틸 수 있는 개월 수",
    },
    {
      label: "부채 부담도",
      value: typeof vm.summaryCards.dsrPct === "number" ? formatPercent(vm.summaryCards.dsrPct) : "확인 필요",
      hint: "대출 상환 비중",
    },
    {
      label: "목표 트래킹",
      value: `${vm.goalsTable.filter((goal) => goal.achieved).length}/${vm.goalsTable.length}`,
      hint: "등록 목표 기준 달성 현황",
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="space-y-4 border-[#d6dee9] bg-[#f8fbff] p-5 md:p-6">
        <div>
          <h3 className="text-lg font-black text-[#0f172a]">자동으로 읽은 정보</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">사용자 입력 외에 판단에 직접 쓴 항목만 모았습니다.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4" key={item.label}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">{item.label}</p>
              <p className="mt-2 text-xl font-black tracking-[-0.03em] text-[#0f172a]">{item.value}</p>
              <p className="mt-1 text-sm text-slate-600">{item.hint}</p>
            </article>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 border-[#d6dee9] bg-white p-5 md:p-6">
        <div>
          <h3 className="text-lg font-black text-[#0f172a]">판단에 쓴 기준</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">결과를 만든 최소 근거만 남기고 긴 설명은 줄였습니다.</p>
        </div>
        <div className="grid gap-3">
          <div className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">스냅샷 기준일</p>
            <p className="mt-2 text-lg font-black text-[#0f172a]">{vm.snapshot.asOf ?? "기준일 없음"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {vm.snapshot.missing ? "데이터 스냅샷 없음" : vm.snapshot.staleDays ? `${vm.snapshot.staleDays}일 경과` : "최신 상태"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#d7e3f5] bg-[#f8fbff] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#345c88]">적용 가정</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {vm.assumptionsLines.slice(0, 4).map((line) => (
                <span className="rounded-full border border-white/80 bg-white px-3 py-1.5 text-xs text-slate-700" key={line}>
                  {line}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function OverviewSection({ vm }: { vm: ReportVM }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        hint="생활비와 대출상환 이후 매달 남는 금액입니다."
        label="월 잉여금"
        tone={monthlySurplusTone(vm.summaryCards.monthlySurplusKrw)}
        value={formatMoney(vm.summaryCards.monthlySurplusKrw)}
      />
      <MetricCard
        hint="생활비 기준으로 몇 개월 버틸 수 있는지 봅니다."
        label="비상금"
        tone={emergencyFundTone(vm.summaryCards.emergencyFundMonths)}
        value={formatMonthValue(vm.summaryCards.emergencyFundMonths)}
      />
      <MetricCard
        hint="월 소득 대비 대출 상환 부담 비중입니다."
        label="DSR"
        tone={dsrTone(vm.summaryCards.dsrPct)}
        value={formatPercent(vm.summaryCards.dsrPct)}
      />
      <MetricCard
        hint="계획 종료 시점 기준 순자산입니다."
        label="말기 순자산"
        value={formatMoney(vm.summaryCards.endNetWorthKrw)}
      />
      <MetricCard
        hint="반복 경고를 묶어서 본 총 위험 신호 수입니다."
        label="경고 수"
        value={typeof vm.summaryCards.totalWarnings === "number" ? vm.summaryCards.totalWarnings.toLocaleString("ko-KR") : "-"}
      />
    </div>
  );
}

function RunContextPanel(props: {
  run: PlanningRunRecord;
  vm: ReportVM;
  currentReportHref: string;
}) {
  return (
    <Card className="space-y-5 border-[#d6dee9] bg-[#f8fbff] p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-[#0f172a]">상담 실행 스냅샷</h3>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(props.run.overallStatus)}`}>
          {statusLabel(props.run.overallStatus)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#d7e3f5] bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">실행 시각</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(props.run.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-[#d7e3f5] bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">스냅샷 상태</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {props.vm.snapshot.missing
              ? "스냅샷 누락"
              : typeof props.vm.snapshot.staleDays === "number"
                ? `${props.vm.snapshot.staleDays}일 경과`
                : "정상"}
          </p>
        </div>
      </div>

      {props.vm.assumptionsLines.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-slate-800">상담 적용 가정</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.vm.assumptionsLines.map((line) => (
              <span className="rounded-full border border-[#d7e3f5] bg-white px-3 py-1.5 text-xs text-slate-700" key={line}>
                {line}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex items-center rounded-xl border border-[#9bb6d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d4f83] hover:bg-[#eff6ff]"
          href={props.currentReportHref}
        >
          운영 리포트 이동
        </Link>
        <a
          className="inline-flex items-center rounded-xl border border-[#9bb6d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d4f83] hover:bg-[#eff6ff]"
          href={`/api/planning/v2/runs/${encodeURIComponent(props.run.id)}/report`}
          rel="noopener noreferrer"
          target="_blank"
        >
          원문 HTML
        </a>
      </div>
    </Card>
  );
}

function ActionsPanel({ vm }: { vm: ReportVM }) {
  const actions = vm.actionRows.slice(0, 3);

  return (
    <Card className="space-y-5 border-[#d6dee9] bg-[#f8fbff] p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black text-[#0f172a]">담당 설계사 권장 실행순서</h3>
        <span className="rounded-full border border-[#d7e3f5] bg-white px-3 py-1 text-[11px] font-semibold text-[#1d4f83]">Top 3</span>
      </div>
      {actions.length < 1 ? (
        <p className="text-sm text-slate-600">표시할 액션이 없습니다.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {actions.map((action, index) => (
            <article className={`rounded-2xl border-2 p-4 shadow-sm ring-1 ring-white md:p-5 ${severityTone(action.severity)}`} key={`${action.code}:${index}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Priority {index + 1} · {severityLabel(action.severity)}
              </p>
              <h4 className="mt-2 text-lg font-black tracking-[-0.02em] text-[#0f172a]">{action.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-800">{action.summary}</p>
              {action.steps.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {action.steps.slice(0, 2).map((step) => (
                    <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700" key={`${action.code}:${step}`}>
                      {step}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function MonthlyOperatingPanel({ vm }: { vm: ReportVM }) {
  return (
    <Card className="space-y-5 border-[#d6dee9] bg-[#f8fbff] p-5 md:p-6">
      <div>
        <h3 className="text-lg font-black text-[#0f172a]">월 소득 배분 설계안</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">고정비를 먼저 확보한 뒤 남는 돈을 비상금, 목표, 여유예산으로 나눈 제안입니다.</p>
      </div>
      {vm.monthlyOperatingGuide ? (
        <>
          <div className="rounded-xl border border-[#d7e3f5] bg-white p-4">
            <p className="text-base font-black text-[#0f172a]">{vm.monthlyOperatingGuide.headline}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{vm.monthlyOperatingGuide.basisLabel}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {vm.monthlyOperatingGuide.nextPlan.map((item) => (
              <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4 shadow-sm shadow-slate-200/60 ring-1 ring-white" key={item.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#335c88]">{item.title}</p>
                <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-[#081229]">{typeof item.amountKrw === "number" ? formatMoney(item.amountKrw) : "-"}</p>
                {typeof item.sharePct === "number" ? (
                  <p className="mt-1 text-sm text-slate-700">비중 {formatPercent(item.sharePct)}</p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.description}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          현재 run에는 월급 운영 가이드를 만들기 위한 기초 수치가 부족합니다.
        </div>
      )}
    </Card>
  );
}

function GoalsAndRiskSection({ vm }: { vm: ReportVM }) {
  const warnings = vm.warningAgg.slice(0, 8);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="space-y-4 border-[#d6dee9] bg-[#f8fbff] p-5">
        <div>
          <h3 className="text-base font-black text-[#0f172a]">목표 진행 현황</h3>
          <p className="mt-1 text-xs text-slate-700">기한 임박·부족액 큰 목표를 우선 모니터링하는 구조입니다.</p>
        </div>
        {vm.goalsTable.length < 1 ? (
          <p className="text-sm text-slate-600">등록된 목표가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#d7e3f5] bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-[#f2f7ff]">
                <tr>
                  <th className="px-3 py-2 text-left">목표</th>
                  <th className="px-3 py-2 text-right">기한</th>
                  <th className="px-3 py-2 text-right">부족액</th>
                  <th className="px-3 py-2 text-left">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {vm.goalsTable.map((goal, index) => (
                  <tr key={`${goal.name}:${index}`}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{goal.name}</td>
                    <td className="px-3 py-2 text-right">{goal.targetMonth > 0 ? formatMonths("ko-KR", goal.targetMonth) : "-"}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(goal.shortfall)}</td>
                    <td className="px-3 py-2">{goal.achieved ? "달성" : goal.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-4 border-[#d6dee9] bg-[#f8fbff] p-5">
        <div>
          <h3 className="text-base font-black text-[#0f172a]">리스크 점검 결과</h3>
          <p className="mt-1 text-xs text-slate-700">반복 발생 경고와 고심각도 항목을 우선 점검합니다.</p>
        </div>
        {warnings.length < 1 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            현재 run에서는 눈에 띄는 반복 경고가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#d7e3f5] bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-[#f2f7ff]">
                <tr>
                  <th className="px-3 py-2 text-left">경고</th>
                  <th className="px-3 py-2 text-left">심각도</th>
                  <th className="px-3 py-2 text-right">횟수</th>
                  <th className="px-3 py-2 text-left">설명</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {warnings.map((warning) => (
                  <tr key={`${warning.code}:${warning.subjectKey ?? "-"}`}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{warning.title}</p>
                      <p className="text-[11px] text-slate-500">{warning.code}</p>
                    </td>
                    <td className="px-3 py-2">{warning.severityMax}</td>
                    <td className="px-3 py-2 text-right">{warning.count.toLocaleString("ko-KR")}</td>
                    <td className="px-3 py-2 text-slate-700">{warning.plainDescription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ScenarioPanel({ vm }: { vm: ReportVM }) {
  const blockingReasons = scenarioReadyReasons(vm);
  const canExploreScenarios = canUseScenarioChoices(vm);

  return (
    <Card className="space-y-4 border-[#d6dee9] bg-[#f8fbff] p-5">
      <div>
        <h3 className="text-base font-black text-[#0f172a]">전략 시나리오 비교</h3>
        <p className="mt-1 text-xs text-slate-700">상품/배분 선택에 따른 예상 차이를 기준 시나리오와 함께 비교합니다.</p>
      </div>
      {!canExploreScenarios ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">지금은 시나리오보다 현재 구조 정리가 먼저입니다.</p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">
            {blockingReasons.map((reason) => (
              <li key={reason}>- {reason}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-amber-900">
            흑자 전환, 비상금 확보, 부채 부담 완화가 어느 정도 된 뒤에야 `예금 유지 vs 일부 투자`, `부채상환 우선 vs 목표저축 우선` 같은 선택 비교가 의미를 가집니다.
          </p>
        </div>
      ) : vm.scenarioRows.length < 1 ? (
        <p className="text-sm text-slate-600">현재 run에는 별도 비교 시나리오가 없습니다.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#d7e3f5] bg-white p-4 text-sm text-slate-700">
            <p className="font-semibold text-[#0f172a]">상담 해석 가이드</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              아래 시나리오는 실제로 자산배분 버튼을 누른 결과가 아니라, 그런 선택에 가까운 가정을 적용했을 때 결과가 어떻게 달라지는지 보는 비교입니다.
            </p>
          </div>

          <div className="grid gap-4">
            {vm.scenarioRows.map((row) => {
              const meta = scenarioChoiceMeta(row.title);
              return (
                <article className="rounded-2xl border border-[#d7e3f5] bg-white p-5 shadow-sm shadow-slate-200/60 ring-1 ring-white" key={row.id}>
                  <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                            {meta.badge}
                          </span>
                          <h4 className="mt-3 text-base font-bold text-slate-900">{meta.title}</h4>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">목표 달성</p>
                          <p className="text-lg font-black text-slate-950">{row.goalsAchievedCount.toLocaleString("ko-KR")}</p>
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-slate-700">{meta.summary}</p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">가정 해석</p>
                        <p className="mt-2 text-xs leading-5 text-slate-700">{meta.assumptionsHint}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#dbe7f8] bg-[#f4f8ff] p-3 text-sm">
                        <div>
                          <p className="text-[11px] text-slate-500">말기 순자산</p>
                          <p className="font-semibold text-slate-900">{formatMoney(row.endNetWorthKrw)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">기준 대비 변화</p>
                          <p className={`font-semibold ${scenarioDeltaTone(row.endNetWorthDeltaKrw)}`}>
                            {row.endNetWorthDeltaKrw === 0 ? "-" : `${row.endNetWorthDeltaKrw > 0 ? "+" : "-"}${formatMoney(Math.abs(row.endNetWorthDeltaKrw))}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">최저 현금</p>
                          <p className="font-semibold text-slate-900">{formatMoney(row.worstCashKrw)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">경고 수</p>
                          <p className="font-semibold text-slate-900">{row.warningsCount.toLocaleString("ko-KR")}</p>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-xl border border-[#d7e3f5] bg-white p-3 text-xs leading-5 text-slate-700">
                        <p><span className="font-semibold text-slate-900">누가 볼 만한가:</span> {meta.whoFor}</p>
                        <p><span className="font-semibold text-slate-900">주의할 점:</span> {meta.riskNote}</p>
                        <p><span className="font-semibold text-slate-900">결과 해석:</span> {buildScenarioInterpretation(vm, row)}</p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function RetirementPanel({ vm }: { vm: ReportVM }) {
  return (
    <Card className="space-y-4 border-[#d6dee9] bg-[#f8fbff] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-[#0f172a]">은퇴 계획 / 몬테카를로</h3>
          <p className="mt-1 text-xs text-slate-700">평균 수치보다 하방(P10)에서 버틸 수 있는지 중심으로 확인합니다.</p>
        </div>
        {vm.monteProbabilityRows.length > 0 ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            확률 분석 포함
          </span>
        ) : null}
      </div>

      {vm.monteProbabilityRows.length < 1 && vm.montePercentileRows.length < 1 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          현재 run에는 몬테카를로 결과가 없습니다. 은퇴 목표를 더 명확히 두거나 장기 시뮬레이션 옵션이 켜진 실행에서 값이 나옵니다.
        </div>
      ) : (
        <>
          {vm.monteProbabilityRows.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {vm.monteProbabilityRows.map((row) => (
                <article className="rounded-2xl border border-[#d7e3f5] bg-white p-4 shadow-sm shadow-slate-200/60 ring-1 ring-white" key={row.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{row.label}</p>
                  <p className="mt-2 text-2xl font-black text-slate-950">{row.value}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{row.interpretation}</p>
                </article>
              ))}
            </div>
          ) : null}

          {vm.montePercentileRows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[#d7e3f5] bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-[#f2f7ff]">
                  <tr>
                    <th className="px-3 py-2 text-left">지표</th>
                    <th className="px-3 py-2 text-right">P10</th>
                    <th className="px-3 py-2 text-right">P50</th>
                    <th className="px-3 py-2 text-right">P90</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {vm.montePercentileRows.map((row) => (
                    <tr key={row.metric}>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.metric}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.p10)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.p50)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.p90)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {vm.monteCarloSummary?.notes?.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700">해석 메모</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                {vm.monteCarloSummary.notes.map((note) => (
                  <li key={note}>- {note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default function PlanningReportsPrototypeClient(props: PlanningReportsPrototypeClientProps) {
  const searchParams = useSearchParams();
  const profileId = props.initialProfileId ?? "";
  const queryRunId = asString(searchParams.get("runId"));
  const preferredRunId = queryRunId || props.initialRunId || "";
  const initialPreferredRun = useMemo(
    () => props.initialRuns?.find((run) => run.id === preferredRunId) ?? null,
    [preferredRunId, props.initialRuns],
  );
  const [runs, setRuns] = useState<PlanningRunRecord[]>(props.initialRuns ?? []);
  const [selectedRunId, setSelectedRunId] = useState(() => resolveSelectedRunId(props.initialRuns ?? [], preferredRunId));
  const [activeCategory, setActiveCategory] = useState<PrototypeCategoryId>("coach");
  const [loading, setLoading] = useState((props.initialRuns?.length ?? 0) < 1);
  const [error, setError] = useState("");

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );
  const selectedRunVmBase = useMemo(
    () => (
      selectedRun
        ? safeBuildReportVMFromRun(selectedRun, {
          id: selectedRun.id,
          runId: selectedRun.id,
          createdAt: selectedRun.createdAt,
        })
        : { vm: null, error: null }
    ),
    [selectedRun],
  );
  const selectedRunVmState = useMemo(
    () => (selectedRunVmBase.vm ? hydratePrototypeVmWithTempValues(selectedRunVmBase.vm) : null),
    [selectedRunVmBase],
  );
  const selectedRunVm = selectedRunVmState?.vm ?? null;
  const selectedRunVmError = selectedRunVmBase.error;
  const planningHref = useMemo(
    () => appendProfileIdQuery("/planning", profileId),
    [profileId],
  );
  const currentReportHref = useMemo(
    () => {
      const params = new URLSearchParams();
      if (selectedRunId) params.set("runId", selectedRunId);
      if (profileId) params.set("profileId", profileId);
      const query = params.toString();
      return query ? `/planning/reports?${query}` : "/planning/reports";
    },
    [profileId, selectedRunId],
  );
  const activeCategoryMeta = useMemo(
    () => CATEGORY_TABS.find((tab) => tab.id === activeCategory) ?? CATEGORY_TABS[0],
    [activeCategory],
  );

  useEffect(() => {
    let active = true;

    async function loadRuns(): Promise<void> {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (profileId) params.set("profileId", profileId);
        const response = await fetch(`/api/planning/v2/runs?${params.toString()}`, { cache: "no-store" });
        const rawPayload = await response.json().catch(() => null);
        const payload = parsePlanningV2Response<PlanningRunRecord[]>(rawPayload);
        if (!active) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
          setRuns([]);
          setSelectedRunId("");
          setError(payload.ok ? "실행 기록을 불러오지 못했습니다." : (payload.error.message ?? "실행 기록을 불러오지 못했습니다."));
          return;
        }
        const nextRuns = mergeRunListWithPreferredRun(payload.data, initialPreferredRun);
        if (nextRuns.length < 1) {
          const demoRun = buildPrototypeDemoRun(profileId);
          setRuns([demoRun]);
          setSelectedRunId(demoRun.id);
          return;
        }
        setRuns(nextRuns);
        const nextSelectedRunId = resolveSelectedRunId(nextRuns, preferredRunId);
        setSelectedRunId(nextSelectedRunId);
      } catch (loadError) {
        if (!active) return;
        setRuns([]);
        setSelectedRunId("");
        setError(loadError instanceof Error ? loadError.message : "실행 기록 조회 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRuns();
    return () => {
      active = false;
    };
  }, [initialPreferredRun, preferredRunId, profileId]);

  return (
    <PageShell className="space-y-6">
      <PageHeader
        title="MMD 재무설계 상담 프로토타입"
        description="최소 입력만 받고 자동으로 진단과 실행오더를 만드는 상담형 프로토타입입니다."
        action={(
          <div className="flex items-center gap-3 text-sm">
            <Link className="font-semibold text-emerald-700" href={currentReportHref}>기존 리포트</Link>
            <Link className="font-semibold text-emerald-700" href={planningHref}>플래닝</Link>
          </div>
        )}
      />

      {props.initialLoadNotice && loading ? (
        <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {props.initialLoadNotice}
        </Card>
      ) : null}
      {loading ? <LoadingState title="실행 기록을 불러오는 중입니다" /> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && runs.length < 1 ? (
        <EmptyState
          title="저장된 실행 기록이 없습니다"
          description="/planning에서 실행 후 저장하면 이 프로토타입 화면에서 리포트를 확인할 수 있습니다."
          icon="data"
        />
      ) : null}
      {!loading && !error && selectedRun && !selectedRunVm && selectedRunVmError ? (
        <ErrorState message={`선택한 실행의 프로토타입 리포트를 구성하지 못했습니다. ${selectedRunVmError}`} />
      ) : null}

      {!loading && !error && selectedRun && selectedRunVm ? (
        <div className="space-y-6">
          <Card className="space-y-5 overflow-hidden border-[#1a3761] bg-[linear-gradient(135deg,#0f1e3b_0%,#0c2f4f_52%,#093951_100%)] p-5 text-white md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9ac5ff]">MMD Wealth Advisory Prototype</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-white">재무설계 상담 리포트</h2>
                <p className="mt-3 text-base leading-7 text-[#d9e9ff]">
                  입력은 최소화하고, 판단은 자동화하고, 실행은 바로 시작할 수 있게 정리한 화면입니다.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">입력 최소화: 2~3개</span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">자동 진단 로그</span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">우선 실행오더 즉시 제시</span>
                </div>
                {selectedRunVmState?.hasFallback ? (
                  <p className="mt-2 inline-flex items-center rounded-full border border-amber-200/70 bg-amber-100/90 px-3 py-1 text-xs font-semibold text-amber-900">
                    임시 결과값 적용 중: {selectedRunVmState.fallbackKeys.join(", ")}
                  </p>
                ) : null}
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(selectedRun.overallStatus)}`}>
                {statusLabel(selectedRun.overallStatus)}
              </span>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b6d3ff]">상담 기준 정보</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">분석 엔진: Planning v2</span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">통화: KRW</span>
                  <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[#e6f1ff]">업데이트: {formatDateTime(selectedRun.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-start gap-3 lg:justify-end">
                <label className="text-xs font-semibold text-[#d9e9ff]" htmlFor="prototype-run-selector">
                  실행 선택
                </label>
                <select
                  className="h-10 min-w-[280px] rounded-xl border border-white/35 bg-[#eef4ff] px-3 text-sm text-[#0f172a]"
                  id="prototype-run-selector"
                  value={selectedRunId}
                  onChange={(event) => setSelectedRunId(event.target.value)}
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {`${run.title?.trim() || `실행 ${run.id}`} · ${formatDateTime(run.createdAt)}`}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => window.print()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  PDF 인쇄
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CATEGORY_TABS.map((tab) => {
                  const active = tab.id === activeCategory;
                  return (
                    <button
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-white/70 bg-white text-[#0f172a]"
                          : "border-white/30 bg-white/10 text-[#e6f1ff] hover:bg-white/20"
                      }`}
                      key={tab.id}
                      onClick={() => setActiveCategory(tab.id)}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-[#e6f1ff]">
                <span className="font-semibold text-white">{activeCategoryMeta.label}</span> {activeCategoryMeta.summary}
              </div>
            </div>
          </Card>
          {activeCategory === "coach" ? (
            <PrototypeSection
              description="이번 달 무엇부터 처리해야 하는지 먼저 보여주는 메인 코칭 화면입니다."
              eyebrow="Autopilot Advisory"
              id="prototype-autopilot"
              step="STEP 01"
              title="이번 달 코칭"
            >
              <div className="space-y-4">
                <AutopilotFlowPanel vm={selectedRunVm} />
                <ActionsPanel vm={selectedRunVm} />
              </div>
            </PrototypeSection>
          ) : null}

          {activeCategory === "data" ? (
            <PrototypeSection
              description="엔진이 자동으로 읽어 판단에 사용한 정보와 기준만 짧게 정리합니다."
              eyebrow="Collection Status"
              id="prototype-collection"
              step="STEP 02"
              title="자동 수집 현황"
            >
              <div className="space-y-4">
                <CollectionStatusPanel vm={selectedRunVm} />
                <RunContextPanel currentReportHref={currentReportHref} run={selectedRun} vm={selectedRunVm} />
              </div>
            </PrototypeSection>
          ) : null}

          {activeCategory === "flow" ? (
            <PrototypeSection
              description="현재 돈이 어디서 들어오고 어디로 나가는지부터 먼저 봅니다."
              eyebrow="Money Flow"
              id="prototype-overview"
              step="STEP 03"
              title="돈 흐름 맵"
            >
              <div className="space-y-4">
                <OverviewSection vm={selectedRunVm} />
                <MonthlyOperatingPanel vm={selectedRunVm} />
              </div>
            </PrototypeSection>
          ) : null}

          {activeCategory === "offers" ? (
            <PrototypeSection
              description="현재 상황에서 왜 이 상품과 혜택을 볼 만한지 함께 보여줍니다."
              eyebrow="Product & Benefit Match"
              id="prototype-recommend"
              step="STEP 04"
              title="상품/혜택 제안"
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="min-w-0">
                  <ReportRecommendationsSection runId={selectedRun.id} vm={selectedRunVm} />
                </div>
                <div className="min-w-0">
                  <ReportBenefitsSection profileId={selectedRun.profileId} vm={selectedRunVm} />
                </div>
              </div>
            </PrototypeSection>
          ) : null}

          {activeCategory === "risk" ? (
            <PrototypeSection
              description="반복되는 위험 신호와 목표 부족 구간을 한 번에 점검합니다."
              eyebrow="Risk & Goal Review"
              id="prototype-goals"
              step="STEP 05"
              title="위험/목표 점검"
            >
              <GoalsAndRiskSection vm={selectedRunVm} />
            </PrototypeSection>
          ) : null}

          {activeCategory === "scenarios" ? (
            <PrototypeSection
              description="선택안 비교와 은퇴 하방 위험을 분리해 검증합니다."
              eyebrow="Scenario Lab"
              id="prototype-scenarios"
              step="STEP 06"
              title="시나리오/은퇴 검증"
            >
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <ScenarioPanel vm={selectedRunVm} />
                <RetirementPanel vm={selectedRunVm} />
              </div>
            </PrototypeSection>
          ) : null}

          {activeCategory === "evidence" ? (
            <PrototypeSection
              description="원문 데이터와 세부 비교표로 판단 근거를 마지막에 확인합니다."
              eyebrow="Evidence"
              id="prototype-advanced"
              step="STEP 07"
              title="원문 검증"
            >
              <div className="grid gap-4">
                <CandidateComparisonSection runId={selectedRun.id} showEstimateEvidence={false} />
                <ReportAdvancedRaw
                  raw={{
                    reportMarkdown: selectedRunVm.raw?.reportMarkdown,
                    runJson: selectedRunVm.raw?.runJson ?? selectedRun,
                  }}
                  reproducibility={selectedRunVm.reproducibility}
                />
              </div>
            </PrototypeSection>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
