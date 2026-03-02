import { expect, test } from "@playwright/test";

test("planning workspace links to runs page", async ({ page }) => {
  await page.goto("/planning");
  await page.locator("main").getByRole("link", { name: "실행 기록", exact: true }).click();
  await expect(page).toHaveURL(/\/planning\/runs$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });
});
