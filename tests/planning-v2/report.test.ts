import { describe, expect, it } from "vitest";
import { toMarkdownReport } from "../../src/lib/planning/v2/report";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";

function sampleProfile(): ProfileV2 {
  return {
    monthlyIncomeNet: 3_800_000,
    monthlyEssentialExpenses: 1_400_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 1_100_000,
    investmentAssets: 2_200_000,
    debts: [],
    goals: [
      {
        id: "goal-a",
        name: "Goal A",
        targetAmount: 4_000_000,
        targetMonth: 24,
        priority: 4,
      },
    ],
  };
}

function extractSectionLines(markdown: string, heading: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ")) break;
    out.push(line);
  }
  return out;
}

describe("toMarkdownReport", () => {
  it("renders required sections with qa output", () => {
    const plan = simulateMonthly(sampleProfile(), { inflation: 0.02, expectedReturn: 0.05 }, 36);
    const markdown = toMarkdownReport({
      title: "Planning Report Test",
      generatedAt: "2026-02-28T00:00:00.000Z",
      snapshot: {
        id: "snap-1",
        asOf: "2026-02-28",
        fetchedAt: "2026-02-28T00:00:00.000Z",
        missing: false,
      },
      assumptionsLabel: "defaults + snapshot",
      plan,
      scenarios: {
        conservative: { endNetWorthDeltaKrw: -1200000 },
      },
      monteCarlo: {
        probabilities: {
          retirementDepletionBeforeEnd: 0.21,
        },
      },
      actions: {
        actions: [{ code: "SET_ASSUMPTIONS_REVIEW", title: "가정 점검" }],
      },
    });

    expect(markdown).toContain("# Planning Report Test");
    expect(markdown).toContain("## 기준정보");
    expect(markdown).toContain("## Executive Summary");
    expect(markdown).toContain("## Key Findings (Top 3)");
    expect(markdown).toContain("## Warnings Summary");
    expect(markdown).toContain("## Goal Status");
    expect(markdown).toContain("## Action Plan (Top 3)");
    expect(markdown).toContain("## Appendix");
    expect(markdown).toContain("### Q&A");
    expect(markdown).toContain("왜 목표가 미달인가?");
    expect(markdown).toContain("스냅샷 ID: snap-1");

    const orderedSections = [
      "## 기준정보",
      "## Executive Summary",
      "## Key Findings (Top 3)",
      "## Warnings Summary",
      "## Goal Status",
      "## Action Plan (Top 3)",
      "## Appendix",
    ];
    const indices = orderedSections.map((section) => markdown.indexOf(section));
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i - 1]).toBeGreaterThanOrEqual(0);
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }

    const scenarioSectionIdx = markdown.indexOf("## Scenarios / Monte Carlo");
    if (scenarioSectionIdx >= 0) {
      expect(scenarioSectionIdx).toBeGreaterThan(markdown.indexOf("## Action Plan (Top 3)"));
      expect(markdown.indexOf("## Appendix")).toBeGreaterThan(scenarioSectionIdx);
    }

    const debtSectionIdx = markdown.indexOf("## Debt Analysis");
    if (debtSectionIdx >= 0) {
      expect(debtSectionIdx).toBeGreaterThan(markdown.indexOf("## Action Plan (Top 3)"));
      expect(markdown.indexOf("## Appendix")).toBeGreaterThan(debtSectionIdx);
    }
  });

  it("groups repeated warning codes into a single warning row", () => {
    const plan = simulateMonthly(sampleProfile(), { inflation: 0.02, expectedReturn: 0.05 }, 12);
    plan.warnings = [
      {
        reasonCode: "CONTRIBUTION_SKIPPED",
        message: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
        month: 1,
      },
      {
        reasonCode: "CONTRIBUTION_SKIPPED",
        message: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
        month: 2,
      },
      {
        reasonCode: "CONTRIBUTION_SKIPPED",
        message: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
        month: 3,
      },
    ];

    const markdown = toMarkdownReport({ plan });
    expect(markdown).toContain("| CONTRIBUTION_SKIPPED | warn | 3 | M1~M3 |");
    expect(markdown.match(/CONTRIBUTION_SKIPPED \| warn \| 3/g)?.length ?? 0).toBe(1);
  });

  it("snapshots warning summary as one grouped line for repeated CONTRIBUTION_SKIPPED", () => {
    const plan = simulateMonthly(sampleProfile(), { inflation: 0.02, expectedReturn: 0.05 }, 36);
    plan.warnings = Array.from({ length: 30 }).map((_, idx) => ({
      reasonCode: "CONTRIBUTION_SKIPPED" as const,
      message: "현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다.",
      month: idx + 1,
    }));

    const markdown = toMarkdownReport({ plan });
    const warningLines = extractSectionLines(markdown, "Warnings Summary")
      .filter((line) => line.includes("CONTRIBUTION_SKIPPED"));
    expect(warningLines).toMatchInlineSnapshot(`
      [
        "| CONTRIBUTION_SKIPPED | warn | 30 | M1~M30 | 현금 부족으로 일부 적립이 자동 축소 또는 건너뛰어졌습니다. | - |",
      ]
    `);
  });

  it("does not include json fenced blocks before Appendix", () => {
    const plan = simulateMonthly(sampleProfile(), { inflation: 0.02, expectedReturn: 0.05 }, 24);
    const markdown = toMarkdownReport({
      plan,
      scenarios: {
        scenarios: [
          {
            id: "stress",
            title: "Stress",
            diffVsBase: { keyMetrics: { endNetWorthDeltaKrw: -2_500_000, goalsAchievedDelta: -1 } },
          },
        ],
      },
      monteCarlo: {
        probabilities: {
          retirementDepletionBeforeEnd: 0.243333,
        },
      },
    });

    const appendixIndex = markdown.indexOf("## Appendix");
    expect(appendixIndex).toBeGreaterThan(0);
    const baseSections = markdown.slice(0, appendixIndex);
    expect(baseSections).not.toContain("```json");
  });
});
