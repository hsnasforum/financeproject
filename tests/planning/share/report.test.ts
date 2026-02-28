import { describe, expect, it } from "vitest";
import { SHARE_REPORT_WATERMARK, toShareMarkdown } from "../../../src/lib/planning/share/report";

describe("planning share report", () => {
  it("always includes watermark and summary/action sections", () => {
    const markdown = toShareMarkdown({
      runId: "run-123",
      level: "standard",
      summary: {
        endNetWorthKrw: 90_000_000,
      },
      warnings: [{ code: "NEGATIVE_CASHFLOW", message: "현금흐름 적자" }],
      actions: [{ code: "FIX_NEGATIVE_CASHFLOW", title: "현금흐름 개선", summary: "지출 점검" }],
      assumptions: {
        inflationPct: 2,
        cashReturnPct: 2.5,
        investReturnPct: 5,
      },
    });

    expect(markdown).toContain(SHARE_REPORT_WATERMARK);
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Actions (Top 5)");
    expect(markdown).toContain("NEGATIVE_CASHFLOW");
  });
});
