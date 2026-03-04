import { noRecommendationText, sanitizeNoRecommendationText } from "../../../src/lib/news/noRecommendation";
import { type ExposureProfile } from "../exposure/contracts";
import {
  type ImpactResult,
  type IndicatorGrade,
  type RiskGrade,
  type ScenarioForImpact,
} from "./contracts";

type ComputeImpactInput = {
  profile: ExposureProfile | null;
  scenario: ScenarioForImpact;
  indicatorGrades?: Record<string, IndicatorGrade>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = asString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function sanitizeLine(value: string): string {
  return sanitizeNoRecommendationText(asString(value));
}

function combineRisk(a: RiskGrade, b: RiskGrade): RiskGrade {
  const order: Record<RiskGrade, number> = {
    Unknown: 0,
    Low: 1,
    Med: 2,
    High: 3,
  };
  return order[a] >= order[b] ? a : b;
}

function normalizeTopicIds(scenario: ScenarioForImpact): Set<string> {
  const out = new Set(
    scenario.linkedTopics
      .map((row) => asString(row).toLowerCase())
      .filter(Boolean),
  );

  const hint = `${asString(scenario.observation)} ${asString(scenario.triggerSummary)}`.toLowerCase();
  if (hint.includes("금리")) out.add("rates");
  if (hint.includes("물가") || hint.includes("인플레")) out.add("inflation");
  if (hint.includes("원자재") || hint.includes("유가")) out.add("commodities");
  if (hint.includes("환율") || hint.includes("외환")) out.add("fx");
  if (hint.includes("경기")) out.add("growth");

  return out;
}

function hasIndicator(
  grades: Record<string, IndicatorGrade>,
  seriesIds: string[],
  wanted: IndicatorGrade[],
): boolean {
  const set = new Set(wanted);
  return seriesIds.some((seriesId) => {
    const grade = grades[asString(seriesId).toLowerCase()];
    return grade ? set.has(grade) : false;
  });
}

function unknownImpact(watch: string[]): ImpactResult {
  return {
    cashflowRisk: "Unknown",
    debtServiceRisk: "Unknown",
    inflationPressureRisk: "Unknown",
    fxPressureRisk: "Unknown",
    incomeRisk: "Unknown",
    bufferAdequacy: "Unknown",
    rationale: ["노출 프로필이 없어 개인 영향은 unknown으로 유지됩니다."],
    watch,
  };
}

export function computeImpact(input: ComputeImpactInput): ImpactResult {
  const watch = dedupe([
    ...input.scenario.confirmIndicators,
    ...input.scenario.leadingIndicators,
  ].map((row) => asString(row).toLowerCase())).slice(0, 8);

  if (!input.profile) {
    const out = unknownImpact(watch);
    if (!out.rationale.every((line) => noRecommendationText(line))) {
      throw new Error("recommendation_language_detected");
    }
    return out;
  }

  const topics = normalizeTopicIds(input.scenario);
  const grades = Object.fromEntries(
    Object.entries(input.indicatorGrades ?? {}).map(([key, value]) => [asString(key).toLowerCase(), value]),
  );

  const ratesHot =
    topics.has("rates")
    && (input.scenario.triggerStatus === "met" || hasIndicator(grades, ["kr_base_rate"], ["up", "high"]));
  const inflationHot =
    (topics.has("inflation") || topics.has("commodities"))
    && (input.scenario.triggerStatus === "met" || hasIndicator(grades, ["kr_cpi", "us_cpi"], ["up", "high"]));
  const fxHot =
    topics.has("fx")
    && (input.scenario.triggerStatus === "met" || hasIndicator(grades, ["kr_usdkrw"], ["up", "high"]));

  let debtServiceRisk: RiskGrade = "Unknown";
  if (input.profile.debt.hasDebt === "no" || input.profile.debt.rateType === "none") {
    debtServiceRisk = "Low";
  } else if (ratesHot && (input.profile.debt.rateType === "variable" || input.profile.debt.repricingHorizon === "short")) {
    debtServiceRisk = "High";
  } else if (ratesHot && (input.profile.debt.rateType === "mixed" || input.profile.debt.repricingHorizon === "medium")) {
    debtServiceRisk = "Med";
  } else if (input.profile.debt.hasDebt === "yes") {
    debtServiceRisk = "Low";
  }

  let inflationPressureRisk: RiskGrade = "Unknown";
  if (inflationHot && (input.profile.inflation.essentialExpenseShare === "high" || input.profile.inflation.energyShare === "high")) {
    inflationPressureRisk = "High";
  } else if (inflationHot && (input.profile.inflation.essentialExpenseShare === "medium" || input.profile.inflation.energyShare === "medium")) {
    inflationPressureRisk = "Med";
  } else if (input.profile.inflation.essentialExpenseShare !== "unknown" || input.profile.inflation.energyShare !== "unknown") {
    inflationPressureRisk = "Low";
  }

  let fxPressureRisk: RiskGrade = "Unknown";
  if (fxHot && input.profile.fx.foreignConsumption === "high") {
    fxPressureRisk = "High";
  } else if (fxHot && input.profile.fx.foreignConsumption === "medium") {
    fxPressureRisk = "Med";
  } else if (input.profile.fx.foreignConsumption !== "unknown") {
    fxPressureRisk = "Low";
  }

  let incomeRisk: RiskGrade = "Unknown";
  if (input.profile.income.incomeStability === "fragile") incomeRisk = "High";
  else if (input.profile.income.incomeStability === "moderate") incomeRisk = "Med";
  else if (input.profile.income.incomeStability === "stable") incomeRisk = "Low";

  let bufferAdequacy: RiskGrade = "Unknown";
  if (input.profile.liquidity.monthsOfCashBuffer === "low") bufferAdequacy = "Low";
  else if (input.profile.liquidity.monthsOfCashBuffer === "medium") bufferAdequacy = "Med";
  else if (input.profile.liquidity.monthsOfCashBuffer === "high") bufferAdequacy = "High";

  const riskCore = [debtServiceRisk, inflationPressureRisk, fxPressureRisk, incomeRisk].filter((row) => row !== "Unknown");
  let cashflowRisk: RiskGrade = riskCore.length > 0 ? riskCore.reduce(combineRisk, "Low") : "Unknown";

  if (bufferAdequacy === "Low") {
    cashflowRisk = cashflowRisk === "High" ? "High" : cashflowRisk === "Med" ? "High" : cashflowRisk === "Low" ? "Med" : "Unknown";
  }

  const rationale: string[] = [];
  if (debtServiceRisk === "High") rationale.push("변동/단기 재조정 부채 노출로 금리 상방 구간에서 상환 압력이 커질 수 있습니다.");
  if (inflationPressureRisk === "High") rationale.push("필수지출/에너지 비중이 높아 물가 충격 체감이 확대될 수 있습니다.");
  if (fxPressureRisk === "High") rationale.push("해외소비 노출이 커 환율 상승 구간의 영향 범위가 넓어질 수 있습니다.");
  if (bufferAdequacy === "Low") rationale.push("현금완충력이 낮아 충격 흡수 여지가 제한될 수 있습니다.");
  if (rationale.length < 1) rationale.push("현재 입력 기준에서는 고강도 개인 압력 신호가 제한적입니다.");

  const out: ImpactResult = {
    cashflowRisk,
    debtServiceRisk,
    inflationPressureRisk,
    fxPressureRisk,
    incomeRisk,
    bufferAdequacy,
    rationale: dedupe(rationale.map(sanitizeLine)).slice(0, 5),
    watch,
  };

  if (!out.rationale.every((line) => noRecommendationText(line))) {
    throw new Error("recommendation_language_detected");
  }

  return out;
}
