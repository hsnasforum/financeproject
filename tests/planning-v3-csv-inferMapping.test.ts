import { describe, expect, it } from "vitest";
import { inferCsvMapping } from "../src/lib/planning/v3/providers/csv/inferMapping";

describe("inferCsvMapping", () => {
  it("recommends date/amount/desc for common ko headers", () => {
    const headers = ["거래 일자", "거래금액", "적요", "잔액"];

    const result = inferCsvMapping(headers);

    expect(result.dateKey).toBe("거래 일자");
    expect(result.amountKey).toBe("거래금액");
    expect(result.descKey).toBe("적요");
    expect(result.inflowKey).toBeUndefined();
    expect(result.outflowKey).toBeUndefined();
    expect(result.confidence).toEqual({
      date: "high",
      amount: "high",
      desc: "high",
    });
  });

  it("recommends inflow/outflow mode when both headers are high-confidence", () => {
    const headers = ["승인일자", "입금", "출금", "내용"];

    const result = inferCsvMapping(headers);

    expect(result.dateKey).toBe("승인일자");
    expect(result.amountKey).toBeUndefined();
    expect(result.inflowKey).toBe("입금");
    expect(result.outflowKey).toBe("출금");
    expect(result.descKey).toBe("내용");
    expect(result.confidence.amount).toBe("high");
  });
});
