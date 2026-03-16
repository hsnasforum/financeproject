import { expect, test } from "./helpers/e2eTest";
import { runPlanningPipeline, seedGoldenRuns, seedRunForReports } from "./helpers/planningGateHelpers";

test("run pipeline shows stage timeline and reports dashboard contracts", async ({ page, request }) => {
  test.setTimeout(240_000);
  const simulateStatus = await runPlanningPipeline(page);
  expect(["SUCCESS", "FAILED", "SKIPPED"]).toContain(simulateStatus);
  const seeded = await seedRunForReports(request);

  await page.goto(
    `/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`,
  );
  await expect(page).toHaveURL(/\/planning\/reports(\?|$)/, { timeout: 30_000 });
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  await expect(page.getByTestId("report-summary-cards")).toBeVisible();
  await expect(page.getByTestId("report-top-actions")).toBeVisible();
  const reviewWarningsAction = page.locator('[data-action-id="REDUCE_DEBT_SERVICE"]').first();
  if (await reviewWarningsAction.count()) {
    await reviewWarningsAction.click();
    await expect(page).toHaveURL(/#warnings$/);
  }

  const warningsTable = page.getByTestId("report-warnings-table");
  const warningsSection = page.getByTestId("planning-reports-warnings-section");
  if (await warningsTable.count()) {
    await expect(warningsTable).toBeVisible();
  } else if (await warningsSection.count()) {
    await expect(warningsSection).toContainText("경고가 없습니다.");
  }

  await expect(page.getByRole("heading", { name: "리포트 목록" })).toHaveCount(0);
  const advancedToggle = page.getByTestId("report-advanced-toggle");
  await expect(advancedToggle).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await advancedToggle.click();
  await expect(page.getByRole("heading", { name: "리포트 목록" })).toBeVisible({ timeout: 30_000 });
});

test("golden deterministic replay renders report contracts for canonical fixtures", async ({ page, request }) => {
  test.setTimeout(300_000);
  const seededRuns = await seedGoldenRuns(request);
  expect(seededRuns).toHaveLength(3);

  for (const seeded of seededRuns) {
    await test.step(`golden:${seeded.fixture.id}`, async () => {
      await page.goto(`/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`);
      await expect(page).toHaveURL(/\/planning\/reports(\?|$)/, { timeout: 30_000 });
      await expect(page.getByTestId("report-dashboard")).toBeVisible();
      await expect(page.getByTestId("report-summary-cards")).toBeVisible();
      await expect(page.getByTestId("report-warnings-table")).toBeVisible();
      await expect(page.getByTestId("report-top-actions")).toBeVisible();
      const evidenceToggle = page.getByTestId("evidence-toggle-monthlySurplus");
      if (await evidenceToggle.count()) {
        await evidenceToggle.click();
        await expect(page.getByTestId("evidence-panel-monthlySurplus")).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: "리포트 목록" })).toHaveCount(0);

      const compareToggle = page.getByTestId("compare-toggle");
      if (await compareToggle.count()) {
        await expect(compareToggle).toBeVisible();
      } else {
        await page.goto(`/planning/reports/${encodeURIComponent(seeded.runId)}`);
        await expect(page.getByTestId("compare-toggle")).toBeVisible();
      }
    });
  }

  const actionCenterTarget = seededRuns[0];
  await page.goto(`/planning/runs/${encodeURIComponent(actionCenterTarget.runId)}`);
  await expect(page.getByTestId("run-action-center")).toBeVisible();
});
