import { describe, expect, it } from "vitest";
import { buildFallbackPlanningAiSummary } from "../../../../src/lib/planning/v2/insights/aiSummary";

describe("buildFallbackPlanningAiSummary", () => {
  it("builds concise paragraphs from interpretation inputs", () => {
    const summary = buildFallbackPlanningAiSummary({
      verdictHeadline: "일부 지표는 주의 구간이라 지출과 대출 구조를 함께 점검하는 편이 좋습니다.",
      primaryActionTitle: "고정비 재점검",
      primaryActionDescription: "당장 줄일 수 있는 고정비부터 정리하세요.",
      diagnostics: [
        { title: "매달 남는 돈", description: "남는 돈이 적어 작은 변동에도 흔들릴 수 있습니다." },
        { title: "대출 상환 부담", description: "상환 비중이 커서 다른 목표를 함께 챙기기 어렵습니다." },
      ],
      monthlyOperatingGuide: {
        headline: "남는 돈은 비상금부터 채우는 운영이 더 안전합니다.",
        basisLabel: "현재 매달 남는 돈 900,000원을 기준으로 한 운영안입니다.",
      },
    });

    expect(summary.headline).toBe("맞춤 설명");
    expect(summary.paragraphs[0]).toContain("일부 지표는 주의 구간");
    expect(summary.paragraphs.some((line) => line.includes("고정비 재점검"))).toBe(true);
    expect(summary.paragraphs.some((line) => line.includes("비상금부터 채우는 운영"))).toBe(true);
  });
});
