import { expect, test } from "@playwright/test";

const hasFinlifeEnv = Boolean(process.env.FINLIFE_API_KEY);

test.describe("finlife option group", () => {
  test.skip(!hasFinlifeEnv, "FINLIFE_API_KEY missing");

  test("deposit option group toggle shows options table", async ({ page }) => {
    await page.goto("/products/deposit?scan=all&maxPages=auto&view=option&optGroup=1");

    const toggle = page.locator('[data-testid="finlife-group-toggle"]').first();
    await expect(toggle).toBeVisible({ timeout: 30_000 });

    const groupKey = await toggle.getAttribute("data-group-key");
    expect(groupKey).toBeTruthy();

    await toggle.click();

    const table = page.locator(`[data-testid="finlife-group-table"][data-group-key="${groupKey}"]`);
    await expect(table).toBeVisible();
    await expect(table.locator("text=기간(개월)")).toBeVisible();
  });
});
