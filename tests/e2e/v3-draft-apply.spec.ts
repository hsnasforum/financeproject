import { expect, test } from "./helpers/e2eTest";

test("planning v3 profile draft flow can create, preflight, and apply a saved draft", async ({ page }) => {
  let listGetCount = 0;

  await page.route(/\/api\/planning\/v3\/profile\/drafts(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      listGetCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: listGetCount === 1 ? [] : [
            {
              draftId: "draft-1",
              id: "draft-1",
              batchId: "batch-1",
              createdAt: "2026-03-03T00:00:00.000Z",
              stats: {
                months: 2,
                unassignedCount: 1,
              },
            },
          ],
        }),
      });
      return;
    }

    if (method === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: "draft-1",
            batchId: "batch-1",
            createdAt: "2026-03-03T00:00:00.000Z",
            stats: {
              months: 2,
              unassignedCount: 1,
            },
          },
        }),
      });
      return;
    }

    await route.fallback();
  });

  await page.route(/\/api\/planning\/v3\/profile\/drafts\/draft-1(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          id: "draft-1",
          batchId: "batch-1",
          createdAt: "2026-03-03T00:00:00.000Z",
          draftPatch: {
            monthlyIncomeNet: 3_250_000,
            monthlyEssentialExpenses: 850_000,
            monthlyDiscretionaryExpenses: 500_000,
            assumptions: ["최근 2개월 기준"],
            monthsConsidered: 2,
          },
          evidence: {
            monthsUsed: ["2026-01", "2026-02"],
            ymStats: [
              {
                ym: "2026-01",
                incomeKrw: 3_200_000,
                expenseKrw: 1_200_000,
                fixedExpenseKrw: 800_000,
                variableExpenseKrw: 400_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
              {
                ym: "2026-02",
                incomeKrw: 3_300_000,
                expenseKrw: 1_500_000,
                fixedExpenseKrw: 900_000,
                variableExpenseKrw: 600_000,
                debtExpenseKrw: 0,
                transferKrw: 0,
              },
            ],
            byCategoryStats: [
              { categoryId: "housing", totalKrw: 900_000 },
              { categoryId: "food", totalKrw: 450_000 },
            ],
            medians: {
              incomeKrw: 3_250_000,
              expenseKrw: 1_350_000,
              fixedExpenseKrw: 850_000,
              variableExpenseKrw: 500_000,
              debtExpenseKrw: 0,
            },
            ruleCoverage: {
              total: 3,
              override: 0,
              rule: 3,
              default: 0,
              transfer: 0,
            },
          },
          assumptions: ["최근 2개월 기준"],
          stats: {
            months: 2,
            transfersExcluded: true,
            unassignedCount: 1,
          },
        },
      }),
    });
  });

  await page.route(/\/api\/planning\/v3\/profiles(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            profileId: "profile-base",
            name: "기본 프로필",
            updatedAt: "2026-03-03T00:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route("**/api/planning/v3/profile/drafts/draft-1/preflight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          ok: true,
          targetProfileId: "profile-base",
          changes: [
            {
              path: "/monthlyIncomeNet",
              kind: "set",
              before: 3_000_000,
              after: 3_250_000,
            },
          ],
          warnings: [
            {
              code: "W_SAMPLE",
              message: "변경 내용을 검토한 뒤 적용해 주세요.",
            },
          ],
          errors: [],
          summary: {
            changedCount: 1,
            errorCount: 0,
            warningCount: 1,
          },
        },
      }),
    });
  });

  await page.route("**/api/planning/v3/profile/drafts/draft-1/apply", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          profileId: "profile-new",
        },
      }),
    });
  });

  await page.goto("/planning/v3/profile/drafts");

  await expect(page.getByText("저장된 profile draft가 없습니다.")).toBeVisible();

  await page.getByLabel("batchId").fill("batch-1");
  await page.getByRole("button", { name: "초안 생성" }).click();

  await expect(page).toHaveURL(/\/planning\/v3\/profile\/drafts\/draft-1$/);
  await expect(page.getByTestId("v3-draft-meta")).toBeVisible();
  await expect(page.getByTestId("v3-draft-apply-guidance")).toContainText(
    "프리플라이트를 먼저 실행하면 이 기준으로 적용 가능 여부가 정리됩니다.",
  );

  await page.getByTestId("v3-draft-base-profile-picker").selectOption("profile-base");
  await page.getByTestId("v3-draft-run-preflight").click();

  await expect(page.getByTestId("v3-preflight-summary")).toBeVisible();
  await expect(page.getByTestId("v3-draft-apply-guidance")).toContainText(
    "경고를 확인한 뒤 적용할 수 있습니다.",
  );

  await page.getByTestId("v3-draft-apply-profile").click();
  await expect(page).toHaveURL(/\/planning\?profileId=profile-new$/);
});
