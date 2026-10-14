import { expect, test } from "./helpers/e2eTest";

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
  await expect(missingCard).not.toContainText(/scripts\/|python|pnpm|\/api\/dev/i);
});

test("invest companies hides missing-index ops commands", async ({ page }) => {
  const strictMissing = process.env.DART_E2E_EXPECT_MISSING === "1";
  const statusResponse = await page.request.get("/api/public/disclosure/corpcodes/status");
  const status = statusResponse.ok() ? await statusResponse.json() as { exists?: boolean } : { exists: undefined };
  if (status.exists === true && !strictMissing) {
    test.skip(true, "corpCodes index exists in current env; missing-index assertion skipped");
  }

  await page.goto("/invest/companies");
  // Retrying the clear button below already waits for hydration; networkidle stalled for 60s in CI.
  const searchInput = page.getByPlaceholder("예: 삼성전자, 현대자동차");
  await expect(async () => {
    await page.getByRole("button", { name: "검색어 지우기" }).click();
    await expect(searchInput).toHaveValue("");
  }).toPass({ timeout: 30_000 });
  await searchInput.fill("삼성");
  await page.getByRole("button", { name: "회사 후보 보기" }).click();

  const missingCard = page.getByTestId("invest-companies-missing-index");
  await expect(missingCard).toBeVisible({ timeout: 30_000 });
  await expect(missingCard).not.toContainText(/scripts\/|python|pnpm|\/api\/dev/i);
});
