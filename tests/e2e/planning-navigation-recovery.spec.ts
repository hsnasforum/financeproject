import { seedRunForReports } from "./helpers/planningGateHelpers";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Deliberately replace only the workspace element in a valid Flight response.
// React commits an empty child; this is NOT a reproduction of the original router defect.
async function emptyPlanningWorkspace(page: Page, titleOnly = false) {
  let replacements = 0;
  await page.route("**/planning?*", async (route) => {
    if (route.request().headers().rsc !== "1") return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).split("\n").map((line) => {
      const colon = line.indexOf(":");
      if (colon < 0 || !["[", "{"].includes(line[colon + 1])) return line;
      let model: unknown;
      try { model = JSON.parse(line.slice(colon + 1)); } catch { return line; }
      function replace(value: unknown): unknown {
        if (Array.isArray(value)) {
          const props = value[3];
          if (value[0] === "$" && props && typeof props === "object"
              && ["featureFlags", "snapshotItems", "initialSelectedProfileId", "initialSelectedProfile", "csrf"]
                .every((key) => key in props)) {
            replacements++;
            return titleOnly ? ["$", "h1", null, { children: "재무 진단" }] : ["$", "$Sreact.fragment", null, { children: [] }];
          }
          return value.map(replace);
        }
        if (value && typeof value === "object") {
          return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
        }
        return value;
      }
      return line.slice(0, colon + 1) + JSON.stringify(replace(model));
    }).join("\n");
    await route.fulfill({ response, body });
  });
  return () => replacements;
}

async function openFromDashboard(page: Page) {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
  await page.getByRole("navigation", { name: "데스크톱 주 메뉴" })
    .getByRole("link", { name: "재무진단", exact: true }).click();
  await expect(page).toHaveURL(/\/planning(?:\?|$)/);
}

test("empty Flight body offers independent recovery and explicit reload", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const replacements = await emptyPlanningWorkspace(page);
  await openFromDashboard(page);
  await expect.poll(replacements).toBe(1);
  await expect(page.locator("#planning-input-section")).toHaveCount(0);
  await expect(page.getByTestId("planning-loading-state")).toHaveCount(0);
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  await expect(recovery).toContainText("저장하지 않은 입력");
  await page.screenshot({ path: testInfo.outputPath("recovery.png"), fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await recovery.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.locator("#planning-input-section")).toBeVisible({ timeout: 30_000 });
  await expect(recovery).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("normal navigation and unsaved input do not offer recovery", async ({ page }) => {
  await openFromDashboard(page);
  await expect(page.locator("#planning-input-section")).toBeVisible();
  const income = page.getByTestId("planning-profile-form").getByLabel("월 실수령");
  await income.fill("4,321,000");
  await page.waitForTimeout(11_500); // Observe beyond the product's blank-body grace period.
  await expect(page.getByRole("region", { name: "재무진단 화면 복구" })).toHaveCount(0);
  await expect(income).toHaveValue("4,321,000");
});

test("pending Flight response keeps normal loading without recovery", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let pending = 0;
  await page.route("**/planning?*", async (route) => {
    if (route.request().headers().rsc !== "1") return route.continue();
    const response = await route.fetch();
    pending++;
    await held;
    await route.fulfill({ response });
  });
  await page.goto("/dashboard");
  await page.getByRole("navigation", { name: "데스크톱 주 메뉴" })
    .getByRole("link", { name: "재무진단", exact: true }).click();
  await expect.poll(() => pending).toBeGreaterThan(0);
  try {
    await page.waitForTimeout(11_500);
    await expect(page.getByRole("region", { name: "재무진단 화면 복구" })).toHaveCount(0);
    // The previous page or the actual Suspense loading screen is still present.
    expect(await page.locator('#main-content h1, #main-content [role="status"]').count()).toBeGreaterThan(0);
  } finally { release(); }
  await expect(page.locator("#planning-input-section")).toBeVisible({ timeout: 30_000 });
});

test("mobile recovery can be cancelled and explicitly leave for home", async ({ page }, testInfo) => {
  const replacements = await emptyPlanningWorkspace(page);
  let documents = 0;
  page.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
  await openFromDashboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(replacements).toBe(1);
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  await expect(recovery.getByRole("button", { name: "홈으로 이동" })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("recovery-mobile.png"), fullPage: true });
  expect(documents).toBe(1);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("저장하지 않은 입력");
    await dialog.dismiss();
  });
  await recovery.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(recovery).toBeVisible();
  expect(documents).toBe(1);
  await page.evaluate(() => window.history.pushState(null, "", "/planning?profileId=recovery-missing"));
  await expect(recovery).toHaveCount(0);
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await recovery.getByRole("button", { name: "홈으로 이동" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
  await expect(recovery).toHaveCount(0);
  expect(documents).toBe(2);
  // The destination dashboard may prefetch planning while this handler is active.
  // Complete those requests before Playwright disposes their API response context.
  await page.unrouteAll({ behavior: "wait" });
});

