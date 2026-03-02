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

  await page.getByTestId("planning-advanced-toggle-button").click();
  await expect(page.getByTestId("planning-json-editor")).toBeVisible();
});

test("/planning/reports shows run-based dashboard by default and keeps raw hidden", async ({ page, request }) => {
  const runId = await seedRunForReports(request);
  await page.goto(`/planning/reports/${encodeURIComponent(runId)}`);
  await expect(page).toHaveURL(new RegExp(`/planning/reports/${runId}$`), { timeout: 30_000 });

  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  await expect(page.getByTestId("report-summary-cards")).toBeVisible();
  const monthlyEvidenceToggle = page.getByTestId("evidence-toggle-monthlySurplus");
  if (await monthlyEvidenceToggle.count()) {
    await monthlyEvidenceToggle.click();
    await expect(page.getByTestId("evidence-panel-monthlySurplus")).toBeVisible();
  }
  await expect(page.getByTestId("planning-reports-warnings-section")).toBeVisible();
  const warningsTable = page.getByTestId("report-warnings-table");
  if (await warningsTable.count()) {
    await expect(warningsTable).toBeVisible();
  } else {
    await expect(page.getByTestId("planning-reports-warnings-section")).toContainText("경고가 없습니다.");
  }
  await expect(page.getByTestId("report-advanced-raw")).toHaveCount(0);
});

test("key interactive controls expose accessible names", async ({ page, request }) => {
  await page.goto("/planning");
  await expect(page.getByLabel("월 실수령")).toBeVisible();
  await expect(page.getByTestId("run-button")).toHaveAccessibleName("실행");
  await expect(page.getByRole("link", { name: "/ops/assumptions" })).toBeVisible();

  const runId = await seedRunForReports(request);
  await page.goto(`/planning/reports/${encodeURIComponent(runId)}`);
  await expect(page.getByTestId("planning-reports-advanced-toggle")).toHaveAccessibleName(/고급 보기/);
});
