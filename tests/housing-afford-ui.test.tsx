import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HousingAffordClient } from "../src/components/HousingAffordClient";

describe("HousingAffordClient burden policy", () => {
  it("renders the calculation assessment and its matching warning", () => {
    const html = renderToStaticMarkup(
      <HousingAffordClient
        initialIncomeNet={1_000_000}
        initialOutflow={0}
        initialMode="rent"
        initialDeposit={0}
        initialMonthlyRent={300_000}
        initialOpportunityAprPct={0}
      />,
    );

    expect(html).toContain("주의");
    expect(html).toContain("30% 이상");
    expect(html).toContain("주의 기준 30% · 높음 기준 40%");
    expect(html).not.toContain("권장 25%");
    expect(html).not.toContain("안전");
    expect(html).not.toContain("위험");
  });

  it("renders normalized positive-income composition percentages", () => {
    const html = renderToStaticMarkup(
      <HousingAffordClient
        initialIncomeNet={1_000_000}
        initialOutflow={200_000}
        initialMode="rent"
        initialDeposit={0}
        initialMonthlyRent={300_000}
        initialOpportunityAprPct={0}
      />,
    );

    expect(html).toContain("월 소득 기준 1,000,000원");
    expect(html).toContain("기타 지출 (20%)");
    expect(html).toContain("주거비 (30%)");
    expect(html).toContain("잔여 50%");
    expect(html).toContain('aria-label="월 현금흐름 구성"');
  });

  it.each([0, -100])("suppresses composition percentages for invalid income %s", (initialIncomeNet) => {
    const html = renderToStaticMarkup(
      <HousingAffordClient
        initialIncomeNet={initialIncomeNet}
        initialOutflow={200_000}
        initialMode="rent"
        initialDeposit={0}
        initialMonthlyRent={300_000}
        initialOpportunityAprPct={0}
      />,
    );

    expect(html).toContain("계산 제한");
    expect(html).toContain("월 소득 기준 0원");
    expect(html).toContain("기타 지출 (-)");
    expect(html).toContain("주거비 (-)");
    expect(html).toContain("잔여 -");
    expect(html).toContain("-500,000원");
    expect(html).toContain('aria-label="월 현금흐름 구성 비율 계산 불가"');
    expect(html).not.toContain("180000000%");
    expect(html).not.toContain("95000000%");
  });
});
