import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileDraftDetailClient } from "../src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient";
import { ProfileDraftsListClient } from "../src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient";

describe("planning v3 profile drafts UI", () => {
  it("renders drafts list with row and delete action", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftsListClient
        disableAutoLoad
        initialRows={[
          {
            draftId: "d_1",
            id: "d_1",
            batchId: "b_1",
            createdAt: "2026-03-03T00:00:00.000Z",
            stats: { months: 3, unassignedCount: 0 },
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-drafts-list"');
    expect(html).toContain('data-testid="v3-draft-row-d_1"');
    expect(html).toContain("삭제");
  });

  it("renders embedded preflight controls and result blocks on detail page", () => {
    const html = renderToStaticMarkup(
      <ProfileDraftDetailClient
        disableAutoLoad
        id="d_1"
        initialDraft={{
          id: "d_1",
          batchId: "b_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 1_500_000,
            monthlyDiscretionaryExpenses: 400_000,
            assumptions: ["assumption"],
            monthsConsidered: 3,
          },
          evidence: {
            monthsUsed: ["2026-01", "2026-02", "2026-03"],
            ymStats: [
              {
                ym: "2026-01",
                incomeKrw: 3_000_000,
                expenseKrw: 1_900_000,
                fixedExpenseKrw: 1_200_000,
                variableExpenseKrw: 700_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
            ],
            byCategoryStats: [{ categoryId: "housing", totalKrw: 1_200_000 }],
            medians: {
              incomeKrw: 3_000_000,
              expenseKrw: 1_900_000,
              fixedExpenseKrw: 1_200_000,
              variableExpenseKrw: 700_000,
              debtExpenseKrw: 0,
            },
            ruleCoverage: { total: 1, override: 0, rule: 1, default: 0, transfer: 0 },
          },
          assumptions: ["assumption"],
          stats: {
            months: 3,
            transfersExcluded: true,
            unassignedCount: 0,
          },
        }}
        initialPreflight={{
          ok: true,
          targetProfileId: "p_1",
          changes: [{ path: "/monthlyIncomeNet", kind: "set", before: 2_000_000, after: 3_000_000 }],
          warnings: [{ code: "W_SAMPLE", message: "warning" }],
          errors: [{ path: "/goals", message: "sample error" }],
          summary: { changedCount: 1, errorCount: 1, warningCount: 1 },
        }}
        initialProfiles={[
          { profileId: "p_1", name: "default", updatedAt: "2026-03-03T00:00:00.000Z" },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-draft-meta"');
    expect(html).toContain('data-testid="v3-draft-base-profile-picker"');
    expect(html).toContain('data-testid="v3-draft-run-preflight"');
    expect(html).toContain('data-testid="v3-preflight-summary"');
    expect(html).toContain('data-testid="v3-preflight-errors"');
    expect(html).toContain('data-testid="v3-preflight-warnings"');
    expect(html).toContain('data-testid="v3-preflight-changes"');
  });
});
