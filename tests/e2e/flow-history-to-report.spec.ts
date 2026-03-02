import { expect, test } from "@playwright/test";

test("planning runs and reports pages render", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page.getByRole("heading", { name: "실행 이력" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/planning/reports");
  await expect(page.getByRole("heading", { name: "재무설계 리포트" })).toBeVisible({ timeout: 30_000 });
});
