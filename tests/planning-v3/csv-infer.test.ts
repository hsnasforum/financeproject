import { describe, expect, it } from "vitest";
import { inferCsvMapping } from "../../src/lib/planning/v3/providers/csv/infer";

describe("inferCsvMapping", () => {
  it("suggests date/amount/desc for common EN headers", () => {
    const csv = [
      "date,amount,desc",
      "2026-03-01,1000000,salary",
      "2026-03-02,-400000,rent",
    ].join("\n");

    const inferred = inferCsvMapping(csv);
    expect(inferred.headers).toEqual(["date", "amount", "desc"]);
    expect(inferred.suggestions.dateKey).toBe("date");
    expect(inferred.suggestions.amountKey).toBe("amount");
    expect(inferred.suggestions.descKey).toBe("desc");
    expect(inferred.suggestions.amountSign).toBe("signed");
  });

  it("suggests date/amount/type for KR headers with aliases", () => {
    const csv = [
      "거래일자,입출금액,거래구분,적요",
      "20260301,1000000,입금,급여",
      "20260305,300000,출금,월세",
    ].join("\n");

    const inferred = inferCsvMapping(csv);
    expect(inferred.suggestions.dateKey).toBe("거래일자");
    expect(inferred.suggestions.amountKey).toBe("입출금액");
    expect(inferred.suggestions.typeKey).toBe("거래구분");
    expect(inferred.suggestions.descKey).toBe("적요");
    expect(inferred.suggestions.dateFormatHint).toBe("yyyyMMdd");
  });
});

