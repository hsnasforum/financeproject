import { expect, test } from "@playwright/test";

test("planning v3 draft detail can preview apply and save as new profile manually", async ({ page }) => {
  await page.route("**/api/planning/v3/drafts/draft-1/preview-apply**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        summary: {
          changedFields: [
            "monthlyIncomeNet",
            "monthlyEssentialExpenses",
          ],
          notes: [
            "monthly surplus: 1,000,000 -> 1,250,000 KRW",
            "DSR: 12.00% -> 10.50%",
          ],
        },
        mergedProfile: {
          monthlyIncomeNet: 3_300_000,
          monthlyEssentialExpenses: 1_400_000,
          monthlyDiscretionaryExpenses: 650_000,
          liquidAssets: 12_000_000,
          investmentAssets: 8_000_000,
          debts: [],
          goals: [],
        },
      }),
    });
  });

  await page.route("**/api/planning/v3/drafts/draft-1/create-profile", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        profileId: "profile-new-1",
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/drafts\/draft-1(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draft: {
          id: "draft-1",
          createdAt: "2026-03-03T00:00:00.000Z",
          source: { kind: "csv", rows: 10, months: 3 },
          summary: {
            medianIncomeKrw: 3_300_000,
            medianExpenseKrw: 1_900_000,
            avgNetKrw: 1_200_000,
            notes: ["assumption note"],
          },
          cashflow: [
            { ym: "2026-01", incomeKrw: 3_400_000, expenseKrw: -2_000_000, netKrw: 1_400_000, txCount: 3 },
            { ym: "2026-02", incomeKrw: 3_200_000, expenseKrw: -1_900_000, netKrw: 1_300_000, txCount: 4 },
          ],
          draftPatch: {
            monthlyIncomeNet: 3_300_000,
            monthlyEssentialExpenses: 1_400_000,
            monthlyDiscretionaryExpenses: 650_000,
            assumptions: ["assumption note"],
            monthsConsidered: 2,
          },
        },
      }),
    });
  });

  await page.route("**/api/planning/profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            profileId: "profile-base",
            name: "기본 프로필",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            isDefault: true,
          },
        ],
        meta: {
          defaultProfileId: "profile-base",
        },
      }),
    });
  });

  await page.goto("/planning/v3/drafts/draft-1");

  await page.getByTestId("v3-apply-profile-select").selectOption("profile-base");
  await page.getByTestId("v3-apply-preview").click();

  await expect(page.getByTestId("v3-apply-summary")).toBeVisible();
  await expect(page.getByTestId("v3-apply-summary").getByText("monthlyIncomeNet")).toBeVisible();
  await expect(page.getByTestId("v3-apply-download")).toBeVisible();

  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByTestId("v3-apply-save-new").click();

  await expect(page).toHaveURL(/\/planning\?profileId=profile-new-1/);
});
