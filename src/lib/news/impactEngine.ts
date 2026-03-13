import {
  assertNoRecommendationLines,
  sanitizeNoRecommendationText,
} from "./noRecommendation";
import {
  type ExposureLevel,
  type ExposureProfile,
  type ImpactGrade,
  type IncomeStabilityLevel,
  type NewsScenario,
  type ScenarioImpact,
} from "./types";

export type IndicatorDirectionGrade = "up" | "down" | "high" | "low" | "flat" | "unknown";

export type BuildScenarioImpactInput = {
  exposure: ExposureProfile | null;
  scenario: Pick<
    NewsScenario,
    "name" | "triggerStatus" | "observation" | "triggerSummary" | "confirmIndicators" | "leadingIndicators" | "linkedTopics"
  >;
  indicatorGrades?: Record<string, IndicatorDirectionGrade>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeLine(line: string): string {
  return sanitizeNoRecommendationText(asString(line));
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

function maxRisk(a: ImpactGrade, b: ImpactGrade): ImpactGrade {
  const rank: Record<ImpactGrade, number> = {
    Unknown: 0,
    Low: 1,
    Med: 2,
    High: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

function gradeFromExposureLevel(level: ExposureLevel | undefined, hot: boolean): ImpactGrade {
  if (!level) return "Unknown";
  if (level === "high") return hot ? "High" : "Med";
  if (level === "medium") return hot ? "Med" : "Low";
  return "Low";
}

function hasTopic(topics: Set<string>, topicId: string): boolean {
  return topics.has(asString(topicId).toLowerCase());
}

function normalizeSeriesId(value: string): string {
  return asString(value).toLowerCase();
}

function hasIndicatorSignal(
  grades: Record<string, IndicatorDirectionGrade>,
  seriesIds: string[],
  wanted: IndicatorDirectionGrade[],
): boolean {
  const wantedSet = new Set(wanted);
  for (const seriesId of seriesIds) {
    const grade = grades[normalizeSeriesId(seriesId)];
    if (!grade) continue;
    if (wantedSet.has(grade)) return true;
  }
  return false;
}

function deriveIncomeRisk(stability: IncomeStabilityLevel | undefined, hot: boolean): ImpactGrade {
  if (!stability) return "Unknown";
  if (stability === "stable") return hot ? "Med" : "Low";
  if (stability === "moderate") return hot ? "High" : "Med";
  return hot ? "High" : "Med";
}

export function buildScenarioImpact(input: BuildScenarioImpactInput): ScenarioImpact {
  const rationale: string[] = [];
  const profile = input.exposure;
  const indicatorGrades = Object.fromEntries(
    Object.entries(input.indicatorGrades ?? {}).map(([key, value]) => [normalizeSeriesId(key), value]),
  );

  const watch = dedupe([
    ...(input.scenario.confirmIndicators ?? []).map(normalizeSeriesId),
    ...(input.scenario.leadingIndicators ?? []).map(normalizeSeriesId),
  ]).slice(0, 8);

  if (!profile) {
    const unknownImpact: ScenarioImpact = {
      cashflowRisk: "Unknown",
      debtServiceRisk: "Unknown",
      inflationPressureRisk: "Unknown",
      fxPressureRisk: "Unknown",
      incomeRisk: "Unknown",
      bufferAdequacy: "Unknown",
      rationale: [sanitizeLine("노출 프로필이 설정되지 않아 개인 영향 평가는 unknown으로 유지됩니다.")],
      watch,
    };
    assertNoRecommendationLines(unknownImpact.rationale, "scenarioImpact.rationale");
    return unknownImpact;
  }

  const linkedTopics = new Set((input.scenario.linkedTopics ?? []).map((topic) => asString(topic).toLowerCase()).filter(Boolean));
  const observationLower = `${asString(input.scenario.observation)} ${asString(input.scenario.triggerSummary)}`.toLowerCase();

  if (observationLower.includes("금리")) linkedTopics.add("rates");
  if (observationLower.includes("물가") || observationLower.includes("인플레")) linkedTopics.add("inflation");
  if (observationLower.includes("환율") || observationLower.includes("외환")) linkedTopics.add("fx");
  if (observationLower.includes("원자재") || observationLower.includes("유가")) linkedTopics.add("commodities");
  if (observationLower.includes("경기") || observationLower.includes("신용")) linkedTopics.add("growth");

  const rateHot =
    hasTopic(linkedTopics, "rates")
    || hasIndicatorSignal(indicatorGrades, ["kr_base_rate", "us_cpi"], ["up", "high"])
    || input.scenario.triggerStatus === "met";

  const inflationHot =
    hasTopic(linkedTopics, "inflation")
    || hasTopic(linkedTopics, "commodities")
    || hasIndicatorSignal(indicatorGrades, ["kr_cpi", "us_cpi", "brent_oil"], ["up", "high"]);

  const fxHot =
    hasTopic(linkedTopics, "fx")
    || hasIndicatorSignal(indicatorGrades, ["kr_usdkrw"], ["up", "high"]);

  const incomeHot =
    hasTopic(linkedTopics, "growth")
    || hasTopic(linkedTopics, "credit")
    || input.scenario.name === "Bear";

  let debtServiceRisk: ImpactGrade = "Unknown";
  if (profile.debt?.hasDebt === false || profile.debt?.rateType === "none") {
    debtServiceRisk = "Low";
  } else if (profile.debt?.hasDebt === true) {
    const rateType = profile.debt.rateType;
    const horizon = profile.debt.repricingHorizon;
    if (!rateType || !horizon) {
      debtServiceRisk = "Unknown";
    } else if (rateHot && (rateType === "variable" || horizon === "short")) {
      debtServiceRisk = "High";
    } else if (rateHot && (rateType === "mixed" || horizon === "medium")) {
      debtServiceRisk = "Med";
    } else if (!rateHot && (rateType === "variable" || horizon === "short")) {
      debtServiceRisk = "Med";
    } else {
      debtServiceRisk = "Low";
    }
  }

  const inflationRiskCandidates: ImpactGrade[] = [
    gradeFromExposureLevel(profile.inflation?.essentialExpenseShare, inflationHot),
    gradeFromExposureLevel(profile.inflation?.rentOrMortgageShare, inflationHot),
    gradeFromExposureLevel(profile.inflation?.energyShare, inflationHot),
  ];
  const inflationPressureRisk = inflationRiskCandidates.reduce(maxRisk, "Unknown" as ImpactGrade);

  let fxPressureRisk: ImpactGrade = "Unknown";
  if (profile.fx?.foreignConsumption || profile.fx?.foreignIncome) {
    const c = gradeFromExposureLevel(profile.fx.foreignConsumption, fxHot);
    const i = gradeFromExposureLevel(profile.fx.foreignIncome, fxHot);
    fxPressureRisk = maxRisk(c, i);
  }

  const incomeRisk = deriveIncomeRisk(profile.income?.incomeStability, incomeHot);

  let bufferAdequacy: ImpactGrade = "Unknown";
  if (profile.liquidity?.monthsOfCashBuffer === "high") bufferAdequacy = "High";
  else if (profile.liquidity?.monthsOfCashBuffer === "medium") bufferAdequacy = "Med";
  else if (profile.liquidity?.monthsOfCashBuffer === "low") bufferAdequacy = "Low";

  const riskPool = [debtServiceRisk, inflationPressureRisk, fxPressureRisk, incomeRisk].filter((row) => row !== "Unknown");
  let cashflowRisk: ImpactGrade = "Unknown";
  if (riskPool.length > 0) {
    cashflowRisk = riskPool.reduce(maxRisk, "Low" as ImpactGrade);
  }

  if (bufferAdequacy === "Low") {
    if (cashflowRisk === "Low") cashflowRisk = "Med";
    else if (cashflowRisk === "Med") cashflowRisk = "High";
    rationale.push("현금완충력이 낮아 동일 충격에서도 체감 압력이 확대될 수 있습니다.");
  } else if (bufferAdequacy === "High" && cashflowRisk === "High") {
    cashflowRisk = "Med";
    rationale.push("현금완충력이 높아 단기 압력의 흡수 여지가 있습니다.");
  }

  if (debtServiceRisk === "High") {
    rationale.push("금리 민감 부채 비중이 높아 이자부담 압력이 빠르게 확대될 수 있습니다.");
  }
  if (inflationPressureRisk === "High") {
    rationale.push("필수지출/에너지 비중이 높은 편이라 물가 충격의 체감 강도가 커질 수 있습니다.");
  }
  if (fxPressureRisk === "High") {
    rationale.push("해외소비/외화 관련 노출이 높아 환율 변동의 영향 범위가 확대될 수 있습니다.");
  }
  if (incomeRisk === "High") {
    rationale.push("소득 안정성이 낮은 구간에서는 동일 충격에도 현금흐름 변동폭이 커질 수 있습니다.");
  }

  if (rationale.length < 1) {
    rationale.push("현재 입력 기준으로는 고강도 압력 신호가 제한적이며, 지표 변화 여부를 조건부로 점검합니다.");
  }

  const normalized: ScenarioImpact = {
    cashflowRisk,
    debtServiceRisk,
    inflationPressureRisk,
    fxPressureRisk,
    incomeRisk,
    bufferAdequacy,
    rationale: dedupe(rationale.map(sanitizeLine)).slice(0, 6),
    watch,
  };

  assertNoRecommendationLines(normalized.rationale, "scenarioImpact.rationale");
  return normalized;
}
