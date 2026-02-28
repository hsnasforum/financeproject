import { describe, expect, it } from "vitest";
import { checkMonteCarloBudget } from "../../src/lib/planning/v2/budget";

describe("checkMonteCarloBudget", () => {
  it("rejects when paths*horizon exceeds budget", () => {
    const decision = checkMonteCarloBudget({
      paths: 20_000,
      horizonMonths: 500,
    });

    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.code).toBe("BUDGET_EXCEEDED");
      expect(String(decision.message)).toContain("예산");
    }
  });

  it("accepts when work units are within budget", () => {
    const decision = checkMonteCarloBudget({
      paths: 2_000,
      horizonMonths: 360,
    });

    expect(decision).toEqual({ ok: true });
  });
});
