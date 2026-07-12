import {
  computeCandidateComparison,
  type CandidateComparisonRow,
  type CandidateGoalContext,
  type CandidateKind,
  type CandidateProfileContext,
  type CandidateVM,
} from "@/lib/planning/candidates/comparison";
import { scoreBenefits, type BenefitRecommendProfile, type ScoredBenefit } from "@/lib/recommend/scoreBenefits";
import { type BenefitCandidate } from "@/lib/publicApis/contracts/types";
import { BENEFIT_TOPICS, type BenefitTopicKey } from "@/lib/publicApis/benefitsTopics";
import { type ReportVM } from "./reportViewModel";

export type CandidateRecommendationsPayload = {
  runId: string;
  profileId: string;
  kind: "all" | CandidateKind;
  candidates: CandidateVM[];
  profileContext: CandidateProfileContext;
  goals: CandidateGoalContext[];
  defaults: {
    amountKrw: number;
    termMonths: number;
    taxRatePct: number;
  };
  fetchedAt: string;
};

export type PlanningRecommendationSignals = {
  priority: "recover" | "emergency" | "goal" | "buffer";
  headline: string;
  summary: string;
  recommendedKinds: CandidateKind[];
  preferredTermMonths: number[];
  comparisonAmountKrw: number;
  taxRatePct: number;
  reasons: string[];
  cautions: string[];
};

export type RankedPlanningProductRecommendation = CandidateComparisonRow & {
  fitScore: number;
  fitSummary: string;
  fitBadges: string[];
};

export type PlanningBenefitSignals = {
  headline: string;
  summary: string;
  topics: BenefitTopicKey[];
  query?: string;
  profileContext?: {
    age?: number;
    gender?: "M" | "F";
    sido?: string;
    sigungu?: string;
  };
  reasons: string[];
  limitations: string[];
};

export type PlanningBenefitProfileContext = {
  currentAge?: number;
  birthYear?: number;
  gender?: "M" | "F";
  sido?: string;
  sigungu?: string;
};

const TERM_BUCKETS = [3, 6, 12, 24, 36] as const;
type TermBucket = (typeof TERM_BUCKETS)[number];

