import { expect, test } from "@playwright/test";

test("planning v3 import supports delimiter and inflow/outflow mapping", async ({ page }) => {
  const csv = [
    "posted;credit;debit;memo",
    "2026-01-01;1000000;;salary",
    "2026-01-05;;300000;rent",
  ].join("\n");

  await page.route("**/api/planning/v3/import/csv", async (route) => {
    const payload = route.request().postDataJSON() as {
      csvText?: string;
      mapping?: {
        dateKey?: string;
        inflowKey?: string;
        outflowKey?: string;
        delimiter?: string;
      };
    };

    expect(payload.csvText).toContain("posted;credit;debit");
    expect(payload.mapping?.dateKey).toBe("posted");
    expect(payload.mapping?.inflowKey).toBe("credit");
    expect(payload.mapping?.outflowKey).toBe("debit");
    expect(payload.mapping?.delimiter).toBe(";");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cashflow: [
          { ym: "2026-01", incomeKrw: 1_000_000, expenseKrw: -300_000, netKrw: 700_000, txCount: 2 },
        ],
        draftPatch: {
          monthlyIncomeNet: 700_000,
          monthlyEssentialExpenses: 210_000,
          monthlyDiscretionaryExpenses: 90_000,
        },
        meta: { rows: 2, months: 1 },
        mappingUsed: {
          dateKey: "posted",
          inflowKey: "credit",
          outflowKey: "debit",
          delimiter: ";",
        },
      }),
    });
  });

  await page.goto("/planning/v3/import");
  await page.getByTestId("v3-csv-text").fill(csv);
  await page.getByTestId("v3-csv-delimiter").selectOption(";");
  await page.getByTestId("v3-csv-submit").click();

  await expect(page.getByTestId("v3-csv-preview")).toBeVisible();
  await page.getByTestId("v3-mapping-date").selectOption("posted");
  await page.getByTestId("v3-mapping-mode-inout").check();
  await page.getByTestId("v3-mapping-inflow").selectOption("credit");
  await page.getByTestId("v3-mapping-outflow").selectOption("debit");
  await page.getByTestId("v3-mapping-apply").click();

  await expect(page.getByTestId("v3-import-meta")).toBeVisible();
  await expect(page.getByTestId("v3-cashflow-table")).toBeVisible();
});
