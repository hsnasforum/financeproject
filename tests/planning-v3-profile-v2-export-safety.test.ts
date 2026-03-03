import { describe, expect, it } from "vitest";
import { buildProfileV2DraftFromV3Draft } from "../src/lib/planning/v3/export/profileV2Draft";
import { type PlanningV3Draft } from "../src/lib/planning/v3/drafts/types";

const LEAK_MARKER = "PII_SHOULD_NOT_LEAK";

describe("buildProfileV2DraftFromV3Draft safety", () => {
  it("does not include raw marker strings from draft inputs in exported ProfileV2 JSON", () => {
    const dirtyDraft = {
      id: `draft-${LEAK_MARKER}`,
      createdAt: "2026-03-03T11:22:33.000Z",
      source: "csv",
      meta: {
        rows: 1,
        months: 1,
        originalCsv: LEAK_MARKER,
      },
      cashflow: [
        {
          ym: "2026-03",
          incomeKrw: 1_500_000,
          expenseKrw: -500_000,
          netKrw: 1_000_000,
          txCount: 2,
          description: LEAK_MARKER,
          raw: LEAK_MARKER,
        },
      ],
      draftPatch: {
        monthlyIncomeNet: 1_000_000,
        monthlyEssentialExpenses: 350_000,
        monthlyDiscretionaryExpenses: 150_000,
        assumptions: [
          "monthlyIncomeNet uses median monthly net (assumption)",
          LEAK_MARKER,
        ],
        monthsConsidered: 1,
        rawTransactionNote: LEAK_MARKER,
      },
    } as unknown as PlanningV3Draft;

    const exported = buildProfileV2DraftFromV3Draft(dirtyDraft);
    const serialized = JSON.stringify(exported);

    expect(serialized).not.toContain(LEAK_MARKER);
    expect(serialized).not.toContain("description");
    expect(serialized).not.toContain("rawTransactionNote");
    expect(serialized).not.toContain("originalCsv");
  });
});

