import { expect, test } from "@playwright/test";

test("dart search -> company detail flow", async ({ page }) => {
  await page.goto("/public/dart");

  await page.getByTestId("dart-search-input").fill("삼성");
  await page.getByTestId("dart-search-submit").click();

  const missingIndexCard = page.getByTestId("dart-missing-index");
  if (await missingIndexCard.isVisible().catch(() => false)) {
    const buildButton = page.getByTestId("dart-build-index-button");
    await expect(buildButton).toBeVisible({ timeout: 30_000 });
    await buildButton.click();
    await expect(missingIndexCard).toHaveCount(0, { timeout: 30_000 });
    await page.getByTestId("dart-search-submit").click();
  }

  const firstItem = page.getByTestId("dart-search-item").first();
  await expect(firstItem).toBeVisible({ timeout: 30_000 });
  await firstItem.click();

  await expect(page).toHaveURL(/\/public\/dart\/company\?corpCode=/, { timeout: 30_000 });
  await expect(page.getByTestId("dart-company-root")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-company-name")).toBeVisible({ timeout: 30_000 });
});
