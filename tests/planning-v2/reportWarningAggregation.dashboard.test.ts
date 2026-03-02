import { describe, expect, it } from "vitest";
import { aggregateWarningsByUniqueMonth } from "../../src/app/planning/reports/_lib/warningAggregation";

describe("aggregateWarningsByUniqueMonth", () => {
  it("dedupes repeated warnings in the same month", () => {
    const rows = aggregateWarningsByUniqueMonth([
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족",
        month: 1,
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족(중복)",
        month: 1,
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        message: "현금흐름 부족",
        month: 2,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "NEGATIVE_CASHFLOW",
      severity: "critical",
      count: 2,
      firstMonth: 0,
      lastMonth: 1,
    });
  });

  it("counts warnings without month as separate occurrences", () => {
    const rows = aggregateWarningsByUniqueMonth([
      {
        code: "HIGH_DEBT_RATIO",
        message: "DSR이 높습니다.",
      },
      {
        code: "HIGH_DEBT_RATIO",
        message: "DSR이 높습니다.",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "HIGH_DEBT_RATIO",
      severity: "warn",
      count: 2,
    });
  });

  it("keeps subject groups separate and computes severityMax", () => {
    const rows = aggregateWarningsByUniqueMonth([
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "warn",
        month: 1,
        meta: { subjectKey: "cash-a" },
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "critical",
        month: 2,
        meta: { subjectKey: "cash-a" },
      },
      {
        reasonCode: "NEGATIVE_CASHFLOW",
        severity: "info",
        month: 2,
        meta: { subjectKey: "cash-b" },
      },
    ]);

    const cashA = rows.find((row) => row.code === "NEGATIVE_CASHFLOW" && row.subjectKey === "cash-a");
    const cashB = rows.find((row) => row.code === "NEGATIVE_CASHFLOW" && row.subjectKey === "cash-b");

    expect(cashA).toBeDefined();
    expect(cashA).toMatchObject({
      severityMax: "critical",
      count: 2,
      periodMinMax: "M1~M2",
    });

    expect(cashB).toBeDefined();
    expect(cashB).toMatchObject({
      severityMax: "info",
      count: 1,
      periodMinMax: "M2",
    });
  });

  it("renders unknown warning code with safe fallback catalog entry", () => {
    const rows = aggregateWarningsByUniqueMonth([
      {
        code: "UNKNOWN_CUSTOM_WARNING",
        severity: "warn",
        month: 1,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("알 수 없는 경고(UNKNOWN_CUSTOM_WARNING)");
    expect(rows[0]?.plainDescription.length ?? 0).toBeGreaterThan(0);
  });
});
