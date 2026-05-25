import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlannerWizard } from "../src/components/PlannerWizard";
import { PlannerWizardMonitoringStep } from "../src/components/plannerWizard/steps";
import { DEFAULT_INPUT } from "../src/components/plannerWizard/shared";
import { buildPlan } from "../src/lib/planner/plan";

describe("planner wizard ui", () => {
  it("renders stable wizard shell on the first step", () => {
    const html = renderToStaticMarkup(<PlannerWizard />);

    expect(html).toContain("Financial Assistant");
    expect(html).toContain("Step 1. 목표 설정");
    expect(html).toContain("UI Prefs");
    expect(html).toContain("CONTINUE");
    expect(html).toContain("PREVIOUS");
  });

  it("renders snapshot history and trend review surfaces", () => {
    const plan = buildPlan(DEFAULT_INPUT);
    const snapshots = [
      {
        id: "snap-a",
        createdAt: "2026-04-10T10:00:00.000Z",
        input: DEFAULT_INPUT,
        metrics: plan.metrics,
        recommendations: plan.recommendations,
      },
      {
        id: "snap-b",
        createdAt: "2026-04-11T10:00:00.000Z",
        input: { ...DEFAULT_INPUT, goalName: "비상금 재정비" },
        metrics: plan.metrics,
        recommendations: plan.recommendations,
      },
    ];
    const html = renderToStaticMarkup(
      <PlannerWizardMonitoringStep
        plan={plan}
        input={DEFAULT_INPUT}
        snapshots={snapshots}
        compareA="snap-a"
        compareB="snap-b"
        compareSnapA={snapshots[0]}
        compareSnapB={snapshots[1]}
        monthlySavingTrend={[100, 120]}
        emergencyGapTrend={[20, 10]}
        goalRequiredTrend={[50, 45]}
        debtRatioTrend={[12, 11]}
        saveCurrentSnapshot={() => {}}
        applySnapshot={() => {}}
        deleteSnapshotById={() => {}}
        setCompareA={() => {}}
        setCompareB={() => {}}
      />,
    );

    expect(html).toContain("Save Snapshot");
    expect(html).toContain("Recent History");
    expect(html).toContain("LOAD");
    expect(html).toContain("트렌드 분석 및 성과 비교");
    expect(html).toContain("Performance Indicators");
  });
});
