import { expect, test } from "@playwright/test";

const hasBenefitsEnv = Boolean(process.env.MOIS_BENEFITS_API_KEY && process.env.MOIS_BENEFITS_API_URL);

test.describe("benefits sigungu", () => {
  test.skip(!hasBenefitsEnv, "MOIS_BENEFITS_API_KEY or MOIS_BENEFITS_API_URL missing");

  test("benefits sido/sigungu click stays stable", async ({ page }) => {
    await page.goto("/benefits?query=%EC%B2%AD%EB%85%84&scan=all&limit=200&maxPages=auto&rows=200");

    const busan = page.locator('[data-testid="benefits-sido"][data-sido="부산"]');
    await expect(busan).toBeVisible({ timeout: 30_000 });
    await busan.click();

    const sigunguButtons = page.locator('[data-testid="benefits-sigungu"]');
    const sigunguCount = await sigunguButtons.count();
    if (sigunguCount > 0) {
      await sigunguButtons.first().click();
    }

    await expect(page.locator('[data-testid="benefits-error-banner"]')).toHaveCount(0);

    const resultCount = await page.locator('[data-testid="benefits-item"]').count();
    if (resultCount > 0) {
      await expect(page.locator('[data-testid="benefits-item"]').first()).toBeVisible();
    } else {
      await expect(page.locator('[data-testid="benefits-empty"]')).toBeVisible();
    }
  });
});
