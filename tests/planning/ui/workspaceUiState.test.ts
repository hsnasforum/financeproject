import { describe, expect, it } from "vitest";
import { defaults, getVisibleSections } from "../../../src/app/planning/_lib/workspaceUiState";

describe("planning workspace ui state", () => {
  it("returns beginner tabs only", () => {
    const tabs = getVisibleSections(true, {
      hasResult: true,
      hasActions: true,
      hasScenarios: true,
      hasMonteCarlo: true,
      hasDebt: true,
    });

    expect(tabs).toEqual(["summary", "warningsGoals", "actions", "scenarios"]);
  });

  it("returns advanced tabs including monte carlo and debt", () => {
    const tabs = getVisibleSections(false, {
      hasResult: true,
      hasActions: true,
      hasScenarios: true,
      hasMonteCarlo: true,
      hasDebt: true,
    });

    expect(tabs).toEqual(["summary", "warningsGoals", "actions", "scenarios", "monteCarlo", "debt"]);
  });

  it("returns no tabs without result", () => {
    const tabs = getVisibleSections(true, {
      hasResult: false,
      hasActions: true,
      hasScenarios: true,
      hasMonteCarlo: true,
      hasDebt: true,
    });

    expect(tabs).toEqual([]);
  });

  it("provides safe beginner defaults", () => {
    const value = defaults(true);

    expect(value.horizonMonths).toBe("120");
    expect(value.runScenariosEnabled).toBe(true);
    expect(value.runMonteCarloEnabled).toBe(false);
    expect(value.runActionsEnabled).toBe(true);
    expect(value.runDebtEnabled).toBe(true);
    expect(value.includeProducts).toBe(false);
    expect(value.monteCarloPaths).toBe("500");
    expect(value.debtExtraPaymentKrw).toBe("0");
  });
});