function uniqueNumbers(values: number[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const normalized = Math.max(1, Math.trunc(value));
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function pickNearestTermBucket(target: number): TermBucket {
  let picked: TermBucket = TERM_BUCKETS[0];
  let minDiff = Number.POSITIVE_INFINITY;
  for (const bucket of TERM_BUCKETS) {
    const diff = Math.abs(bucket - target);
    if (diff < minDiff) {
      minDiff = diff;
      picked = bucket;
    }
  }
  return picked;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function kindLabel(kind: CandidateKind): string {
  return kind === "deposit" ? "예금" : "적금";
}

function primaryGoal(vm: ReportVM): ReportVM["goalsTable"][number] | undefined {
  return [...vm.goalsTable]
    .filter((goal) => goal.achieved !== true)
    .sort((left, right) => {
      const leftMonth = typeof left.targetMonth === "number" && left.targetMonth > 0 ? left.targetMonth : Number.POSITIVE_INFINITY;
      const rightMonth = typeof right.targetMonth === "number" && right.targetMonth > 0 ? right.targetMonth : Number.POSITIVE_INFINITY;
      if (leftMonth !== rightMonth) return leftMonth - rightMonth;
      return (right.shortfall ?? 0) - (left.shortfall ?? 0);
    })[0];
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function toSignalCorpus(vm: ReportVM): string {
  const parts = [
    ...(vm.goalsTable ?? []).map((goal) => `${goal.name} ${goal.comment ?? ""}`),
    ...(vm.warningAgg ?? []).map((warning) => `${warning.title} ${warning.plainDescription} ${warning.sampleMessage ?? ""}`),
    ...(vm.actionRows ?? []).map((action) => `${action.title} ${action.summary}`),
  ];
  return parts.join(" ").toLowerCase();
}

function resolveCurrentAge(profile?: PlanningBenefitProfileContext): number | undefined {
  if (!profile) return undefined;
  if (typeof profile.currentAge === "number" && Number.isFinite(profile.currentAge)) {
    return Math.max(0, Math.trunc(profile.currentAge));
  }
  if (typeof profile.birthYear === "number" && Number.isFinite(profile.birthYear)) {
    return Math.max(0, new Date().getFullYear() - Math.trunc(profile.birthYear));
  }
  return undefined;
}

export function buildPlanningBenefitSignals(
  vm: ReportVM,
  profile?: PlanningBenefitProfileContext,
): PlanningBenefitSignals {
  const corpus = toSignalCorpus(vm);
  const topics: BenefitTopicKey[] = [];
  const age = resolveCurrentAge(profile);
  const sido = profile?.sido?.trim();
  const sigungu = profile?.sigungu?.trim();
  const gender = profile?.gender;

  if (containsAny(corpus, ["주거", "주택", "청약", "이사", "집"])) topics.push("housing");
  if (containsAny(corpus, ["전세", "임차", "보증금"])) {
    topics.push("housing");
    topics.push("jeonse");
  }
  if (containsAny(corpus, ["월세", "임대료", "주거급여"])) {
    topics.push("housing");
    topics.push("wolse");
  }
  if (containsAny(corpus, ["청년", "사회초년", "청년도약", "청년내일"])) topics.push("youth");
  if (containsAny(corpus, ["취업", "구직", "실업", "채용", "직업훈련"])) topics.push("job");
  if (containsAny(corpus, ["교육", "학자금", "등록금", "학교", "대학"])) topics.push("education");
  if (containsAny(corpus, ["의료", "병원", "건강", "수술", "치료"])) topics.push("medical");
  if (containsAny(corpus, ["출산", "육아", "양육", "임신", "신생아"])) topics.push("birth");
  if (typeof age === "number" && age <= 34) topics.push("youth");

  const normalizedTopics: BenefitTopicKey[] = topics.length > 0
    ? Array.from(new Set(topics))
    : ["housing", "job"];
  const ageQuery = typeof age === "number"
    ? age <= 34
      ? "청년"
      : age >= 65
        ? "고령자"
        : undefined
    : undefined;
  const query = ageQuery;

  const labels = normalizedTopics.map((topic) => BENEFIT_TOPICS[topic].label);
  const headline = topics.length > 0
    ? `현재 플래닝 결과와 맞닿아 있는 혜택 주제(${labels.join(", ")})를 먼저 골랐습니다.`
    : "개인 조건 정보가 제한적이어서 주거/취업 중심 혜택을 먼저 넓게 보여줍니다.";
  const profileSummary = [
    typeof age === "number" ? `${age}세 기준` : "",
    gender === "F" ? "여성" : gender === "M" ? "남성" : "",
    sigungu && sido ? `${sido} ${sigungu}` : (sido ?? ""),
  ].filter((entry) => entry.length > 0).join(" · ");
  const summary = topics.length > 0
    ? profileSummary
      ? `목표/경고/액션 문구와 기본 프로필(${profileSummary})을 함께 반영해 보조금24 후보를 정리했습니다.`
      : "목표/경고/액션 문구에서 추출한 주제를 기준으로 보조금24 후보를 정리했습니다."
    : profileSummary
      ? `기본 프로필(${profileSummary})을 바탕으로 범용성이 큰 혜택부터 넓게 보여줍니다.`
      : "현재 리포트에는 지역·가구 세부정보가 부족해 전국 공통 또는 범용성이 큰 혜택부터 보여줍니다.";
  const limitations: string[] = [];
  if (!sido) limitations.push("지역 정보가 없으면 전국 공통·지역 미상 혜택 비중이 높아집니다.");
  if (typeof age !== "number") limitations.push("나이 정보가 없으면 청년/고령 특화 혜택 반영이 제한됩니다.");
  if (!gender) limitations.push("성별 정보는 저장할 수 있지만 현재는 일부 혜택에서만 간접 반영됩니다.");
  limitations.push("가구형태, 소득, 실시간 예산 소진 여부는 현재 리포트에서 완전 반영되지 않습니다.");

  return {
    headline,
    summary,
    topics: normalizedTopics,
    ...(query ? { query } : {}),
    profileContext: {
      ...(typeof age === "number" ? { age } : {}),
      ...(gender ? { gender } : {}),
      ...(sido ? { sido } : {}),
      ...(sigungu ? { sigungu } : {}),
    },
    reasons: [
      `선택 주제: ${labels.join(", ")}`,
      ...(profileSummary ? [`기본 프로필 기준: ${profileSummary}`] : []),
      "혜택 카드는 실제 수급 확정이 아니라 검토 우선순위를 정하는 용도입니다.",
    ],
    limitations,
  };
}

export function rankPlanningBenefitRecommendations(
  vm: ReportVM,
  items: BenefitCandidate[],
  limit = 5,
  profileContext?: PlanningBenefitProfileContext,
): {
  signals: PlanningBenefitSignals;
  rows: ScoredBenefit[];
} {
  const signals = buildPlanningBenefitSignals(vm, profileContext);
  const profile: BenefitRecommendProfile = {
    topics: signals.topics,
    query: signals.query,
    sido: signals.profileContext?.sido,
    sigungu: signals.profileContext?.sigungu,
    includeNationwide: true,
    includeUnknown: true,
    topN: Math.max(1, limit),
  };

  return {
    signals,
    rows: scoreBenefits(items, profile),
  };
}

export function buildPlanningRecommendationSignals(
  vm: ReportVM,
  payload: CandidateRecommendationsPayload,
): PlanningRecommendationSignals {
  const monthlySurplusKrw = typeof vm.summaryCards.monthlySurplusKrw === "number" ? vm.summaryCards.monthlySurplusKrw : undefined;
  const emergencyFundMonths = typeof vm.summaryCards.emergencyFundMonths === "number" ? vm.summaryCards.emergencyFundMonths : undefined;
  const dsrPct = typeof vm.summaryCards.dsrPct === "number" ? vm.summaryCards.dsrPct : undefined;
  const goal = primaryGoal(vm);
  const goalMonth = typeof goal?.targetMonth === "number" && goal.targetMonth > 0 ? goal.targetMonth : undefined;
  const goalShortfall = typeof goal?.shortfall === "number" ? goal.shortfall : undefined;

  const baseTerm = pickNearestTermBucket(goalMonth ?? payload.defaults.termMonths);
  const liquidAssets = Math.max(0, Math.trunc(payload.profileContext.liquidAssets ?? 0));
  const defaultAmountKrw = Math.max(100_000, Math.trunc(payload.defaults.amountKrw || 10_000_000));
  const taxRatePct = Number.isFinite(payload.defaults.taxRatePct) ? payload.defaults.taxRatePct : 15.4;

  if (typeof monthlySurplusKrw === "number" && monthlySurplusKrw <= 0) {
    return {
      priority: "recover",
      headline: "지금은 새 저축보다 현금흐름 복구가 우선입니다.",
      summary: "적자 구간에서는 신규 가입을 서두르기보다 짧은 만기 후보만 비교용으로 확인하는 편이 안전합니다.",
      recommendedKinds: liquidAssets >= defaultAmountKrw ? ["deposit", "saving"] : ["saving", "deposit"],
      preferredTermMonths: uniqueNumbers([3, 6, baseTerm]),
      comparisonAmountKrw: Math.max(100_000, Math.min(defaultAmountKrw, liquidAssets || defaultAmountKrw)),
      taxRatePct,
      reasons: [
        "현재 매달 남는 돈이 0 이하라 신규 저축보다 적자 해소가 우선입니다.",
        "긴 만기 상품보다 짧은 만기 후보를 먼저 비교하도록 가중치를 조정했습니다.",
      ],
      cautions: [
        "후보는 비교용입니다. 실제 가입 전 현금흐름 복구 여부를 먼저 점검하세요.",
      ],
    };
  }

  if (typeof emergencyFundMonths === "number" && emergencyFundMonths < 3) {
    return {
      priority: "emergency",
      headline: "비상금 보강용 후보를 먼저 비교했습니다.",
      summary: "비상금 개월 수가 낮아 유동성과 짧은 만기를 우선 반영했습니다.",
      recommendedKinds: ["saving", "deposit"],
      preferredTermMonths: uniqueNumbers([6, 12, 3]),
      comparisonAmountKrw: Math.max(100_000, Math.min(defaultAmountKrw, liquidAssets || defaultAmountKrw)),
      taxRatePct,
      reasons: [
        "비상금이 충분히 쌓이기 전에는 장기 묶임보다 접근 가능한 자금을 먼저 보는 편이 안전합니다.",
        "현재 상황에서는 단기 적금/예금 후보를 우선 점수화했습니다.",
      ],
      cautions: [
        "비상금이 3개월 미만이면 장기 고정 가입은 보수적으로 판단하세요.",
      ],
    };
  }

  if (typeof goalMonth === "number" && goalMonth <= 12) {
    const shortfallFitsDeposit = typeof goalShortfall === "number" && liquidAssets >= Math.min(goalShortfall, defaultAmountKrw);
    return {
      priority: "goal",
      headline: goal?.name
        ? `가장 가까운 목표(${goal.name})에 맞는 만기 후보를 먼저 비교했습니다.`
        : "가장 가까운 목표 시점에 맞는 만기 후보를 먼저 비교했습니다.",
      summary: "목표 만기와 가까운 상품을 우선하고, 현재 자금 여력에 따라 예금/적금 비중을 조정했습니다.",
      recommendedKinds: shortfallFitsDeposit ? ["deposit", "saving"] : ["saving", "deposit"],
      preferredTermMonths: uniqueNumbers([pickNearestTermBucket(goalMonth), baseTerm, 12]),
      comparisonAmountKrw: Math.max(100_000, defaultAmountKrw),
      taxRatePct,
      reasons: [
        "가장 가까운 목표의 남은 기간을 기준으로 적합한 만기를 우선 비교했습니다.",
        typeof goalShortfall === "number"
          ? `현재 기준 목표 부족분은 약 ${goalShortfall.toLocaleString("ko-KR")}원입니다.`
          : "목표 부족분과 현재 유동자금을 함께 보수적으로 반영했습니다.",
      ],
      cautions: dsrPct && dsrPct >= 40
        ? ["대출 상환 비중이 높아 공격적인 장기 가입은 보수적으로 판단해야 합니다."]
        : [],
    };
  }

  return {
    priority: "buffer",
    headline: "남는 돈을 안정적으로 굴릴 후보를 먼저 비교했습니다.",
    summary: "현재 현금흐름이 크게 나쁘지 않아 기본적으로 예금 우선, 적금 보조 흐름으로 비교합니다.",
    recommendedKinds: ["deposit", "saving"],
    preferredTermMonths: uniqueNumbers([baseTerm, 12, 24]),
    comparisonAmountKrw: Math.max(100_000, defaultAmountKrw),
    taxRatePct,
    reasons: [
      "현재 핵심 지표상 즉시 복구가 필요한 급한 위험보다 안정적 운영이 우선입니다.",
      "남는 돈을 한 번에 묶는 예금과 점진적으로 모으는 적금을 함께 비교했습니다.",
    ],
    cautions: [],
  };
}

export function rankPlanningProductRecommendations(
  vm: ReportVM,
  payload: CandidateRecommendationsPayload,
  limit = 3,
): {
  signals: PlanningRecommendationSignals;
  rows: RankedPlanningProductRecommendation[];
} {
  const signals = buildPlanningRecommendationSignals(vm, payload);
  const goal = primaryGoal(vm);
  const goalContext = goal
    ? payload.goals.find((item) => item.name === goal.name)
    : undefined;

  const comparedRows = computeCandidateComparison(
    payload.profileContext,
    goalContext,
    payload.candidates,
    {
      amountKrw: signals.comparisonAmountKrw,
      taxRatePct: signals.taxRatePct,
      fallbackTermMonths: signals.preferredTermMonths[0] ?? payload.defaults.termMonths,
    },
  );

  const maxRate = comparedRows.reduce((acc, row) => Math.max(acc, row.baseRatePct), 0);
  const dsrPct = typeof vm.summaryCards.dsrPct === "number" ? vm.summaryCards.dsrPct : undefined;

  const ranked = comparedRows.map((row) => {
    const preferredIndex = signals.recommendedKinds.indexOf(row.kind);
    const kindScore = preferredIndex === 0 ? 26 : preferredIndex >= 0 ? 18 : 8;
    const termDistance = Math.min(...signals.preferredTermMonths.map((term) => Math.abs(term - row.appliedTermMonths)));
    const termScore = Math.max(0, 26 - termDistance * 1.6);
    const rateScore = maxRate > 0 ? (row.baseRatePct / maxRate) * 18 : 0;
    const bonusScore = Math.min(6, Math.max(0, row.bonusRatePct ?? 0) * 2);

    let cautionPenalty = 0;
    if (signals.priority === "recover" && row.appliedTermMonths > 6) cautionPenalty += 10;
    if (signals.priority === "emergency" && row.appliedTermMonths > 12) cautionPenalty += 8;
    if (typeof dsrPct === "number" && dsrPct >= 40 && row.appliedTermMonths > 12) cautionPenalty += 5;

    const badges = [
      preferredIndex === 0 ? `${kindLabel(row.kind)} 우선` : preferredIndex >= 0 ? `${kindLabel(row.kind)} 보조` : "비교 후보",
      `${row.appliedTermMonths}개월`,
      `기본금리 ${row.baseRatePct.toFixed(2)}%`,
    ];

    return {
      ...row,
      fitScore: round1(kindScore + termScore + rateScore + bonusScore - cautionPenalty),
      fitSummary: `${kindLabel(row.kind)} · ${row.appliedTermMonths}개월 · 현재 우선순위와의 적합도를 기준으로 정렬했습니다.`,
      fitBadges: badges,
    } satisfies RankedPlanningProductRecommendation;
  });

  ranked.sort((left, right) => {
    if (right.fitScore !== left.fitScore) return right.fitScore - left.fitScore;
    if (right.estimate.netInterestKrw !== left.estimate.netInterestKrw) {
      return right.estimate.netInterestKrw - left.estimate.netInterestKrw;
    }
    return left.providerName.localeCompare(right.providerName, "ko-KR");
  });

  return {
    signals,
    rows: ranked.slice(0, Math.max(1, limit)),
  };
}
