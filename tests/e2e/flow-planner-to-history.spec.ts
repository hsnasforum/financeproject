import { expect, test } from "./helpers/e2eTest";

test("planning workspace links to runs page", async ({ page }) => {
  await page.goto("/planning");
  const workspace = page.locator("main").last();
  const runsLink = workspace.getByTestId("planning-runs-link");

  await expect(runsLink).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await expect(runsLink).toHaveAttribute("href", /\/planning\/runs(?:\?profileId=.+)?$/);
  await runsLink.click();
  await expect(page).toHaveURL(/\/planning\/runs(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });
});
