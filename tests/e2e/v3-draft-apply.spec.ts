import { expect, test } from "@playwright/test";

test("planning v3 batch detail can move to draft review and export merged profile JSON", async ({ page }) => {
  await page.route("**/api/planning/v3/accounts**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        items: [
          { id: "acc-main", name: "메인 통장", kind: "checking", currency: "KRW" },
        ],
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/transactions\/batches\/batch-1(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        batch: {
          id: "batch-1",
          createdAt: "2026-03-03T00:00:00.000Z",
          kind: "csv",
          fileName: "sample.csv",
          accountId: "acc-main",
          accountHint: "acc-main",
          sha256: "hash-1",
          total: 4,
          ok: 4,
          failed: 0,
        },
        sample: [
          { line: 2, dateIso: "2026-01-10", amountKrw: 3200000, descMasked: "salary***", ok: true },
        ],
        stats: { total: 4, ok: 4, failed: 0, inferredMonths: 2 },
        monthsSummary: [
          { ym: "2026-01", incomeKrw: 3200000, expenseKrw: -1200000, netKrw: 2000000, txCount: 2 },
          { ym: "2026-02", incomeKrw: 3300000, expenseKrw: -1500000, netKrw: 1800000, txCount: 2 },
        ],
      }),
    });
  });

  await page.route("**/api/planning/v3/transactions/batches/batch-1/cashflow**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        monthly: [
          {
            month: "2026-01",
            inflowKrw: 3200000,
            outflowKrw: 1200000,
            netKrw: 2000000,
            fixedOutflowKrw: 800000,
            variableOutflowKrw: 400000,
            transferNetKrw: 0,
            daysCovered: 30,
            txCount: 2,
          },
          {
            month: "2026-02",
            inflowKrw: 3300000,
            outflowKrw: 1500000,
            netKrw: 1800000,
            fixedOutflowKrw: 900000,
            variableOutflowKrw: 600000,
            transferNetKrw: 0,
            daysCovered: 28,
            txCount: 2,
          },
        ],
        draftPatch: {
          suggestedMonthlyIncomeKrw: 3250000,
          suggestedMonthlyEssentialSpendKrw: 850000,
          suggestedMonthlyDiscretionarySpendKrw: 500000,
          confidence: "mid",
          splitMode: "byCategory",
          evidence: [
            {
              key: "income-median",
              title: "월평균 소득",
              formula: "median(last2)",
              inputs: { months: 2, incomeMedian: 3250000 },
              assumption: "최근 2개월 기준",
            },
          ],
        },
        profilePatch: {
          monthlyIncomeNet: 3250000,
          monthlyEssentialExpenses: 850000,
          monthlyDiscretionaryExpenses: 500000,
        },
      }),
    });
  });

  await page.route("**/api/planning/v3/drafts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, id: "draft-1" }),
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
          source: { kind: "csv", rows: 4, months: 2 },
          summary: {
            medianIncomeKrw: 3250000,
            medianExpenseKrw: 1350000,
            avgNetKrw: 1900000,
          },
          cashflow: [
            { ym: "2026-01", incomeKrw: 3200000, expenseKrw: -1200000, netKrw: 2000000, txCount: 2 },
            { ym: "2026-02", incomeKrw: 3300000, expenseKrw: -1500000, netKrw: 1800000, txCount: 2 },
          ],
          draftPatch: {
            monthlyIncomeNet: 3250000,
            monthlyEssentialExpenses: 850000,
            monthlyDiscretionaryExpenses: 500000,
            assumptions: ["split mode=byCategory"],
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
            isDefault: true,
          },
        ],
        meta: {
          defaultProfileId: "profile-base",
        },
      }),
    });
  });

  await page.route("**/api/planning/v3/draft/preview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mergedProfile: {
          monthlyIncomeNet: 3250000,
          monthlyEssentialExpenses: 850000,
          monthlyDiscretionaryExpenses: 500000,
          liquidAssets: 1000000,
          investmentAssets: 500000,
          debts: [],
          goals: [],
        },
        diffSummary: {
          changedKeys: ["monthlyIncomeNet", "monthlyEssentialExpenses", "monthlyDiscretionaryExpenses"],
          notes: ["monthly surplus: 1,000,000 -> 1,900,000 KRW"],
        },
        evidence: [
          {
            key: "income-median",
            title: "월평균 소득",
            formula: "median(last2)",
            inputs: { months: 2, incomeMedian: 3250000 },
            assumption: "최근 2개월 기준",
          },
        ],
      }),
    });
  });

  await page.goto("/planning/v3/transactions/batches/batch-1");

  await page.getByTestId("v3-go-draft-review").click();
  await expect(page).toHaveURL(/\/planning\/v3\/drafts\/draft-1(?:\?.*)?$/);
  await expect(page.getByTestId("v3-draft-review-root")).toBeVisible();

  await page.getByRole("button", { name: "적용 결과 미리보기" }).click();
  await expect(page.getByTestId("v3-draft-diff")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("v3-export-merged-json").click(),
  ]);
  expect(download.suggestedFilename()).toContain("profile-v2-draft-draft-1.json");
});
