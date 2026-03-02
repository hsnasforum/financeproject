import { expect, test } from "@playwright/test";

test("planning v3 import page renders summary and cashflow table", async ({ page }) => {
  const sampleCsv = [
    "date,amount,description",
    "2026-01-01,1000000,salary",
    "2026-01-10,-300000,rent",
    "2026-02-01,1200000,salary",
  ].join("\n");

  let capturedBody = "";

  await page.route("**/api/planning/v3/import/csv", async (route) => {
    capturedBody = route.request().postData() ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cashflow: [
          {
            ym: "2026-01",
            incomeKrw: 1_000_000,
            expenseKrw: -300_000,
            netKrw: 700_000,
            txCount: 2,
          },
          {
            ym: "2026-02",
            incomeKrw: 1_200_000,
            expenseKrw: 0,
            netKrw: 1_200_000,
            txCount: 1,
          },
        ],
        draftPatch: {
          monthlyIncomeNet: 950_000,
          monthlyEssentialExpenses: 210_000,
          monthlyDiscretionaryExpenses: 90_000,
        },
        meta: {
          rows: 3,
          months: 2,
        },
      }),
    });
  });

  await page.goto("/planning/v3/import");

  await expect(page.getByTestId("v3-import-root")).toBeVisible();
  await page.getByTestId("v3-import-textarea").fill(sampleCsv);
  await page.getByTestId("v3-import-submit").click();

  await expect(page.getByTestId("v3-import-meta-rows")).toContainText("3");
  await expect(page.getByTestId("v3-import-meta-months")).toContainText("2");
  await expect(page.getByTestId("v3-import-cashflow-table")).toBeVisible();
  await expect(page.getByTestId("v3-import-cashflow-row-2026-01")).toBeVisible();
  await expect(page.getByTestId("v3-import-cashflow-row-2026-02")).toBeVisible();
  await expect(page.getByTestId("v3-import-draft-json")).not.toBeVisible();

  expect(capturedBody).toContain("2026-01-01");
  expect(capturedBody).toContain("salary");
});
