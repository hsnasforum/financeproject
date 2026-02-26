import { expect, test } from "@playwright/test";

test("planner -> recommend autorun/save -> history open", async ({ page }) => {
  await page.goto("/planner");

  await page.getByTestId("planner-compute").click();
  await expect(page.getByTestId("planner-actions")).toBeVisible({ timeout: 30_000 });

  const cta = page.getByTestId("planner-action-cta");
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", /autorun=1/);
  await expect(cta).toHaveAttribute("href", /save=1/);
  await expect(cta).toHaveAttribute("href", /go=history/);

  await cta.click();

  await expect(page).toHaveURL(/\/recommend\/history\?open=/, { timeout: 60_000 });
  await expect(page.getByTestId("history-open-run")).toBeVisible({ timeout: 30_000 });
});
