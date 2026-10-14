import { describe, expect, it } from "vitest";
import { buildInterpretationVM, type InterpretationInput } from "../../../../src/lib/planning/v2/insights/interpretationVm";
import { buildWorkspaceGuideBadge } from "../../../../src/lib/planning/ui/workspaceResultInsights";

// Basic metrics that all meet their standards, including the 6-month emergency fund standard.
const base: InterpretationInput = {
  summary: { monthlySurplusKrw: 2_500_000, emergencyFundMonths: 6, dsrPct: 0, worstCashKrw: 100_000 },
  aggregatedWarnings: [], goals: [],
};
function view(summary: InterpretationInput["summary"] = {}, warnings: InterpretationInput["aggregatedWarnings"] = [], goals: InterpretationInput["goals"] = []) {
  return buildInterpretationVM({ summary: { ...base.summary, ...summary }, aggregatedWarnings: warnings, goals });
}

describe("diagnosis assessment separates basic metrics from individual signals", () => {
  it("reproduces the original contradictory verdict without changing either financial rule", () => {
    const report = view({ worstCashKrw: 0 });
    const workspace = buildWorkspaceGuideBadge({ summaryWorstCashKrw: 0, hasNegativeCashflow: false, dtoDsrRatio: 0, missedGoals: 0, contributionSkippedCount: 0 });
    expect(workspace.status).toBe("risk");
    expect(report.verdict.code).toBe("GOOD");
    expect(report.assessment).toMatchObject({ code: "RISK", label: "위험 신호 있음", basisLabel: "기본 지표 판정: 양호" });
    expect(report.assessment.signals.some((s) => s.id === "worst-cash" && s.evidence.includes("0"))).toBe(true);
  });

  it.each([
    { cash: 0, want: "RISK" },
    { cash: -1, want: "RISK" },
    { cash: 1, want: "GOOD" },
    { cash: undefined, want: "UNKNOWN" },
    { cash: Number.NaN, want: "UNKNOWN" },
  ])("does not confuse minimum cash $cash with another state", ({ cash, want }) => {
    const vm = view({ worstCashKrw: cash });
    expect(vm.verdict.code).toBe("GOOD");
    expect(vm.assessment?.code).toBe(want);
    if (!Number.isFinite(cash)) {
      expect(vm.assessment?.missingMetrics).toContain("기간 중 최저 현금");
      expect(vm.assessment?.signals.some((s) => s.id === "worst-cash")).toBe(false);
    }
  });

  it.each([
    { summary: { monthlySurplusKrw: -1, emergencyFundMonths: 0.5 }, basic: "RISK", signal: "RISK" },
    { summary: { monthlySurplusKrw: -1, emergencyFundMonths: 4 }, basic: "CAUTION", signal: "RISK" },
    { summary: { monthlySurplusKrw: 0 }, basic: "GOOD", signal: "CAUTION" },
    { summary: { emergencyFundMonths: 0.5 }, basic: "CAUTION", signal: "RISK" },
    { summary: { emergencyFundMonths: 2 }, basic: "CAUTION", signal: "CAUTION" },
    { summary: { dsrPct: 30 }, basic: "CAUTION", signal: "CAUTION" },
    { summary: { dsrPct: 49.9 }, basic: "CAUTION", signal: "CAUTION" },
    { summary: { dsrPct: 50 }, basic: "RISK", signal: "RISK" },
    { summary: { dsrPct: undefined }, basic: "UNKNOWN", signal: "UNKNOWN" },
  ])("preserves the existing basic verdict $basic and exposes $signal signals", ({ summary, basic, signal }) => {
    const vm = view(summary);
    expect(vm.verdict.code).toBe(basic);
    expect(vm.assessment?.code).toBe(signal);
  });

  it.each([
    { months: 0.99, basic: "CAUTION", signal: "RISK" },
    { months: 1, basic: "CAUTION", signal: "CAUTION" },
    { months: 5.99, basic: "CAUTION", signal: "CAUTION" },
    { months: 6, basic: "GOOD", signal: "GOOD" },
  ])("uses the 6-month emergency fund standard at $months months", ({ months, basic, signal }) => {
    const vm = view({ emergencyFundMonths: months });
    expect(vm.verdict.code).toBe(basic);
    expect(vm.assessment?.code).toBe(signal);
    expect(vm.assessment?.signals.some((s) => s.id === "emergency-fund")).toBe(months < 6);
  });

  it.each([
    { code: "NEGATIVE_CASHFLOW", severity: "warn" as const, count: 1, want: "RISK" },
    { code: "CONTRIBUTION_SKIPPED", severity: "warn" as const, count: 3, want: "CAUTION" },
    { code: "CUSTOM", severity: "critical" as const, count: 1, want: "RISK" },
    { code: "CUSTOM", severity: "warn" as const, count: 8, want: "CAUTION" },
  ])("retains $code without rewriting the stored warning", ({ code, severity, count, want }) => {
    const warnings = [{ code, severity, count }];
    const before = JSON.stringify(warnings);
    const vm = view({}, warnings);
    expect(vm.assessment?.code).toBe(want);
    expect(vm.warnings[0]).toMatchObject({ code, severity, count });
    expect(JSON.stringify(warnings)).toBe(before);
  });

  it("keeps missed goals visible even when higher priority diagnostics exceed three", () => {
    const goals = [{ goalId: "g", name: "주거", achieved: false, targetMonth: 12, progressPct: 20, shortfallKrw: 800_000, interpretation: "미달" }];
    const vm = view({ monthlySurplusKrw: -100, emergencyFundMonths: 0.5, dsrPct: 60, worstCashKrw: -100 }, [{ code: "CUSTOM", severity: "critical", count: 1 }], goals);
    expect(vm.assessment?.signals.map((s) => s.id)).toEqual(expect.arrayContaining(["monthly-surplus", "dsr", "emergency-fund", "worst-cash", "warnings", "goals"]));
    expect(vm.assessment?.code).toBe("RISK");
    const goalOnly = view({}, [], goals);
    expect(goalOnly.verdict.code).toBe("GOOD");
    expect(goalOnly.assessment?.code).toBe("CAUTION");
  });

  it("keeps missing financial data unknown while retaining an independently observed risk", () => {
    const vm = view({ monthlySurplusKrw: undefined, worstCashKrw: -100 });
    expect(vm.verdict.code).toBe("UNKNOWN");
    expect(vm.assessment?.code).toBe("RISK");
    expect(vm.assessment?.missingMetrics).toContain("월 잉여금");
  });

  it("does not hide a missed goal beyond the displayed goal row limit", () => {
    const vm = buildInterpretationVM({ ...base, summary: { ...base.summary, goalsAchievedText: "10/11" },
      goals: [{ goalId: "visible", name: "보이는 목표", achieved: true, targetMonth: 12, progressPct: 100, shortfallKrw: 0, interpretation: "달성" }] });
    expect(vm.assessment.signals.some((s) => s.id === "goals")).toBe(true);
    expect(vm.assessment.code).toBe("CAUTION");
  });

  it("keeps reference data status distinct from financial signals", () => {
    const vm = buildInterpretationVM({ ...base, outcomes: { snapshotMeta: { missing: true } } });
    expect(vm.diagnostics.some((s) => s.id === "snapshot" && s.severity === "risk")).toBe(true);
    expect(vm.assessment?.signals.some((s) => s.id === "snapshot")).toBe(false);
    expect(vm.assessment?.code).toBe("GOOD");
  });
});
