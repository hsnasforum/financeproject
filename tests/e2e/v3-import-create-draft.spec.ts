import path from "node:path";
import { expect, test } from "@playwright/test";

test("planning v3 import creates draft and redirects to draft detail", async ({ page }) => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", "sample.csv");

  await page.route("**/api/planning/v3/import/csv/preview**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mappingSuggested: {
          dateKey: "date",
          amountKey: "amount",
          descKey: "description",
          confidence: { date: "high", amount: "high", desc: "high" },
          reasons: ["header match"],
        },
        validation: { ok: true },
        preview: {
          rows: [
            { line: 2, dateIso: "2026-01-01", amountKrw: 1000, descMasked: "sample***", ok: true },
          ],
          stats: { total: 1, ok: 1, failed: 0, inferredMonths: 1 },
        },
        warnings: [],
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/import\/csv(\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const bodyText = route.request().postData() ?? "{}";
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      parsedBody = {};
    }

    const persist = parsedBody.persist === true || route.request().url().includes("persist=1");

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        cashflow: [
          { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_500_000, netKrw: 1_500_000, txCount: 2 },
        ],
        meta: { rows: 2, months: 1 },
        draftPatch: {
          monthlyIncomeNet: 3_000_000,
          monthlyEssentialExpenses: 900_000,
          monthlyDiscretionaryExpenses: 600_000,
        },
        warnings: ["총 3행 중 2행을 거래로 반영했습니다."],
        stats: {
          transactions: 2,
          accounts: 1,
          period: { fromYm: "2026-01", toYm: "2026-01", months: 1 },
        },
        ...(persist
          ? {
              draftId: "d_import_1",
              data: {
                draftId: "d_import_1",
                draftSummary: { rows: 2, columns: 3 },
              },
            }
          : {
              data: {
                draftSummary: { rows: 2, columns: 3 },
              },
            }),
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/drafts\/d_import_1(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        draft: {
          id: "d_import_1",
          createdAt: "2026-03-03T00:00:00.000Z",
          source: { kind: "csv", rows: 2, months: 1 },
          summary: { medianIncomeKrw: 3_000_000, medianExpenseKrw: 1_500_000, avgNetKrw: 1_500_000 },
          cashflow: [
            { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_500_000, netKrw: 1_500_000, txCount: 2 },
          ],
          draftPatch: {
            monthlyIncomeNet: 3_000_000,
            monthlyEssentialExpenses: 900_000,
            monthlyDiscretionaryExpenses: 600_000,
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

  await page.goto("/planning/v3/import");
  await page.getByTestId("v3-csv-file").setInputFiles(fixturePath);
  await page.getByTestId("v3-mapping-apply").click();

  await expect(page.getByTestId("v3-save-draft")).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/planning\/v3\/drafts\/d_import_1(?:\?.*)?$/),
    page.getByTestId("v3-save-draft").click(),
  ]);

  await expect(page.getByTestId("v3-draft-review-root")).toBeVisible();
});
