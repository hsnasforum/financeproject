import { expect, test } from "@playwright/test";

test("planning v3 import mapping wizard applies selected mapping and shows result", async ({ page }) => {
  const csv = [
    "when,value,memo,direction",
    "2026-01-01,1000000,salary,credit",
    "2026-01-05,300000,rent,debit",
  ].join("\n");

  await page.route("**/api/planning/v3/import/csv", async (route) => {
    const payload = route.request().postDataJSON() as {
      csvText?: string;
      mapping?: {
        dateKey?: string;
        amountKey?: string;
        descKey?: string;
        typeKey?: string;
        amountSign?: string;
      };
    };
    expect(payload.mapping?.dateKey).toBe("when");
    expect(payload.mapping?.amountKey).toBe("value");
    expect(payload.mapping?.descKey).toBe("memo");
    expect(payload.mapping?.amountSign).toBe("signed");

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
          assumptions: [
            "monthlyIncomeNet uses median monthly net (assumption)",
            "expense split 70/30 (assumption)",
          ],
          monthsConsidered: 1,
        },
        meta: { rows: 2, months: 1 },
        mappingUsed: {
          dateKey: "when",
          amountKey: "value",
          descKey: "memo",
          typeKey: "direction",
          amountSign: "signed",
        },
      }),
    });
  });

  await page.goto("/planning/v3/import");
  await page.getByTestId("v3-csv-text").fill(csv);
  await page.getByTestId("v3-csv-submit").click();

  await page.getByTestId("v3-mapping-date").selectOption("when");
  await page.getByTestId("v3-mapping-amount").selectOption("value");
  await page.getByTestId("v3-mapping-desc").selectOption("memo");
  await page.getByTestId("v3-mapping-sign").selectOption("signed");
  await page.getByTestId("v3-mapping-apply").click();

  await expect(page.getByTestId("v3-import-meta")).toBeVisible();
  await expect(page.getByTestId("v3-cashflow-table")).toBeVisible();
});

