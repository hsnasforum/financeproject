import { describe, expect, it } from "vitest";
import { validateProfileV2 } from "../src/lib/planning/server/v2/validate";
import { buildProfileV2DraftFromV3Draft } from "../src/lib/planning/v3/export/profileV2Draft";
import { type PlanningV3Draft } from "../src/lib/planning/v3/drafts/types";

function fixtureDraft(): PlanningV3Draft {
  return {
    id: "draft-export-001",
    createdAt: "2026-03-03T00:00:00.000Z",
    source: "csv",
    meta: {
      rows: 9,
      months: 3,
    },
    cashflow: [
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
      { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      { ym: "2026-03", incomeKrw: 4_250_000, expenseKrw: -1_050_000, netKrw: 3_200_000, txCount: 3 },
    ],
    draftPatch: {
      monthlyIncomeNet: 2_201_234,
      monthlyEssentialExpenses: 735_000,
      monthlyDiscretionaryExpenses: 315_000,
      assumptions: [
        "monthlyIncomeNet uses median monthly net (assumption)",
        "expense split 70/30 (assumption)",
      ],
      monthsConsidered: 3,
    },
  };
}

describe("buildProfileV2DraftFromV3Draft determinism", () => {
  it("returns identical ProfileV2 JSON for the same v3 draft input", () => {
    const draft = fixtureDraft();

    const first = buildProfileV2DraftFromV3Draft(draft);
    const second = buildProfileV2DraftFromV3Draft(draft);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(() => validateProfileV2(first)).not.toThrow();
  });
});