test("recovery preserves saved profile goals run and report across reopen", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const { profileId, runId } = await seedRunForReports(request);
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const reportResponse = await request.post("/api/planning/v2/reports", {
    headers: { origin: baseURL!, referer: baseURL! + "/planning/reports" },
    data: { runId, ...(csrf ? { csrf } : {}) },
  });
  expect(reportResponse.ok()).toBeTruthy();
  const reportId = (await reportResponse.json()).data.id as string;
  const endpoints = [
    "/api/planning/v2/profiles/" + profileId,
    "/api/planning/v2/runs/" + runId,
    "/api/planning/v2/reports/" + reportId,
    "/api/planning/v2/runs?profileId=" + profileId + "&limit=200",
  ];
  async function readSaved() {
    return Promise.all(endpoints.map(async (url) => {
      const response = await request.get(url, { headers: { origin: baseURL!, referer: baseURL! + "/planning" } });
      expect(response.ok()).toBeTruthy();
      return (await response.json()).data;
    }));
  }
  const before = await readSaved();
  expect(before[0].profile.goals.length).toBeGreaterThan(0);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/planning/") && !["GET", "HEAD"].includes(request.method())) writes.push(request.method());
  });
  await emptyPlanningWorkspace(page);
  await openFromDashboard(page);
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  expect(await readSaved()).toEqual(before);
  page.once("dialog", (dialog) => dialog.accept());
  await recovery.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.locator("#planning-input-section")).toBeVisible({ timeout: 30_000 });
  await page.goto("/planning?profileId=" + profileId);
  await expect(page.getByTestId("planning-profile-form").getByLabel("월 실수령")).toHaveValue("4,800,000");
  await page.goto("/planning/reports/" + reportId);
  await expect(page.getByTestId("saved-report-record")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("saved-report-record")).toBeVisible();
  const after = await readSaved();
  expect(after).toEqual(before);
  expect(writes).toEqual([]);
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  await testInfo.attach("saved-data-equality", {
    body: JSON.stringify({ profileGoalsRunReportEqual: true, beforeSha256: digest(before), afterSha256: digest(after), writes }),
    contentType: "application/json",
  });
});

test("production authentication guidance is not blank recovery", async ({ browser, baseURL }) => {
  test.skip(process.env.E2E_WEB_SERVER_MODE !== "production", "Production desktop authentication boundary");
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: {} });
  try {
    const page = await context.newPage();
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: "앱 실행 경로로 다시 열어 주세요." })).toBeVisible();
    await page.waitForTimeout(11_500);
    await expect(page.getByRole("region", { name: "재무진단 화면 복구" })).toHaveCount(0);
  } finally { await context.close(); }
});

test("visible profile storage error keeps its own retry instead of blank recovery", async ({ page }) => {
  await page.route("**/api/planning/v2/profiles", (route) => route.fulfill({
    status: 500, json: { ok: false, error: { code: "STORAGE_CORRUPT", message: "프로필 저장 파일이 손상되었습니다." } },
  }));
  await page.goto("/planning");
  await expect(page.getByTestId("planning-profiles-error-state")).toBeVisible();
  await page.waitForTimeout(11_500);
  await expect(page.getByRole("region", { name: "재무진단 화면 복구" })).toHaveCount(0);
  await expect(page.getByTestId("planning-profiles-error-state")).toBeVisible();
});


test("title without the planning body still offers recovery", async ({ page }) => {
  const replacements = await emptyPlanningWorkspace(page, true);
  await openFromDashboard(page);
  await expect.poll(replacements).toBe(1);
  await expect(page.locator("#main-content h1")).toHaveText("재무 진단");
  await expect(page.getByTestId("planning-profile-form")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "재무진단 화면 복구" })).toBeVisible({ timeout: 15_000 });
});

test("stale dashboard DOM at planning URL does not mask recovery", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
  // Controlled stale-screen state, not an assertion about the original router defect.
  await page.evaluate(() => window.history.pushState(null, "", "/planning"));
  await expect(page).toHaveURL(/\/planning$/);
  await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  const reload = recovery.getByRole("button", { name: "다시 불러오기" });
  await reload.focus();
  await expect(reload).toBeFocused();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(reload).toBeFocused();
  await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(recovery.getByRole("button", { name: "홈으로 이동" })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reload).toBeInViewport();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(reload).toBeInViewport();
});


test("late body and edits retire the recovery offer without discarding input", async ({ page }) => {
  await openFromDashboard(page);
  const form = page.getByTestId("planning-profile-form");
  await expect(form).toBeVisible();
  // CSSOM changes keep the production CSP intact while injecting an absent body.
  await form.evaluate((element) => element.style.setProperty("display", "none", "important"));
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  await expect(recovery).toBeVisible({ timeout: 15_000 });
  const income = form.getByLabel("월 실수령");
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  // Within one observer tick: a late body arrives, the stale button is clicked,
  // then the body disappears again. The offer must not get stuck hidden.
  await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>('[data-testid="planning-profile-form"]')!;
    const recovery = document.querySelector<HTMLElement>('section[aria-label="재무진단 화면 복구"]')!;
    form.style.setProperty("display", "block", "important");
    recovery.querySelector<HTMLButtonElement>("button")!.click();
    form.style.setProperty("display", "none", "important");
  });
  await page.waitForTimeout(1_000);
  expect(dialogs).toBe(0);
  await expect(recovery).toBeVisible();
  await form.evaluate((element) => element.style.removeProperty("display"));
  await income.fill("4,765,000");
  await expect(recovery).toHaveCount(0);
  await expect(income).toHaveValue("4,765,000");
  await page.waitForTimeout(11_500);
  await expect(income).toHaveValue("4,765,000");
  await expect(recovery).toHaveCount(0);
});
