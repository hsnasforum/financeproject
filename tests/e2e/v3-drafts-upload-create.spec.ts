import path from "node:path";
import { expect, test } from "@playwright/test";

test("planning v3 drafts creates draft from csv upload and redirects to detail", async ({ page }) => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", "sample.csv");

  await page.route(/\/api\/planning\/v3\/drafts(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, drafts: [] }),
    });
  });

  await page.route(/\/api\/planning\/v3\/import\/csv(\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draftId: "d_upload_1",
        draftSummary: { rows: 3, columns: 3 },
        data: {
          draftId: "d_upload_1",
          draftSummary: { rows: 3, columns: 3 },
        },
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/drafts\/d_upload_1(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draft: {
          id: "d_upload_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          source: { kind: "csv", rows: 3, months: 2 },
          summary: { medianIncomeKrw: 3000000, medianExpenseKrw: 1500000, avgNetKrw: 1500000 },
          cashflow: [
            { ym: "2026-01", incomeKrw: 3000000, expenseKrw: -1500000, netKrw: 1500000, txCount: 2 },
            { ym: "2026-02", incomeKrw: 3200000, expenseKrw: -1700000, netKrw: 1500000, txCount: 1 },
          ],
          draftPatch: {
            monthlyIncomeNet: 3100000,
            monthlyEssentialExpenses: 900000,
            monthlyDiscretionaryExpenses: 700000,
          },
        },
      }),
    });
  });

  await page.route("**/api/planning/profiles**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [{ profileId: "profile-default", name: "기본 프로필", isDefault: true }],
        meta: { defaultProfileId: "profile-default" },
      }),
    });
  });

  await page.goto("/planning/v3/drafts");

  await page.getByTestId("v3-draft-upload-toggle").click();
  await page.getByTestId("v3-draft-upload-input").setInputFiles(fixturePath);

  await Promise.all([
    page.waitForURL(/\/planning\/v3\/drafts\/d_upload_1(?:\?.*)?$/),
    page.getByTestId("v3-draft-upload-submit").click(),
  ]);

  await expect(page.getByTestId("v3-draft-review-root")).toBeVisible();
});
