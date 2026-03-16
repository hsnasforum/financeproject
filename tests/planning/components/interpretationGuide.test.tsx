import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InterpretationGuide from "../../../src/components/planning/InterpretationGuide";

describe("InterpretationGuide", () => {
  it("renders monthly operating guide in the top interpretation card", () => {
    const html = renderToStaticMarkup(
      <InterpretationGuide
        aggregatedWarnings={[]}
        goals={[]}
        monthlyOperatingGuide={{
          headline: "지금은 남는 돈을 비상금부터 채우는 운영이 더 안전합니다.",
          basisLabel: "현재 매달 남는 돈 900,000원을 기준으로 한 운영안입니다.",
          currentSplit: [
            {
              title: "생활비/고정운영",
              amountKrw: 2_000_000,
              sharePct: 40,
              tone: "slate",
              description: "매달 기본적으로 나가는 생활비와 운영비입니다.",
            },
          ],
          nextPlanTitle: "남는 돈 운영안",
          nextPlan: [
            {
              title: "비상금/안전자금",
              amountKrw: 540_000,
              sharePct: 60,
              tone: "emerald",
              description: "예상 밖 지출이나 소득 변동을 버티기 위한 우선 재원입니다.",
            },
          ],
        }}
        summaryMetrics={{
          monthlySurplusKrw: 900_000,
          emergencyFundMonths: 2.4,
          dsrPct: 28,
        }}
      />,
    );

    expect(html).toContain('data-testid="interpretation-monthly-operating-guide"');
    expect(html).toContain('data-testid="interpretation-ai-summary"');
    expect(html).toContain("운영 가이드");
    expect(html).toContain("현재 월수입 배분");
    expect(html).toContain("남는 돈 운영안");
    expect(html).toContain("상세 근거와 추가 제안 보기");
  });
});
