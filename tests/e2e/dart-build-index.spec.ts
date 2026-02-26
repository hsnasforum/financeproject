import { expect, test } from "@playwright/test";

test("dart missing index -> build button creates index -> search results appear", async ({ page }) => {
  const strictMissing = process.env.DART_E2E_EXPECT_MISSING === "1";
  const statusResponse = await page.request.get("/api/public/disclosure/corpcodes/status");
  const status = statusResponse.ok() ? await statusResponse.json() as { exists?: boolean } : { exists: undefined };
  if (status.exists === true && !strictMissing) {
    test.skip(true, "corpCodes index exists in current env; build-flow assertion skipped");
  }

  await page.goto("/public/dart");
  await page.getByTestId("dart-search-input").fill("삼성");
  await page.getByTestId("dart-search-submit").click();

  await expect(page.getByTestId("dart-missing-index")).toBeVisible({ timeout: 30_000 });

  const buildButton = page.getByTestId("dart-build-index-button");
  await expect(buildButton).toBeVisible({ timeout: 30_000 });
  await buildButton.click();

  await expect(page.getByTestId("dart-missing-index")).toHaveCount(0, { timeout: 30_000 });

  await page.getByTestId("dart-search-submit").click();
  await expect(page.getByTestId("dart-search-item").first()).toBeVisible({ timeout: 30_000 });
});
