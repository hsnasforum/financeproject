import { expect, test } from "@playwright/test";

test("dart search shows missing-index guidance", async ({ page }) => {
  const strictMissing = process.env.DART_E2E_EXPECT_MISSING === "1";
  const statusResponse = await page.request.get("/api/public/disclosure/corpcodes/status");
  const status = statusResponse.ok() ? await statusResponse.json() as { exists?: boolean } : { exists: undefined };
  if (status.exists === true && !strictMissing) {
    test.skip(true, "corpCodes index exists in current env; missing-index assertion skipped");
  }

  await page.goto("/public/dart");

  await page.getByTestId("dart-search-input").fill("삼성");
  await page.getByTestId("dart-search-submit").click();

  const missingCard = page.getByTestId("dart-missing-index");
  await expect(missingCard).toBeVisible({ timeout: 30_000 });
});
