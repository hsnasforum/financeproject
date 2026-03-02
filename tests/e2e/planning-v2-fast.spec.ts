import { expect, test } from "@playwright/test";
import { seedRunForReports } from "./helpers/planningGateHelpers";

test("/planner and /planner/* redirect to /planning", async ({ page }) => {
  await page.goto("/planner");
  await expect(page).toHaveURL(/\/planning$/);

  await page.goto("/planner/legacy");
  await expect(page).toHaveURL(/\/planning\/legacy$/);
});

test("/planning shows form by default and hides raw JSON until Advanced toggle", async ({ page }) => {
  await page.goto("/planning");

  await expect(page.getByTestId("planning-profile-form")).toBeVisible();
  await expect(page.getByTestId("planning-json-editor")).toBeHidden();

  await expect(page.getByTestId("snapshot-selector")).toBeVisible();
  const tagName = await page.getByTestId("planning-snapshot-select").evaluate((node) => node.tagName);
  expect(tagName).toBe("SELECT");
  await expect(page.locator('input[name="snapshotId"]')).toHaveCount(0);
  await expect(page.getByTestId("snapshot-stale-badge")).toBeVisible();

  await page.getByTestId("planning-advanced-toggle").click();
  await expect(page.getByTestId("planning-json-editor")).toBeVisible();
});

test("/planning/reports shows run-based dashboard by default and keeps raw hidden", async ({ page, request }) => {
  const seeded = await seedRunForReports(request);
  await page.goto(
    `/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`,
  );
  await expect(page).toHaveURL(/\/planning\/reports(\?|$)/, { timeout: 30_000 });

  await expect(page.getByTestId("report-print-button")).toBeVisible();
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  await expect(page.getByTestId("report-summary-cards")).toBeVisible();
  const monthlyEvidenceToggle = page.getByTestId("evidence-toggle-monthlySurplus");
  if (await monthlyEvidenceToggle.count()) {
    await monthlyEvidenceToggle.click();
    await expect(page.getByTestId("evidence-panel-monthlySurplus")).toBeVisible();
  }
  const warningsTable = page.getByTestId("report-warnings-table");
  await expect(warningsTable).toBeVisible();
  await expect(page.getByTestId("report-advanced-raw")).toBeHidden();
  await page.getByTestId("report-advanced-toggle").click();
  await expect(page.getByTestId("report-advanced-raw")).toBeVisible();
});

test("/planning/runs shows print button", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page).toHaveURL(/\/planning\/runs(\?|$)/, { timeout: 30_000 });
  await expect(page.getByTestId("runs-print-button")).toBeVisible();
});

test("key interactive controls expose accessible names", async ({ page, request }) => {
  await page.goto("/planning");
  await expect(page.getByTestId("planning-profile-form")).toBeVisible();
  await expect(page.getByTestId("run-button")).toHaveAccessibleName("실행");
  await expect(page.getByTestId("planning-snapshot-ops-link")).toBeVisible();

  const seeded = await seedRunForReports(request);
  await page.goto(
    `/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`,
  );
  await expect(page.getByTestId("report-advanced-toggle")).toContainText("고급 보기");
});
