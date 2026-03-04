import { noRecommendationText, sanitizeNoRecommendationText } from "../../../src/lib/news/noRecommendation";
import { type ExposureProfile } from "../exposure/contracts";
import { StressResultSchema, type ImpactResult, type StressResult } from "./contracts";

type DraftSummary = {
  medianIncomeKrw?: number;
  medianExpenseKrw?: number;
  avgNetKrw?: number;
};

type RunStressInput = {
  profile: ExposureProfile | null;
  draftSummary?: DraftSummary | null;
  impact: ImpactResult;
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

function safeLines(lines: string[]): string[] {
  const normalized = dedupe(lines.map(sanitizeLine)).slice(0, 5);
  if (!normalized.every((line) => noRecommendationText(line))) {
    throw new Error("recommendation_language_detected");
  }
  return normalized;
}

export function runStress(input: RunStressInput): StressResult {
  const pressureAreas: string[] = [];
  const resilienceNotes: string[] = [];
  const monitoringOptions: string[] = [];

  if (!input.profile) {
    pressureAreas.push("노출 프로필이 없어 개인화 스트레스 평가는 unknown으로 유지됩니다.");
    monitoringOptions.push("노출 프로필 저장 후 동일 시나리오를 다시 비교하면 변화 추적이 가능합니다.");
    return StressResultSchema.parse({
      pressureAreas: safeLines(pressureAreas),
      resilienceNotes: safeLines(["프로필 입력 전에는 완충요소를 보수적으로 해석합니다."]),
      monitoringOptions: safeLines(monitoringOptions),
    });
  }

  if (input.impact.debtServiceRisk === "High" || input.impact.debtServiceRisk === "Med") {
    pressureAreas.push("부채 상환 부담 민감 구간이 확대될 수 있습니다.");
  }
  if (input.impact.inflationPressureRisk === "High") {
    pressureAreas.push("생활비 압력 구간이 확대될 수 있습니다.");
  }
  if (input.impact.fxPressureRisk === "High") {
    pressureAreas.push("환율 민감 지출 구간의 변동폭이 확대될 수 있습니다.");
  }
  if (input.impact.bufferAdequacy === "Low") {
    pressureAreas.push("완충 버퍼가 낮아 충격 흡수 여지가 제한될 수 있습니다.");
  }

  if (input.impact.bufferAdequacy === "High") {
    resilienceNotes.push("현금완충력이 높아 단기 충격 흡수 여지가 있습니다.");
  } else if (input.impact.bufferAdequacy === "Med") {
    resilienceNotes.push("현금완충력이 중간 수준으로, 지표 급변 시 점검 주기 조정이 유효합니다.");
  }

  if (typeof input.draftSummary?.avgNetKrw === "number") {
    if (input.draftSummary.avgNetKrw < 0) {
      pressureAreas.push("최근 순현금흐름이 음수 구간으로 관측되어 압력 지속 가능성이 있습니다.");
    } else {
      resilienceNotes.push("최근 순현금흐름이 양수 구간으로 관측되어 단기 완충 여지가 있습니다.");
    }
  }

  if (pressureAreas.length >= 3) {
    monitoringOptions.push("주간 단위로 지표/뉴스 트리거를 함께 점검하는 옵션을 유지합니다.");
  } else if (pressureAreas.length >= 1) {
    monitoringOptions.push("격주 단위로 핵심 변수 변화를 점검하는 옵션을 유지합니다.");
  } else {
    monitoringOptions.push("월간 단위로 기준 지표를 점검하는 옵션을 유지합니다.");
  }

  if (input.impact.watch.length > 0) {
    monitoringOptions.push(`연결 지표(${input.impact.watch.slice(0, 3).join(", ")}) 중심 점검 순서를 유지합니다.`);
  }

  if (pressureAreas.length < 1) {
    pressureAreas.push("현재 입력 기준에서는 즉시 확대되는 압력 영역이 제한적입니다.");
  }
  if (resilienceNotes.length < 1) {
    resilienceNotes.push("완충 요인은 추가 입력 후 재평가 시 더 명확해질 수 있습니다.");
  }

  return StressResultSchema.parse({
    pressureAreas: safeLines(pressureAreas),
    resilienceNotes: safeLines(resilienceNotes),
    monitoringOptions: safeLines(monitoringOptions),
  });
}
