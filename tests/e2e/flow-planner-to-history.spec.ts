import { expect, test } from "@playwright/test";

test("planning workspace links to runs page", async ({ page }) => {
  await page.goto("/planning");
  await page.getByRole("link", { name: "실행 이력 보기" }).click();
  await expect(page).toHaveURL(/\/planning\/runs$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "실행 이력" })).toBeVisible({ timeout: 30_000 });
});
