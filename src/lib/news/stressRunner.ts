import {
  assertNoRecommendationLines,
  sanitizeNoRecommendationText,
} from "./noRecommendation";
import { type ExposureProfile, type ScenarioImpact, type StressRunResult } from "./types";

export type DraftSummaryForStress = {
  medianIncomeKrw?: number;
  medianExpenseKrw?: number;
  avgNetKrw?: number;
};

export type RunGradeStressInput = {
  exposure: ExposureProfile | null;
  impact: ScenarioImpact;
  draftSummary?: DraftSummaryForStress | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeLine(value: string): string {
  return sanitizeNoRecommendationText(asString(value));
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function runGradeStress(input: RunGradeStressInput): StressRunResult {
  const pressureAreas: string[] = [];
  const resilienceNotes: string[] = [];
  const monitoringCadence: string[] = [];

  if (!input.exposure) {
    pressureAreas.push("노출 프로필이 없어 개인화 스트레스 평가는 unknown 상태로 유지됩니다.");
    monitoringCadence.push("노출 프로필 저장 후 시나리오 재평가를 실행하면 비교 가능한 결과를 확인할 수 있습니다.");
    const fallback = {
      pressureAreas: dedupe(pressureAreas.map(sanitizeLine)).slice(0, 5),
      resilienceNotes: dedupe(resilienceNotes.map(sanitizeLine)).slice(0, 5),
      monitoringCadence: dedupe(monitoringCadence.map(sanitizeLine)).slice(0, 5),
    } satisfies StressRunResult;
    assertNoRecommendationLines(fallback.pressureAreas, "stress.pressureAreas");
    assertNoRecommendationLines(fallback.resilienceNotes, "stress.resilienceNotes");
    assertNoRecommendationLines(fallback.monitoringCadence, "stress.monitoringCadence");
    return fallback;
  }

  if (input.impact.cashflowRisk === "High") {
    pressureAreas.push("현금흐름 압력 구간이 확대될 수 있어 월 단위 변동 폭 점검이 필요합니다.");
  }
  if (input.impact.debtServiceRisk === "High") {
    pressureAreas.push("이자비용 민감 구간이 커질 수 있어 부채 관련 지출 흐름 점검이 필요합니다.");
  }
  if (input.impact.inflationPressureRisk === "High") {
    pressureAreas.push("필수지출 항목의 체감물가 압력이 확대될 수 있습니다.");
  }
  if (input.impact.fxPressureRisk === "High") {
    pressureAreas.push("외화 관련 소비/지출의 변동폭이 확대될 수 있습니다.");
  }
  if (input.impact.incomeRisk === "High") {
    pressureAreas.push("소득 안정성 변동 시 현금흐름 탄력성이 약해질 수 있습니다.");
  }

  if (input.impact.bufferAdequacy === "High") {
    resilienceNotes.push("현금완충력이 상대적으로 높아 단기 충격 흡수 여지가 있습니다.");
  }
  if (input.impact.bufferAdequacy === "Med") {
    resilienceNotes.push("현금완충력은 중립 구간으로, 지표 급변 시 점검 주기 단축이 유효합니다.");
  }
  if (input.impact.bufferAdequacy === "Low") {
    resilienceNotes.push("현금완충력이 낮아 복합 충격 시 대응 여지가 제한될 수 있습니다.");
  }

  const summary = input.draftSummary ?? null;
  if (summary && isFiniteNumber(summary.avgNetKrw)) {
    if (summary.avgNetKrw < 0) {
      pressureAreas.push("최근 월 순현금흐름이 음수 구간으로 관측되어 외부 충격 민감도가 높아질 수 있습니다.");
    } else {
      resilienceNotes.push("최근 월 순현금흐름이 양수 구간으로 관측되어 단기 완충 여지가 있습니다.");
    }
  }
  if (summary && isFiniteNumber(summary.medianIncomeKrw) && isFiniteNumber(summary.medianExpenseKrw)) {
    if (summary.medianExpenseKrw > summary.medianIncomeKrw) {
      pressureAreas.push("중앙값 기준 지출이 소득을 상회하는 구간이 있어 지출 민감도 점검이 필요합니다.");
    }
  }

  const highPressureCount = pressureAreas.length;
  if (highPressureCount >= 3) {
    monitoringCadence.push("고압력 구간에서는 주간 단위로 핵심 지표와 뉴스 신호를 함께 점검하는 옵션을 유지합니다.");
  } else if (highPressureCount >= 1) {
    monitoringCadence.push("중간 압력 구간에서는 격주 단위로 변화 신호를 확인하는 옵션을 유지합니다.");
  } else {
    monitoringCadence.push("저압력 구간에서는 월간 단위로 기준 지표를 점검하는 옵션을 유지합니다.");
  }

  if (input.impact.watch.length > 0) {
    monitoringCadence.push(`연결 지표(${input.impact.watch.slice(0, 3).join(", ")})를 우선 점검 목록으로 유지합니다.`);
  }

  if (pressureAreas.length < 1) {
    pressureAreas.push("현재 입력 기준으로 즉시 확대되는 압력 구간은 제한적으로 관측됩니다.");
  }
  if (resilienceNotes.length < 1) {
    resilienceNotes.push("노출/지표 입력이 제한되어 완충 요인은 추가 데이터 입력 후 재평가가 필요합니다.");
  }

  const result: StressRunResult = {
    pressureAreas: dedupe(pressureAreas.map(sanitizeLine)).slice(0, 5),
    resilienceNotes: dedupe(resilienceNotes.map(sanitizeLine)).slice(0, 5),
    monitoringCadence: dedupe(monitoringCadence.map(sanitizeLine)).slice(0, 5),
  };

  assertNoRecommendationLines(result.pressureAreas, "stress.pressureAreas");
  assertNoRecommendationLines(result.resilienceNotes, "stress.resilienceNotes");
  assertNoRecommendationLines(result.monitoringCadence, "stress.monitoringCadence");

  return result;
}
