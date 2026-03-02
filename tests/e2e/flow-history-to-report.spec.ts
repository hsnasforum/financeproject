import { expect, test } from "@playwright/test";

test("planning runs and reports pages render", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/planning/reports");
  await expect(page.getByRole("heading", { name: /플래닝 리포트|재무설계 리포트/i })).toBeVisible({ timeout: 30_000 });
});
