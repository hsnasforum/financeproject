import { type APIRequestContext, type ConsoleMessage } from "@playwright/test";
import { expect, test, type Page } from "./helpers/e2eTest";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";
import { formatKrw } from "../../src/lib/planning/i18n/format";
import { safeBuildReportVMFromRun } from "../../src/lib/planning/reports/reportViewModel";
import { type PlanningRunRecord } from "../../src/lib/planning/store/types";

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

async function createSeedProfile(request: APIRequestContext, profileOverride?: ProfileV2): Promise<string> {
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
      profile: profileOverride ?? {
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

async function createSeedRun(request: APIRequestContext, profileId: string, title: string, input = DEFAULT_RUN_INPUT): Promise<string> {
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
      input,
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

function collectHydrationMismatchMessages(page: Page) {
  const messages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (
      text.includes("A tree hydrated")
      || text.includes("Hydration failed")
      || text.includes("server rendered HTML didn't match")
    ) {
      messages.push(text);
    }
  };
  page.on("console", onConsole);
  return {
    messages,
    stop: () => page.off("console", onConsole),
  };
}

test("planning runs and reports pages render", async ({ page }) => {
  await page.goto("/planning/runs");
  await expect(page.getByRole("heading", { name: "실행 기록", exact: true })).toBeVisible({ timeout: 30_000 });

  await gotoWithAbortRetry(page, "/planning/reports");
  await expect(page.getByRole("heading", { name: /플래닝 리포트|재무설계 리포트/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/저장된 진단에서 핵심 상태|저장한 재무 진단을 다시 확인/)).toBeVisible({ timeout: 30_000 });
});

test("planning reports show saved scenarios before actions and preserve no-scenario runs", async ({ page, request }) => {
  test.setTimeout(90_000);
  const profileId = await createSeedProfile(request);
  try {
    const runId = await createSeedRun(request, profileId, "시나리오 비교 확인");
    const response = await request.get(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, {
      headers: { origin: resolveBaseUrl(), referer: `${resolveBaseUrl()}/planning/reports` },
    });
    expect(response.ok()).toBe(true);
    const payload = await response.json() as { data: PlanningRunRecord };
    // Test-only: the existing blob endpoint exposes the pre-compaction artifact for comparison.
    const blobResponse = await request.get(`/api/planning/v2/runs/${encodeURIComponent(runId)}/blob/scenarios`, {
      headers: { origin: resolveBaseUrl(), referer: `${resolveBaseUrl()}/planning/reports` },
    });
    expect(blobResponse.ok()).toBe(true);
    const blob = await blobResponse.json() as { data: { shortWhyByScenario: Record<string, string[]> } };
    const beforeMap = blob.data.shortWhyByScenario;
    expect(beforeMap.conservative[0]).not.toBe(beforeMap.aggressive[0]);
    expect(payload.data.outputs.scenarios?.shortWhyByScenario).toEqual(beforeMap);
    expect(payload.data.outputs.scenarios?.ref).toHaveProperty("name", "scenarios");
    expect(payload.data.outputs.scenarios?.ref).not.toHaveProperty("path");
    expect(payload.data.outputs.scenarios).not.toHaveProperty("table");
    const vm = safeBuildReportVMFromRun(payload.data).vm!;
    expect(vm).not.toBeNull();
    expect(vm.scenarioRows.map((row) => row.id)).toEqual(["base", "conservative", "aggressive"]);
    for (const id of ["conservative", "aggressive"]) {
      expect(vm.scenarioRows.find((row) => row.id === id)?.interpretation).toBe(beforeMap[id][0]);
      expect(beforeMap[id][0]).not.toBe("기준 대비 순자산/경고 변화를 함께 확인하세요.");
    }
    await gotoWithAbortRetry(page, `/planning/reports?runId=${encodeURIComponent(runId)}`);
    const comparison = page.getByTestId("report-scenario-comparison");
    await expect(comparison).toBeVisible({ timeout: 30_000 });
    for (const scenario of vm.scenarioRows) {
      const row = page.getByTestId(`report-scenario-${scenario.id}`);
      await expect(row).toContainText(scenario.title);
      await expect(row).toContainText(formatKrw("ko-KR", scenario.endNetWorthKrw));
      await expect(row).toContainText(scenario.interpretation);
    }
    const topActions = page.getByTestId("report-top-actions");
    await expect(topActions).toBeVisible();
    expect(vm.actionRows.length).toBeGreaterThan(0);
    await expect(topActions).toContainText(vm.actionRows[0].title);
    expect(await comparison.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector('[data-testid="report-top-actions"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await comparison.screenshot({ path: test.info().outputPath("scenario-comparison.png") });
    const brief = page.getByTestId("saved-report-brief");
    const details = page.getByTestId("report-interpretation-details");
    await expect(brief).toContainText("시나리오 비교 확인");
    await expect(brief).toContainText("120개월");
    await expect(details).not.toHaveAttribute("open");
    const readRunIds = async () => {
      const result = await request.get(`/api/planning/v2/runs?profileId=${profileId}&limit=200`, { headers: { origin: resolveBaseUrl(), referer: `${resolveBaseUrl()}/planning/reports` } });
      expect(result.ok()).toBe(true);
      return ((await result.json()).data as Array<{ id: string }>).map((run) => run.id).sort();
    };
    const beforeReadIds = await readRunIds();
    const writes: string[] = [];
    const candidateRequests: string[] = [];
    const observeRead = (req: import("@playwright/test").Request) => {
      if (new URL(req.url()).pathname.startsWith("/api/planning/") && !["GET", "HEAD"].includes(req.method())) writes.push(req.url());
      if (new URL(req.url()).pathname === "/api/products/candidates") candidateRequests.push(req.url());
    };
    page.on("request", observeRead);
    await brief.getByRole("button", { name: "상세 해석과 근거 보기" }).click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator(":scope > summary")).toBeFocused();
    await expect(details.getByTestId("interpretation-guide")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(details).toHaveAttribute("open", "");
    await page.emulateMedia({ media: "print" });
    await expect(details.getByTestId("interpretation-guide")).toBeVisible();
    await expect(page.getByTestId("report-warnings-table")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(details).not.toHaveAttribute("open");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath("report-after-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("combobox", { name: "보고 있는 실행" }).focus();
    await expect(page.getByRole("combobox", { name: "보고 있는 실행" })).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath("report-after-mobile.png"), fullPage: true });
    await page.reload();
    await expect(brief).toContainText("시나리오 비교 확인");
    expect(await readRunIds()).toEqual(beforeReadIds);
    expect(writes).toEqual([]);
    expect(candidateRequests).toEqual([]);
    page.off("request", observeRead);

    const exported = await request.get(`/api/planning/reports/${encodeURIComponent(runId)}/export.html`);
    expect(exported.ok()).toBe(true);
    const exportHtml = await exported.text();
    for (const scenario of vm.scenarioRows) {
      const row = exportHtml.split(`<td>${scenario.title}</td>`)[1]?.split("</tr>")[0];
      expect(row).toContain(scenario.interpretation);
    }

    const withoutScenarios = await createSeedRun(request, profileId, "시나리오 없이 행동 확인", { ...DEFAULT_RUN_INPUT, runScenarios: false });
    await gotoWithAbortRetry(page, `/planning/reports?runId=${encodeURIComponent(withoutScenarios)}`);
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(comparison).toHaveCount(0);
    await expect(topActions).toBeVisible();
    await expect(topActions).toContainText(vm.actionRows[0].title);
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});

test("planning reports preserve late goal achievement after saving and in HTML export", async ({ page, request }) => {
  test.setTimeout(60_000);
  const profileId = await createSeedProfile(request, {
    monthlyIncomeNet: 100_000, monthlyEssentialExpenses: 0, monthlyDiscretionaryExpenses: 0,
    liquidAssets: 0, investmentAssets: 0, debts: [],
    goals: [{ id: "deadline-goal", name: "기한 확인 목표", targetAmount: 300_000, targetMonth: 2, priority: 3 }],
  });
  try {
    const runId = await createSeedRun(request, profileId, "기한 후 달성 확인", {
      ...DEFAULT_RUN_INPUT, horizonMonths: 3, runScenarios: false,
      assumptionsOverride: { inflationPct: 0, investReturnPct: 0, cashReturnPct: 0 },
    });
    await gotoWithAbortRetry(page, `/planning/reports?runId=${encodeURIComponent(runId)}&profileId=${encodeURIComponent(profileId)}`);
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("기한 후 달성", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    const exported = await request.get(`/api/planning/reports/${encodeURIComponent(runId)}/export.html`);
    expect(exported.ok()).toBe(true);
    expect(await exported.text()).toContain("기한 후 달성");
  } finally {
    await deleteSeedProfile(request, profileId);
  }
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
    await expect(runsTable).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
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

test("planning reports preserve compare and recommendation deep links", async ({ page, request }) => {
  const profileId = await createSeedProfile(request);
  const hydration = collectHydrationMismatchMessages(page);
  try {
    const baselineRunTitle = `딥링크 기준 실행 ${Date.now()}`;
    const selectedRunTitle = `딥링크 선택 실행 ${Date.now()}`;
    const baselineRunId = await createSeedRun(request, profileId, baselineRunTitle);
    const selectedRunId = await createSeedRun(request, profileId, selectedRunTitle);

    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(selectedRunId)}&profileId=${encodeURIComponent(profileId)}&baseRunId=${encodeURIComponent(baselineRunId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#report-run-selector")).toHaveValue(selectedRunId, { timeout: 30_000 });
    await expect(page.getByTestId("compare-toggle")).toHaveText("비교 닫기", { timeout: 30_000 });
    await expect(page.getByTestId("baseline-selector")).toHaveValue(baselineRunId, { timeout: 30_000 });
    await expect(page.getByTestId("report-scenario-comparison")).toContainText("한 실행 안의 가정 변화");
    await expect(page.getByTestId("report-run-comparison")).toContainText("서로 다른 저장 실행 A와 B");

    const recommendRunId = `recommend-deeplink-${Date.now()}`;
    const recommendHistoryHref = `/recommend/history?open=${encodeURIComponent(recommendRunId)}`;
    await gotoWithAbortRetry(
      page,
      `/planning/reports?runId=${encodeURIComponent(selectedRunId)}&profileId=${encodeURIComponent(profileId)}&recommendRunId=${encodeURIComponent(recommendRunId)}`,
    );
    await expect(page.getByRole("heading", { name: "플래닝 리포트", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "추천 비교 기록 보기" })).toHaveAttribute("href", recommendHistoryHref);
    await expect(page.getByText(/추천 비교 기록과 함께 열렸습니다/)).toBeVisible({ timeout: 30_000 });

    const restoreSummary = page.getByText("공유·복구용 보조 정보");
    await restoreSummary.click();
    await expect(page.getByText(recommendRunId)).toBeVisible({ timeout: 30_000 });

    const saveButton = page.getByTestId("report-save-button");
    await expect(saveButton).toBeEnabled({ timeout: 30_000 });
    await saveButton.click();
    await expect(page.getByText(/연결된 추천 실행 참조도 함께 보관했습니다/)).toBeVisible({ timeout: 30_000 });
    await page.waitForURL((url) => (
      url.pathname === "/planning/reports"
      && url.searchParams.get("runId") === selectedRunId
      && url.searchParams.get("profileId") === profileId
      && url.searchParams.get("recommendRunId") === recommendRunId
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
    await expect(page.getByRole("link", { name: "추천 비교 기록으로 돌아가기" })).toHaveAttribute("href", recommendHistoryHref);
    await expect(page.getByRole("link", { name: "원본 진단 결과로 돌아가기" })).toHaveAttribute("href", `/planning/reports?runId=${selectedRunId}&recommendRunId=${recommendRunId}&profileId=${profileId}`);
    await page.getByTestId("saved-report-identifiers").locator("summary").click();
    await expect(page.getByText("추천 실행 ID")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(recommendRunId)).toBeVisible({ timeout: 30_000 });
    expect(hydration.messages).toEqual([]);
  } finally {
    hydration.stop();
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
    await expect(page.getByTestId("report-advanced-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/리포트를 별도로 보관했습니다/)).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByTestId("saved-report-record")).toBeVisible();
    await expect(page.getByTestId("saved-report-brief")).toContainText(runTitle);
    await expect(page.getByRole("link", { name: "원본 진단 결과로 돌아가기" })).toHaveAttribute("href", `/planning/reports?runId=${runId}&profileId=${profileId}`);
    await expect(page.getByTestId("saved-report-identifiers")).not.toHaveAttribute("open");
    await expect(page.locator("h1")).toHaveCount(1);
    const details = page.getByTestId("report-interpretation-details");
    await expect(details).not.toHaveAttribute("open");
    await page.getByRole("button", { name: "상세 해석과 근거 보기" }).click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.locator(":scope > summary")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(details).not.toHaveAttribute("open");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath("saved-detail-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath("saved-detail-mobile.png"), fullPage: true });

    await expect(page.getByRole("link", { name: "리포트 목록으로", exact: true })).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteSeedProfile(request, profileId);
  }
});
