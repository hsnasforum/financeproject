import { expect, test } from "@playwright/test";

test("dashboard renders", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-root")).toBeVisible();
});

test("planning page renders", async ({ page }) => {
  await page.goto("/planning");
  await expect(page.getByRole("heading", { name: /재무설계 v2|Planning v2/i })).toBeVisible({ timeout: 30_000 });
});

test("recommend page renders", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByTestId("recommend-root")).toBeVisible();
  await expect(page.getByTestId("recommend-submit")).toBeVisible();
});

test("dart page shows missing index guidance when index absent", async ({ page, request }) => {
  const statusResponse = await request.get("/api/public/disclosure/corpcodes/status");
  const statusJson = statusResponse.ok() ? await statusResponse.json() as { exists?: boolean } : null;
  const indexMissing = statusJson?.exists !== true;

  await page.goto("/public/dart");
  if (indexMissing) {
    await page.getByTestId("dart-search-input").fill("삼성");
    await page.getByTestId("dart-search-submit").click();
    await expect(page.getByTestId("dart-missing-index")).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByTestId("dart-search-input")).toBeVisible();
    await expect(page.getByTestId("dart-search-submit")).toBeVisible();
  }
});
