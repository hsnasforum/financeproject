import { describe, expect, it } from "vitest";
import { buildEqualPaymentSchedule } from "../../../src/lib/planning/calc";

describe("calc SSOT - amortization reference", () => {
  it("matches equal payment reference totals and last row", () => {
    const schedule = buildEqualPaymentSchedule({
      principalKrw: 10_000_000,
      aprPct: 4.8,
      termMonths: 12,
    });

    expect(schedule.totalInterestKrw).toBe(261_903);
    expect(schedule.totalPaidKrw).toBe(10_261_903);
    expect(schedule.rows).toHaveLength(12);

    const last = schedule.rows[schedule.rows.length - 1];
    expect(last).toBeDefined();
    expect(last?.paymentKrw).toBe(855_154);
    expect(last?.interestKrw).toBe(3_407);
    expect(last?.principalPaidKrw).toBe(851_747);
    expect(last?.endBalanceKrw).toBe(0);
  });

  it("is deterministic for identical inputs", () => {
    const first = buildEqualPaymentSchedule({
      principalKrw: 10_000_000,
      aprPct: 4.8,
      termMonths: 12,
    });
    const second = buildEqualPaymentSchedule({
      principalKrw: 10_000_000,
      aprPct: 4.8,
      termMonths: 12,
    });
    expect(second).toStrictEqual(first);
  });
});
