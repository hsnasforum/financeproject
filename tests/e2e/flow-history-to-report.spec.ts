import { expect, test, type Page } from "./helpers/e2eTest";

async function gotoWithAbortRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("net::ERR_ABORTED") || attempt === 1) throw error;
    }
  }
}

test("planning runs and reports pages render", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });

  await gotoWithAbortRetry(page, "/planning/reports");
  await expect(page.getByRole("heading", { name: /플래닝 리포트|재무설계 리포트/i })).toBeVisible({ timeout: 30_000 });
});
