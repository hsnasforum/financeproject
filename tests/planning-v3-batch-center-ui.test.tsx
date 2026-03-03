import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BatchesCenterClient } from "../src/app/planning/v3/batches/_components/BatchesCenterClient";
import { BatchSummaryClient } from "../src/app/planning/v3/batches/[id]/_components/BatchSummaryClient";

describe("planning v3 batch center UI", () => {
  it("renders list table and create draft action", () => {
    const html = renderToStaticMarkup(
      <BatchesCenterClient
        initialRows={[
          {
            batchId: "b_1",
            createdAt: "2026-03-03T00:00:00.000Z",
            stats: { months: 2, txns: 10, unassignedCategory: 1, transfers: 2 },
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="v3-batches-list"');
    expect(html).toContain("초안 생성");
  });

  it("renders summary card and draft create button", () => {
    const html = renderToStaticMarkup(
      <BatchSummaryClient
        id="b_1"
        initialSummary={{
          batchId: "b_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          range: { fromYm: "2026-01", toYm: "2026-02", months: 2 },
          counts: { txns: 8, transfers: 2, unassignedCategory: 1 },
          totals: { incomeKrw: 6_100_000, expenseKrw: 2_300_000, transferKrw: 1_000_000 },
          topExpenseCategories: [{ categoryId: "housing", totalKrw: 2_100_000 }],
          monthly: [
            { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: 1_200_000, transferKrw: 1_000_000 },
            { ym: "2026-02", incomeKrw: 3_100_000, expenseKrw: 1_100_000, transferKrw: 0 },
          ],
        }}
      />,
    );

    expect(html).toContain('data-testid="v3-batch-summary"');
    expect(html).toContain('data-testid="v3-batch-create-draft"');
  });
});

