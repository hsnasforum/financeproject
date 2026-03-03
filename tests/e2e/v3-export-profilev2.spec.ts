import { expect, test } from "@playwright/test";

test("planning v3 draft detail exports ProfileV2 draft as download", async ({ page, request }) => {
  const baseURL = `${test.info().project.use.baseURL ?? "http://127.0.0.1:3100"}`.replace(/\/+$/, "");

  const createResponse = await request.post("/api/planning/v3/drafts", {
    headers: {
      origin: baseURL,
      referer: `${baseURL}/planning/v3/import`,
      "content-type": "application/json",
    },
    data: {
      cashflow: [
        { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_200_000, netKrw: 1_800_000, txCount: 3 },
        { ym: "2026-02", incomeKrw: 3_101_234, expenseKrw: -900_000, netKrw: 2_201_234, txCount: 3 },
      ],
      draftPatch: {
        monthlyIncomeNet: 2_201_234,
        monthlyEssentialExpenses: 735_000,
        monthlyDiscretionaryExpenses: 315_000,
        assumptions: [
          "monthlyIncomeNet uses median monthly net (assumption)",
          "expense split 70/30 (assumption)",
        ],
        monthsConsidered: 2,
      },
      meta: { rows: 6, months: 2 },
    },
  });

  expect(createResponse.ok()).toBe(true);
  const createJson = await createResponse.json() as { draft?: { id?: string } };
  const draftId = createJson.draft?.id ?? "";
  expect(draftId.length).toBeGreaterThan(0);

  await page.goto(`/planning/v3/drafts/${encodeURIComponent(draftId)}`);
  await expect(page.getByTestId("v3-export-profilev2")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("v3-export-profilev2").click(),
  ]);

  expect(download.suggestedFilename()).toBe("profile-v2-draft.json");
});

