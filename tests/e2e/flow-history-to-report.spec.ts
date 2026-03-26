import { type APIRequestContext } from "@playwright/test";
import { expect, test, type Page } from "./helpers/e2eTest";

const DEFAULT_RUN_INPUT = {
  horizonMonths: 120,
  assumptionsOverride: {},
  runScenarios: true,
  getActions: true,
  analyzeDebt: true,
  includeProducts: false,
  monteCarlo: null,
};

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
      name: `실행 기록 상태 프로필 ${Date.now()}`,
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

async function createSeedRun(request: APIRequestContext, profileId: string, title: string): Promise<string> {
  const baseUrl = resolveBaseUrl();
  const csrf = await readDevCsrf(request);
  const response = await request.post("/api/planning/v2/runs", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning/runs`,
      "content-type": "application/json",
    },
    data: {
      profileId,
      title,
      input: DEFAULT_RUN_INPUT,
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const runId = payload?.data?.id;
  if (!response.ok() || !payload?.ok || !runId) {
    throw new Error(`failed to create seed run: status=${response.status()}`);
  }
  return runId;
}

async function createSeedReport(request: APIRequestContext, runId: string): Promise<string> {
  const baseUrl = resolveBaseUrl();
  const csrf = await readDevCsrf(request);
  const response = await request.post("/api/planning/v2/reports", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning/reports`,
      "content-type": "application/json",
    },
    data: {
      runId,
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const reportId = payload?.data?.id;
  if (!response.ok() || !payload?.ok || !reportId) {
    throw new Error(`failed to create seed report: status=${response.status()}`);
  }
  return reportId;
}

async function deleteSeedProfile(request: APIRequestContext, profileId: string): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const csrf = await readDevCsrf(request);
  const response = await request.delete(`/api/planning/v2/profiles/${encodeURIComponent(profileId)}`, {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning`,
      "content-type": "application/json",
    },
    data: {
      confirmText: `DELETE profile ${profileId}`,
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!response.ok() || !payload?.ok) {
    throw new Error(`failed to delete seed profile: status=${response.status()}`);
  }
}

async function gotoWithAbortRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("net::ERR_ABORTED") || attempt === 1) throw error;
    }
  }
}

test("planning runs and reports pages render", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });

  await gotoWithAbortRetry(page, "/planning/reports");
  await expect(page.getByRole("heading", { name: /플래닝 리포트|재무설계 리포트/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/저장된 실행 결과를 다시 읽/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/실행 기록 화면/)).toBeVisible({ timeout: 30_000 });
});

test("planning runs no-selection fallback distinguishes empty history from next-step guidance", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    await gotoWithAbortRetry(page, `/planning/runs?profileId=${encodeURIComponent(profileId)}`);
    await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/아직 저장된 실행 기록이 없습니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/먼저 \/planning에서 실행을 저장하면 여기서 실행을 다시 확인하거나 비교하고/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/실행이 준비되면 목록에서 하나를 선택해 저장 결과를 다시 읽고/)).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning runs selected and compare states show distinct report follow-through helpers", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const selectedRunTitle = `선택 상태 확인 실행 ${Date.now()}`;
    const compareRunTitle = `비교 상태 확인 실행 ${Date.now()}`;
    const selectedRunId = await createSeedRun(request, profileId, selectedRunTitle);
    await createSeedRun(request, profileId, compareRunTitle);

    await gotoWithAbortRetry(
      page,
      `/planning/runs?profileId=${encodeURIComponent(profileId)}&selected=${encodeURIComponent(selectedRunId)}`,
    );
    await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/선택한 실행의 저장 결과를 다시 읽고, 필요하면 바로 리포트 화면에서/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/리포트 화면은 이 실행 하나의 저장 결과를 다시 읽는 기본 도착점입니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/목록에서 실행 두 개를 선택하면 두 실행의 차이를 여기서 먼저 읽고, 필요하면 상세 비교 리포트로 이어갈 수 있습니다/)).toBeVisible({ timeout: 30_000 });

    const runsTable = page.getByTestId("planning-runs-table");
    const selectedRow = runsTable.locator("tr", { hasText: selectedRunTitle });
    const compareRow = runsTable.locator("tr", { hasText: compareRunTitle });
    await selectedRow.locator('input[type="checkbox"]').check();
    await compareRow.locator('input[type="checkbox"]').check();

    await expect(page.getByText(/선택한 두 실행의 차이를 먼저 읽고, 필요하면 상세 비교 리포트로 이어 갑니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/두 실행의 차이를 여기서 먼저 읽고, 필요하면 상세 비교 리포트에서 변화 근거와 비교 자료를 더 확인합니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "상세 비교 리포트 열기" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: /리포트 화면 보기/ }).click();
    await expect(page).toHaveURL(new RegExp(`/planning/reports\\?runId=${selectedRunId}(?:&profileId=${profileId})?$`), {
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#report-run-selector")).toHaveValue(selectedRunId, { timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports dashboard save handoff exposes a saved detail destination", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `저장 handoff 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("report-save-button").click();
    await expect(page.getByText(/저장된 리포트를 만들고/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/기본 리포트 화면은 여기서 계속 읽고/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "저장된 상세 리포트 열기", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.waitForURL((url) => (
      url.pathname === "/planning/reports"
      && url.searchParams.get("runId") === runId
      && url.searchParams.get("profileId") === profileId
      && Boolean(url.searchParams.get("selected"))
    ));
    const savedReportId = new URL(page.url()).searchParams.get("selected");
    if (!savedReportId) {
      throw new Error("saved report id was not written to the reports dashboard query");
    }

    await page.getByRole("link", { name: "저장된 상세 리포트 열기", exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/planning/reports/${savedReportId}`);
    await expect(page.getByRole("heading", { name: "플래닝 리포트 상세", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "리포트 목록으로", exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports dashboard shows a neutral helper while selected saved-detail validation is pending", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `selected pending helper 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);
    const reportId = await createSeedReport(request, runId);

    await page.route(`**/api/planning/v2/reports/${reportId}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}&selected=${encodeURIComponent(reportId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/저장된 상세 리포트를 확인하는 중입니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/현재 기본 리포트 화면은 계속 볼 수 있고/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-saved-detail-link")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "저장된 상세 리포트 열기", exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports dashboard revalidates a selected saved detail on focus and downgrades stale state", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `selected focus revalidation 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);
    const reportId = await createSeedReport(request, runId);
    let reportLookupCount = 0;

    await page.route(`**/api/planning/v2/reports/${reportId}`, async (route) => {
      reportLookupCount += 1;
      if (reportLookupCount === 1) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "NO_DATA",
            message: "리포트를 찾을 수 없습니다.",
          },
        }),
      });
    });

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}&selected=${encodeURIComponent(reportId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "저장된 상세 리포트 열기", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await expect(page.getByText(/저장된 상세 리포트를 찾지 못했지만 현재 리포트 화면은 계속 볼 수 있습니다/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("report-saved-detail-link")).toHaveCount(0);
    if (reportLookupCount < 2) {
      throw new Error(`expected a focus revalidation lookup, got ${reportLookupCount}`);
    }
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports dashboard lets users manually recheck a selected saved detail and downgrade stale state", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `selected manual recheck 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);
    const reportId = await createSeedReport(request, runId);
    let reportLookupCount = 0;

    await page.route(`**/api/planning/v2/reports/${reportId}`, async (route) => {
      reportLookupCount += 1;
      if (reportLookupCount === 1) {
        await route.continue();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "NO_DATA",
            message: "리포트를 찾을 수 없습니다.",
          },
        }),
      });
    });

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}&selected=${encodeURIComponent(reportId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "저장된 상세 리포트 열기", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("report-saved-detail-recheck-button").click();

    await expect(page.getByText(/저장된 상세 리포트를 확인하는 중입니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-saved-detail-link")).toHaveCount(0);
    await expect(page.getByText(/저장된 상세 리포트를 찾지 못했지만 현재 리포트 화면은 계속 볼 수 있습니다/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("report-saved-detail-recheck-button")).toBeVisible({ timeout: 30_000 });
    if (reportLookupCount < 2) {
      throw new Error(`expected a manual recheck lookup, got ${reportLookupCount}`);
    }
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports dashboard hides stale saved-detail handoff and keeps the base destination usable", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `stale selected fallback 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);
    const staleReportId = `stale-saved-report-${Date.now()}`;

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}&selected=${encodeURIComponent(staleReportId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#report-run-selector")).toHaveValue(runId, { timeout: 30_000 });
    await expect(page.getByText(/저장된 상세 리포트를 찾지 못했지만 현재 리포트 화면은 계속 볼 수 있습니다/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/필요하면 이 실행을 다시 보관해 새 상세 리포트를 열어 주세요/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("report-saved-detail-link")).toHaveCount(0);
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning report detail reads as a saved-result destination after leaving runs", async ({ page, request }) => {
  test.setTimeout(60_000);
  const profileId = await createSeedProfile(request);
  try {
    const runTitle = `상세 리포트 도착점 확인 실행 ${Date.now()}`;
    const runId = await createSeedRun(request, profileId, runTitle);
    const reportId = await createSeedReport(request, runId);

    await gotoWithAbortRetry(page, `/planning/reports/${encodeURIComponent(reportId)}`);
    await expect(page.getByRole("heading", { name: "플래닝 리포트 상세", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/실행 기록 화면이나 저장된 리포트 목록에서 선택한 결과를 자세히 다시 읽는 상세 도착점입니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/선택한 실행의 저장 결과를 다시 읽는 상세 화면입니다/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "리포트 목록으로", exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});
