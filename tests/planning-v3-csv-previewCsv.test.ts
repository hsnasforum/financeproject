import { describe, expect, it } from "vitest";
import { previewCsv } from "../src/lib/planning/v3/providers/csv/previewCsv";

describe("previewCsv", () => {
  it("returns deterministic preview rows and stats for mixed success/failure rows", () => {
    const csvText = [
      "거래일자,금액,적요",
      "2026-01-01,1000,급여",
      "2026-01-02,abc,오류금액",
      "bad-date,200,오류날짜",
      "2026-01-04,-300,교통비",
    ].join("\n");

    const first = previewCsv({
      csvText,
      mapping: {
        dateKey: "거래일자",
        amountKey: "금액",
        descKey: "적요",
      },
      maxRows: 20,
    });

    const second = previewCsv({
      csvText,
      mapping: {
        dateKey: "거래일자",
        amountKey: "금액",
        descKey: "적요",
      },
      maxRows: 20,
    });

    expect(first).toEqual(second);
    expect(first.stats).toEqual({
      total: 4,
      ok: 2,
      failed: 2,
      inferredMonths: 1,
    });
    expect(first.rows).toEqual([
      {
        line: 1,
        dateIso: "2026-01-01",
        amountKrw: 1000,
        descMasked: "급여",
        ok: true,
      },
      {
        line: 2,
        ok: false,
        reason: "amount 형식 오류",
      },
      {
        line: 3,
        ok: false,
        reason: "date 형식 오류",
      },
      {
        line: 4,
        dateIso: "2026-01-04",
        amountKrw: -300,
        descMasked: "교통비",
        ok: true,
      },
    ]);
  });
});
