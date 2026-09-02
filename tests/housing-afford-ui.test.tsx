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
});
