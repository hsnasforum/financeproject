import { expect, test } from "./helpers/e2eTest";
import { type APIRequestContext } from "@playwright/test";
import { seedRunForReports } from "./helpers/planningGateHelpers";

function resolveBaseUrl(): string {
  const configured = (
    process.env.E2E_EXTERNAL_BASE_URL
    || process.env.BASE_URL
    || process.env.E2E_BASE_URL
    || process.env.PLANNING_BASE_URL
    || ""
  ).trim().replace(/\/+$/, "");
  if (configured) return configured;
  const port = (process.env.PORT || "3126").trim() || "3126";
  return `http://127.0.0.1:${port}`;
}

async function readDevCsrf(request: APIRequestContext): Promise<string> {
  const storageState = await request.storageState().catch(() => null);
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  return cookies.find((cookie) => cookie.name === "dev_csrf")?.value?.trim() ?? "";
}

async function createSeedProfile(request: APIRequestContext): Promise<string> {
  const baseUrl = resolveBaseUrl();
  const csrf = await readDevCsrf(request);
  const response = await request.post("/api/planning/v2/profiles", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning`,
      "content-type": "application/json",
    },
    data: {
      name: "기본 프로필",
      profile: {
        monthlyIncomeNet: 4_100_000,
        monthlyEssentialExpenses: 1_800_000,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 2_500_000,
        investmentAssets: 4_400_000,
        debts: [],
        goals: [
          {
            id: "goal-emergency",
            name: "비상금",
            targetAmount: 12_000_000,
            currentAmount: 1_000_000,
            targetMonth: 12,
            priority: 5,
            minimumMonthlyContribution: 0,
          },
        ],
      },
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const profileId = payload?.data?.id;
  if (!response.ok() || !payload?.ok || !profileId) {
    throw new Error(`failed to create seed profile: status=${response.status()}`);
  }
  return profileId;
}

test("/planner and /planner/* redirect to /planning", async ({ page }) => {
  await page.goto("/planner");
  await expect(page).toHaveURL(/\/planning$/, { timeout: 30_000 });

  await page.goto("/planner/reports");
  await expect(page).toHaveURL(/\/planning\/reports$/, { timeout: 30_000 });

  await page.goto("/planner/legacy");
  await expect(page).toHaveURL(/\/planning$/, { timeout: 30_000 });
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

test("/planning/reports shows run-based dashboard by default and keeps embedded markdown manager hidden", async ({ page, request }) => {
  const seeded = await seedRunForReports(request);
  await page.goto(
    `/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`,
  );
  await expect(page).toHaveURL(/\/planning\/reports(\?|$)/, { timeout: 30_000 });

  await expect(page.getByTestId("report-print-button")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("report-summary-cards")).toBeVisible({ timeout: 30_000 });
  const monthlyEvidenceToggle = page.getByTestId("evidence-toggle-monthlySurplus");
  if (await monthlyEvidenceToggle.count()) {
    await monthlyEvidenceToggle.click();
    await expect(page.getByTestId("evidence-panel-monthlySurplus")).toBeVisible();
  }
  const warningsTable = page.getByTestId("report-warnings-table");
  await expect(warningsTable).toBeVisible();
  await expect(page.getByRole("heading", { name: "리포트 목록" })).toHaveCount(0);
  const advancedToggle = page.getByTestId("report-advanced-toggle");
  await advancedToggle.scrollIntoViewIfNeeded();
  await expect(advancedToggle).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  await advancedToggle.click();
  await expect(advancedToggle).toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "리포트 목록" })).toBeVisible({ timeout: 30_000 });
});

test("/planning/runs shows print button", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page).toHaveURL(/\/planning\/runs(\?|$)/, { timeout: 30_000 });
  await expect(page.getByTestId("runs-print-button")).toBeVisible();
});

test("key interactive controls expose accessible names", async ({ page, request }) => {
  const seeded = await seedRunForReports(request);
  await page.goto("/planning");
  await expect(page.getByTestId("planning-profile-form")).toBeVisible();
  await expect(page.getByTestId("run-button")).toHaveAccessibleName("플래닝 실행");
  await expect(page.getByTestId("planning-snapshot-ops-link")).toBeVisible();

  await page.goto(
    `/planning/reports?runId=${encodeURIComponent(seeded.runId)}&profileId=${encodeURIComponent(seeded.profileId)}`,
  );
  await expect(page.getByTestId("report-advanced-toggle")).toContainText("고급 보기");
});

test("/planning keeps unsaved profile edits while preparing a new profile", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  await page.addInitScript((seededProfileId: string) => {
    window.localStorage.setItem("planning:v2:beginnerMode", "false");
    window.localStorage.setItem("planning:v2:selectedProfileId", seededProfileId);
  }, profileId);

  await page.goto(`/planning?profileId=${encodeURIComponent(profileId)}`);

  const profileForm = page.getByTestId("planning-profile-form");
  const profileNameInput = profileForm.getByLabel("프로필 이름");
  const monthlyIncomeInput = profileForm.getByLabel("월 실수령");
  const selectedProfileSelect = page.getByLabel("프로필 선택");

  await expect(selectedProfileSelect).toHaveValue(profileId, { timeout: 30_000 });
  await expect(profileNameInput).toHaveValue("기본 프로필", { timeout: 30_000 });
  await expect(monthlyIncomeInput).toHaveValue("4,100,000", { timeout: 30_000 });

  await monthlyIncomeInput.fill("5,300,000");
  await expect(monthlyIncomeInput).toHaveValue("5,300,000");

  await profileNameInput.fill("새 실험 프로필");
  await profileNameInput.blur();

  await expect(profileNameInput).toHaveValue("새 실험 프로필");
  await expect(monthlyIncomeInput).toHaveValue("5,300,000");
});
