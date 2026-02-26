import { expect, test } from "@playwright/test";

test("planner -> history -> report render", async ({ page }) => {
  await page.goto("/planner");
  await page.getByTestId("planner-compute").click();
  await expect(page.getByTestId("planner-action-cta")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("planner-action-cta").click();
  await expect(page).toHaveURL(/\/recommend\/history\?open=/, { timeout: 60_000 });
  await expect(page.getByTestId("history-open-run")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId("history-open-report")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("history-open-report").click();

  await expect(page).toHaveURL(/\/report\?runId=/, { timeout: 60_000 });
  await expect(page.getByTestId("report-root")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("report-recommend-table")).toBeVisible({ timeout: 30_000 });
});
