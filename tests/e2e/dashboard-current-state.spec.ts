import { expect, test } from "./helpers/e2eTest";
import { type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { saveAssumptionsSnapshotToHistory } from "../../src/lib/planning/assumptions/storage";
import { resolvePlanningDataDir } from "../../src/lib/planning/storage/dataDir";
import { buildRunReproducibilityMeta, computeProfileHash } from "../../src/lib/planning/v2/reproducibility";
import { type ProfileV2 } from "../../src/lib/planning/v2/types";
import { type DraftProfileRecord } from "../../src/lib/planning/v3/domain/draftTypes";
import { resolvePlanningV3DataDir } from "../../src/lib/planning/v3/store/dataDir";
import { isPlanningNamespaceEnabled } from "../../src/lib/planning/store/namespace";
import { resolveProfileRecordPath, resolveProfileRunMetaPath } from "../../src/lib/planning/store/paths";
import { runWithPlanningUserScope } from "../../src/lib/planning/store/userScope";
import { getDefaultProfileId, setDefaultProfile } from "../../src/lib/planning/store/profileStore";
import { createAccount } from "../../src/lib/planning/v3/store/accountsStore";
import { importCsvToBatch } from "../../src/lib/planning/v3/service/importCsvToBatch";
import { upsertOverride } from "../../src/lib/planning/v3/store/txnOverridesStore";
import { createRun, getRunBlob } from "../../src/lib/planning/store/runStore";
import { simulateMonthly } from "../../src/lib/planning/v2/simulateMonthly";
import { buildResultDtoV1FromRunRecord } from "../../src/lib/planning/v2/resultDto";
import { resolvePlanningRunAssumptions } from "../../src/lib/planning/server/v2/runAssumptionsRouteService";

const snapshotFiles: string[] = [];
const profileDraftFiles: string[] = [];
const isProductionRuntime = (process.env.E2E_WEB_SERVER_MODE ?? "development").trim().toLowerCase() === "production";

type FixtureAuth = {
  headers: Record<string, string>;
  requestedUserId: string;
  supportsNamespaceIsolation: boolean;
};

function requireIsolatedPlanningDataDir(): string {
  const configured = (process.env.PLANNING_DATA_DIR ?? "").trim();
  if (!configured) {
    throw new Error("PLANNING_DATA_DIR is required for dashboard E2E direct-store fixtures.");
  }
  return path.resolve(configured);
}

async function prepareFixtureAuth(page: Page, baseURL: string, prefix: string): Promise<FixtureAuth> {
  requireIsolatedPlanningDataDir();
  const requestedUserId = `${prefix}-${Date.now()}`;
  const headers: Record<string, string> = {
    origin: baseURL,
    referer: `${baseURL}/planning`,
  };

  if (!isProductionRuntime) {
    headers["x-planning-user-id"] = requestedUserId;
    await page.setExtraHTTPHeaders({ "x-planning-user-id": requestedUserId });
  }

  return {
    headers,
    requestedUserId,
    supportsNamespaceIsolation: !isProductionRuntime && isPlanningNamespaceEnabled(),
  };
}

async function createProfileFixture(input: {
  request: APIRequestContext;
  headers: Record<string, string>;
  csrf?: string;
  name: string;
  profile: unknown;
  makeDefault?: boolean;
}) {
  const response = await input.request.post("/api/planning/v2/profiles", {
    headers: input.headers,
    data: {
      name: input.name,
      profile: input.profile,
      ...(input.csrf ? { csrf: input.csrf } : {}),
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as {
    data: { id: string };
    meta: { userId: string };
  };
  expect(payload.data.id).toBeTruthy();
  expect(payload.meta.userId).toBeTruthy();
  if (input.makeDefault) {
    await runWithPlanningUserScope({ userId: payload.meta.userId }, () => setDefaultProfile(payload.data.id));
  }
  return { record: payload.data, scopeUserId: payload.meta.userId };
}

async function seedSnapshot() {
  const { id } = await saveAssumptionsSnapshotToHistory({ version: 1, asOf: "2026-09-07", fetchedAt: new Date().toISOString(),
    korea: { policyRatePct: 2.5, cpiYoYPct: 2, newDepositAvgPct: 3 }, sources: [], warnings: [] });
  const file = path.join(process.env.PLANNING_ASSUMPTIONS_HISTORY_DIR || path.join(resolvePlanningDataDir(), "assumptions", "history"), `${id}.json`);
  snapshotFiles.push(file);
  return { id, file };
}
test.afterEach(async () => { for (const file of [...snapshotFiles.splice(0), ...profileDraftFiles.splice(0)]) await fs.rm(file, { force: true }); });

for (const exchangeFails of [false, true]) {
  test(`dashboard secondary tools load on first expansion and preserve ${exchangeFails ? "partial failure" : "cached data"}`, async ({ page }) => {
    const requests: string[] = [];
    await page.route("**/api/public/exchange", async (route) => {
      requests.push("exchange");
      await route.fulfill({
        status: exchangeFails ? 503 : 200,
        json: exchangeFails
          ? { ok: false, error: { code: "UPSTREAM", message: "환율 공급자 응답 실패" } }
          : {
            ok: true,
            data: { asOf: "2026-10-01", base: "KRW", rates: { USD: 1300 }, rawMeta: { source: "EXIM" } },
            meta: { cache: "hit", fallback: { mode: "CACHE", sourceKey: "exchange", reason: "cache_hit" } },
          },
      });
    });
    await page.route("**/api/public/benefits/search?*", async (route) => {
      requests.push("benefits");
      await route.fulfill({ json: { ok: true, data: { items: [{
        serviceId: "cached-benefit", title: "저장된 혜택 안내", summary: "기준 자료를 확인하세요.", org: "테스트 기관",
      }] } } });
    });
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const tools = page.getByTestId("dashboard-secondary-tools");
    await expect(tools).not.toHaveAttribute("open");
    expect(requests).toEqual([]);

    await tools.locator(":scope > summary").focus();
    await page.keyboard.press("Enter");
    await expect(tools.getByText("저장된 혜택 안내", { exact: true })).toBeVisible();
    await expect.poll(() => requests.slice().sort()).toEqual(["benefits", "exchange"]);
    if (exchangeFails) {
      await expect(page.getByText("일부 보조 정보를 불러오지 못했습니다.", { exact: true })).toBeVisible();
      await page.getByTestId("dashboard-resources-partial").locator("summary").click();
      await expect(page.getByText("기준 환율 정보를 불러오지 못했습니다.", { exact: true })).toBeVisible();
      await expect(tools).toContainText("시장 기준 환율: 환율 조회 실패");
      await expect(tools).not.toContainText("USD 1 = -");
    } else {
      await expect(tools).toContainText("USD 1 = 1,300원");
      await expect(tools).toContainText("2026-10-01");
      await expect(tools).toContainText("출처 한국수출입은행 · 응답 캐시 사용");
    }
    await expect(page.getByTestId("dashboard-current-state")).toBeVisible();
    await tools.locator(":scope > summary").click();
    await tools.locator(":scope > summary").click();
    await expect(tools.getByText("저장된 혜택 안내", { exact: true })).toBeVisible();
    expect(requests.slice().sort()).toEqual(["benefits", "exchange"]);
  });
}

test("production desktop session rejects raw identity headers", async ({ request, baseURL }) => {
  test.skip(!isProductionRuntime, "desktop-session rejection is a production runtime boundary");
  for (const headerName of ["x-planning-user-id", "x-auth-user-id"] as const) {
    const response = await request.get("/api/planning/v2/profiles", {
      headers: {
        origin: baseURL!,
        referer: `${baseURL}/planning`,
        [headerName]: "forbidden-e2e-user",
      },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "데스크톱 앱은 원시 사용자 식별 헤더를 허용하지 않습니다.",
      },
    });
  }
});

test("dashboard aligns the current profile plan, detects saved changes and preserves recent run navigation", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000); // This flow compiles dashboard, reports and run comparison on a cold dev server.
  const auth = await prepareFixtureAuth(page, baseURL!, "dashboard");
  const { headers } = auth;
  await page.goto("/dashboard");
  const current = page.getByTestId("dashboard-current-state");
  const plan = page.getByTestId("dashboard-current-plan");
  // A shared-store suite may already have input from another spec.
  if (auth.supportsNamespaceIsolation) {
    await expect(current.getByRole("link", { name: "재무 상태 진단 시작" })).toBeVisible();
    await expect(current).not.toContainText("0원");
  }

  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const snapshot = await seedSnapshot();
  const historical = {
    monthlyIncomeNet: 9_000_000, monthlyEssentialExpenses: 2_000_000, monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 10_000_000, investmentAssets: 20_000_000,
    debts: [
      { id: "loan-a", name: "대출 A", balance: 8_000_000, minimumPayment: 400_000, apr: 0 },
      { id: "loan-b", name: "대출 B", balance: 2_000_000, minimumPayment: 300_000, apr: 0 },
    ],
    goals: [{ id: "goal-a", name: "목표 자금", targetAmount: 9_000_000, currentAmount: 3_000_000, targetMonth: 24 }],
  };
  const oldProfile = await createProfileFixture({
    request,
    headers,
    csrf,
    name: "현재 기본 프로필",
    profile: historical,
    makeDefault: true,
  });
  const oldId = oldProfile.record.id;
  await page.reload();
  await expect(plan).toHaveAttribute("data-state", "missing");
  await expect(plan).toContainText("현재 프로필로 저장한 플랜이 없습니다.");
  const runResponse = await request.post("/api/planning/v2/runs", {
    headers, data: { profileId: oldId, title: "이전 조건의 플랜", csrf, input: {
      horizonMonths: 24, snapshotId: snapshot.id, policyId: "balanced", assumptionsOverride: { inflationPct: 2.4 },
      runScenarios: false, getActions: true, analyzeDebt: false, includeProducts: false, monteCarlo: { paths: 100, seed: 77 },
      debtStrategy: { options: { extraPaymentKrw: 10000, compareTermsMonths: [12, 24] } },
    } },
  });
  expect(runResponse.ok()).toBeTruthy();
  const oldRun = (await runResponse.json()).data;
  const runId = oldRun.id as string;
  const initialProgress = (await (await request.get(`/api/planning/v2/runs/${runId}/action-progress`, { headers })).json()).data;
  expect(initialProgress.items.length).toBeGreaterThan(0);
  const progressResponse = await request.patch(`/api/planning/v2/runs/${runId}/action-progress`, {
    headers, data: { csrf, actionKey: initialProgress.items[0].actionKey, status: "doing", note: "기존 진행 기록" },
  });
  expect(progressResponse.ok()).toBeTruthy();
  const oldProgress = (await progressResponse.json()).data;
  const oldRecord = (await (await request.get(`/api/planning/v2/runs/${runId}`, { headers })).json()).data;
  await page.reload();
  await expect(plan).toHaveAttribute("data-state", "current");
  await expect(plan).toContainText("현재 저장 프로필과 같은 조건으로 계산된 플랜입니다.");
  const profileResponse = await request.patch(`/api/planning/v2/profiles/${oldId}`, {
    headers, data: { profile: { ...historical, monthlyIncomeNet: 5_000_000 }, csrf },
  });
  expect(profileResponse.ok()).toBeTruthy();

  await page.reload();
  await expect(plan).toHaveAttribute("data-state", "stale");
  await expect(plan).toContainText("현재 프로필이 이 플랜 이후 변경되었습니다. 미래 결과를 다시 계산해야 합니다.");
  await expect(current).toContainText("현재 기본 프로필");
  for (const [label, value] of [
    ["월 순수입", "500만원"], ["월 생활지출", "280만원"], ["월 최소 부채상환액", "70만원"],
    ["월 잉여금", "150만원"], ["총 부채", "1,000만원"], ["현재 순자산", "2,300만원"],
  ]) {
    await expect(current.getByText(label, { exact: true }).locator("..")).toContainText(value);
  }
  await expect(current).not.toContainText("말기 순자산");
  await expect(page.getByRole("heading", { name: "최근 플랜 결과", exact: true })).toBeVisible();
  await expect(page.getByText("이전 조건의 플랜", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true })).toBeVisible();
  await expect(plan.getByRole("link", { name: "계산 조건 검토" })).toHaveAttribute("href", `/planning?profileId=${oldId}`);

  const otherProfile = await createProfileFixture({
    request,
    headers,
    csrf,
    name: "다른 프로필 B",
    profile: { ...historical, liquidAssets: 990_000_000 },
  });
  expect(otherProfile.scopeUserId).toBe(oldProfile.scopeUserId);
  const otherId = otherProfile.record.id;
  const otherRunResponse = await request.post("/api/planning/v2/runs", {
    headers, data: { profileId: otherId, title: "더 최신인 B 플랜", csrf, input: {
      horizonMonths: 36, runScenarios: false, getActions: true, analyzeDebt: false, includeProducts: false, monteCarlo: null,
    } },
  });
  expect(otherRunResponse.ok()).toBeTruthy();
  const otherRunId = (await otherRunResponse.json()).data.id as string;
  const savedRuns = await request.get("/api/planning/v2/runs", { headers });
  expect(savedRuns.ok()).toBeTruthy();
  const savedRunIds = ((await savedRuns.json()).data as Array<{ id: string }>).map((run) => run.id);
  await page.reload();
  await expect(current).toContainText("현재 기본 프로필");
  await expect(plan).toHaveAttribute("data-state", "stale");
  await expect(plan).toContainText("24개월 시뮬레이션 말기");
  await expect(plan).not.toContainText("36개월 시뮬레이션 말기");
  await expect(page.getByText("더 최신인 B 플랜", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="/planning/reports?runId=${otherRunId}"]`)).not.toHaveCount(0);
  await expect(page.getByRole("link", { name: "최근 플랜 리포트 보기", exact: true }))
    .toHaveAttribute("href", `/planning/reports?runId=${runId}&profileId=${oldId}`);
  const secondaryTools = page.getByTestId("dashboard-secondary-tools");
  await expect(secondaryTools).not.toHaveAttribute("open");
  await secondaryTools.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(secondaryTools).toHaveAttribute("open", "");
  await expect(secondaryTools.getByRole("link", { name: "상품 탐색", exact: false })).toBeVisible();
  await secondaryTools.locator(":scope > summary").click();
  await expect(secondaryTools).not.toHaveAttribute("open");
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("dashboard-current-state.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(current).toContainText("150만원");
  await expect(page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("dashboard-mobile.png"), fullPage: true });
  if (originalViewport) await page.setViewportSize(originalViewport);

  const beforeClick = (await (await request.get("/api/planning/v2/runs", { headers })).json()).data;
  expect(beforeClick.map((run: { id: string }) => run.id)).toEqual(savedRunIds);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/planning/v2/runs") && response.request().method() === "POST");
  await page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true }).click();
  const rerunResponse = await responsePromise;
  expect(rerunResponse.ok()).toBeTruthy();
  expect(rerunResponse.request().postDataJSON()).toMatchObject({ profileId: oldId, rerunOfRunId: runId, input: oldRun.input });
  // Full-page report navigation can evict the POST body from Chromium's network buffer.
  await expect(page).toHaveURL(/\/planning\/reports\?runId=/, { timeout: 30_000 });
  const newRunId = new URL(page.url()).searchParams.get("runId");
  const newRun = (await (await request.get(`/api/planning/v2/runs/${newRunId}`, { headers })).json()).data;
  expect(newRun.id).not.toBe(runId);
  expect(newRun.profileId).toBe(oldId);
  expect(newRun.input).toEqual(oldRun.input);
  const savedProfile = (await (await request.get(`/api/planning/v2/profiles/${oldId}`, { headers })).json()).data.profile;
  expect(newRun.reproducibility.profileHash).toBe(computeProfileHash(savedProfile));
  expect(newRun.reproducibility.effectiveAssumptionsHash).toBe(oldRun.reproducibility.effectiveAssumptionsHash);
  await expect(page).toHaveURL(new RegExp(`/planning/reports\\?runId=${newRun.id}&profileId=${oldId}`), { timeout: 30_000 });
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  await test.info().attach("rerun-result", { body: JSON.stringify({ oldRunId: runId, newRunId: newRun.id, profileId: oldId, input: newRun.input }), contentType: "application/json" });
  await page.goto("/dashboard");
  await expect(plan).toHaveAttribute("data-state", "current");
  await expect(page.getByRole("button", { name: "현재 프로필로 다시 계산" })).toHaveCount(0);
  const afterNavigation = await request.get("/api/planning/v2/runs", { headers });
  expect(afterNavigation.ok()).toBeTruthy();
  expect(((await afterNavigation.json()).data as Array<{ id: string }>).map((run) => run.id)).toEqual([newRun.id, ...savedRunIds]);
  expect((await (await request.get(`/api/planning/v2/runs/${runId}`, { headers })).json()).data).toEqual(oldRecord);
  expect((await (await request.get(`/api/planning/v2/runs/${runId}/action-progress`, { headers })).json()).data).toEqual(oldProgress);
  await page.locator(`a[href="/planning/reports?runId=${runId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/planning/reports\\?runId=${runId}`), { timeout: 30_000 });
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  await page.goto("/dashboard");
  await page.locator('a[href="/planning/runs"]').first().click();
  await expect(page).toHaveURL(/\/planning\/runs/, { timeout: 30_000 });
  const rows = page.getByTestId("planning-runs-table");
  await expect(rows).toHaveAttribute("data-ready", "true");
  await rows.locator("tr", { hasText: "이전 조건의 플랜" }).locator('input[type="checkbox"]').check();
  await rows.locator("tr", { has: page.locator(`a[href*="runId=${newRun.id}"]`) }).locator('input[type="checkbox"]').check();
  await expect(page.getByRole("link", { name: "상세 비교 리포트 열기" })).toBeVisible();
  if (auth.supportsNamespaceIsolation) {
    await page.setExtraHTTPHeaders({ "x-planning-user-id": `${auth.requestedUserId}-other` });
    await page.goto("/dashboard");
    await expect(current.getByRole("link", { name: "재무 상태 진단 시작" })).toBeVisible();
    await expect(current).not.toContainText("0원");
    await expect(page.getByText("이전 조건의 플랜", { exact: true })).toHaveCount(0);
  }
});

async function seedStale(page: Page, request: APIRequestContext, baseURL: string) {
  const auth = await prepareFixtureAuth(page, baseURL, "rerun");
  const { headers } = auth;
  await page.goto("/dashboard");
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const snapshot = await seedSnapshot();
  const profile = { monthlyIncomeNet: 5000000, monthlyEssentialExpenses: 2000000, monthlyDiscretionaryExpenses: 500000,
    liquidAssets: 5000000, investmentAssets: 0, debts: [], goals: [] };
  const created = await createProfileFixture({
    request,
    headers,
    csrf,
    name: auth.requestedUserId,
    profile,
    makeDefault: true,
  });
  const profileId = created.record.id;
  const result = await request.post("/api/planning/v2/runs", { headers, data: { csrf, profileId, input: {
    horizonMonths: 24, snapshotId: snapshot.id, runScenarios: false, getActions: false, analyzeDebt: false,
  } } });
  expect(result.ok()).toBeTruthy();
  const oldRun = (await result.json()).data;
  expect((await request.patch(`/api/planning/v2/profiles/${profileId}`, { headers, data: { csrf, profile: { ...profile, monthlyIncomeNet: 6000000 } } })).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId("dashboard-current-plan")).toHaveAttribute("data-state", "stale");
  // Client data loading finishes only after hydration; synthetic double-clicks must target attached handlers.
  await expect(page.getByRole("button", { name: "새로고침", exact: true })).toBeVisible();
  const runIds = async () => ((await (await request.get(`/api/planning/v2/runs?profileId=${profileId}`, { headers })).json()).data as Array<{ id: string }>).map((run) => run.id);
  return { headers, csrf, snapshot, profileId, oldRun, runIds };
}

for (const { observedDebt, planActual } of [{ observedDebt: 0, planActual: false }, { observedDebt: 500_000, planActual: false }, { observedDebt: 500_000, planActual: true }]) {
test(`transaction profile draft updates the same profile after conflict review and connects dashboard stale to rerun current (debt=${observedDebt}, planActual=${planActual})`, async ({ page, request, baseURL }) => {
  test.setTimeout(150_000);
  const auth = await prepareFixtureAuth(page, baseURL!, "draft-update");
  const { headers } = auth;
  await page.goto("/dashboard");
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const snapshot = await seedSnapshot();
  const originalProfile: ProfileV2 = {
    monthlyIncomeNet: 5_000_000, monthlyEssentialExpenses: 2_000_000, monthlyDiscretionaryExpenses: 800_000,
    liquidAssets: 10_000_000, investmentAssets: 20_000_000,
    debts: [{ id: "draft-loan", name: "기존 대출", balance: 5_000_000, minimumPayment: observedDebt || 300_000, aprPct: 4 }],
    goals: [{ id: "draft-goal", name: "기존 목표", targetAmount: 12_000_000, currentAmount: 1_000_000, targetMonth: 24 }],
    currentAge: 35,
    cashflow: { phases: [{ id: "later-income", title: "이후 소득", range: { startMonth: 25, endMonth: 36 }, monthlyIncomeKrw: 5_500_000 }] },
    tax: { regime: "KR", filingStatus: "single", dependents: 1, notes: "기존 세금 설정" },
    pensionsDetailed: { regime: "KR", nationalPension: { expectedMonthlyPayoutKrw: 900_000, startAge: 65 }, notes: "기존 연금 설정" },
  };
  if (observedDebt > 0) {
    // The engine uses zero-based phase ranges. Preserve a schedule that reads current monthly fields.
    originalProfile.cashflow = { rules: { phaseOverlapPolicy: "override" }, phases: [
      { id: "current-monthly", title: "현재 월 값 사용", range: { startMonth: 0, endMonth: 23 } },
      ...originalProfile.cashflow!.phases!,
    ] };
  }
  // Safety policy keeps the first month's surplus as emergency cash, so this
  // representative plan contains only the 500,000 minimum payment, not extra payoff.
  if (planActual) originalProfile.liquidAssets = 0;
  const created = await createProfileFixture({
    request,
    headers,
    csrf,
    name: "거래 초안 대상 A",
    profile: originalProfile,
    makeDefault: true,
  });
  const profileId = created.record.id;
  const { scopeUserId } = created;

  const readProfile = async () => {
    const response = await request.get(`/api/planning/v2/profiles/${profileId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  const readProfiles = async () => {
    const response = await request.get("/api/planning/v2/profiles", { headers });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json() as { data: Array<{ id: string }> };
    const defaultProfileId = await runWithPlanningUserScope({ userId: scopeUserId }, () => getDefaultProfileId());
    return {
      data: payload.data.map((record) => ({ profileId: record.id, isDefault: record.id === defaultProfileId })),
      meta: { defaultProfileId },
    };
  };
  const profileIds = async () => (await readProfiles()).data.map((row) => row.profileId).sort();
  const beforeProfile = await readProfile();
  expect(beforeProfile.profile).toMatchObject(originalProfile);
  const beforeIds = await profileIds();
  expect((await readProfiles()).meta.defaultProfileId).toBe(profileId);
  const runInput = {
    horizonMonths: 24, snapshotId: snapshot.id, runScenarios: false, getActions: true, analyzeDebt: false, includeProducts: false,
    ...(planActual ? { policyId: "safety" as const } : {}),
  };
  // Seed a historical completed run via the real store. Never rewrite an existing run's date.
  const historicalRun = planActual ? await runWithPlanningUserScope({ userId: scopeUserId }, async () => {
    const createdAt = "2026-06-15T00:00:00.000Z";
    const assumptions = await resolvePlanningRunAssumptions({ profileId, requestedSnapshotId: snapshot.id,
      assumptionsOverride: {}, riskTolerance: "mid" });
    const resultDto = buildResultDtoV1FromRunRecord({ createdAt, input: { policyId: runInput.policyId }, meta: {}, outputs: {
      simulate: simulateMonthly(beforeProfile.profile, assumptions.finalSimulationAssumptions, 24, { policyId: "safety" }),
    } });
    return createRun({ profileId, title: "거래 초안 적용 전 플랜", createdAt, input: runInput, meta: { snapshot: assumptions.snapshotMeta },
      overallStatus: "SUCCESS", outputs: { resultDto }, reproducibility: buildRunReproducibilityMeta({ profile: beforeProfile.profile,
        assumptionsSnapshotId: assumptions.snapshotId, assumptionsSnapshot: assumptions.snapshot,
        effectiveAssumptions: assumptions.baseAssumptions, appliedOverrides: assumptions.appliedOverrides }) });
  }) : null;
  const runResponse = historicalRun ? null : await request.post("/api/planning/v2/runs", {
    headers, data: { csrf, profileId, title: "거래 초안 적용 전 플랜", input: {
      horizonMonths: 24, snapshotId: snapshot.id, runScenarios: false, getActions: true, analyzeDebt: false, includeProducts: false,
    } },
  });
  if (runResponse) expect(runResponse.ok()).toBeTruthy();
  const oldRun = historicalRun ?? (await runResponse!.json()).data;
  const readOldRun = async () => {
    const response = await request.get(`/api/planning/v2/runs/${oldRun.id}`, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  const oldRunRecord = await readOldRun();
  const runIds = async () => {
    const response = await request.get(`/api/planning/v2/runs?profileId=${profileId}`, { headers });
    expect(response.ok()).toBeTruthy();
    return ((await response.json()).data as Array<{ id: string }>).map((run) => run.id);
  };
  const profileFile = runWithPlanningUserScope({ userId: scopeUserId }, () => resolveProfileRecordPath(profileId));
  const oldRunFile = runWithPlanningUserScope({ userId: scopeUserId }, () => resolveProfileRunMetaPath(profileId, oldRun.id));
  const oldRunBytes = await fs.readFile(oldRunFile);
  await page.reload();
  await expect(page.getByTestId("dashboard-current-plan")).toHaveAttribute("data-state", "current");

  // This fixture is a stored transaction-derived draft, not a mocked detail/preflight/apply response.
  let draftId = `draft-${Date.now()}`;
  let monthlyPatch = { monthlyIncomeNet: 5_200_000, monthlyEssentialExpenses: 2_100_000, monthlyDiscretionaryExpenses: 700_000 };
  let fixture: DraftProfileRecord = {
    id: draftId, batchId: `batch-${draftId}`, createdAt: new Date().toISOString(),
    draftPatch: { ...monthlyPatch, assumptions: ["합성 거래 fixture 3개월 중앙값"], monthsConsidered: 3 },
    evidence: {
      monthsUsed: ["2026-06", "2026-07", "2026-08"],
      ymStats: ["2026-06", "2026-07", "2026-08"].map((ym) => ({
        ym, incomeKrw: 5_200_000, expenseKrw: 2_800_000, fixedExpenseKrw: 2_100_000,
        variableExpenseKrw: 700_000, debtExpenseKrw: 0, transferKrw: 0,
      })),
      byCategoryStats: [{ categoryId: "housing", totalKrw: 6_300_000 }, { categoryId: "food", totalKrw: 2_100_000 }],
      medians: { incomeKrw: 5_200_000, expenseKrw: 2_800_000, fixedExpenseKrw: 2_100_000, variableExpenseKrw: 700_000, debtExpenseKrw: 0 },
      ruleCoverage: { total: 9, override: 0, rule: 9, default: 0, transfer: 0 },
    },
    assumptions: ["합성 거래 fixture 3개월 중앙값"], stats: { months: 3, transfersExcluded: true, unassignedCount: 0 },
  };
  if (observedDebt > 0) {
    const batchId = await runWithPlanningUserScope({ userId: scopeUserId }, async () => {
      const account = await createAccount({ name: "합성 부채상환 거래", kind: "checking" });
      const imported = await importCsvToBatch({
        csvText: ["date,amount,description", ...(planActual ? ["2026-06", "2026-07", "2026-08"] : ["2026-08"]).flatMap((ym) => [
          `${ym}-01,5200000,salary`, `${ym}-02,-2100000,rent`, `${ym}-03,-700000,food`, `${ym}-04,-500000,loan`,
        ])].join("\n"),
        mapping: { dateKey: "date", amountKey: "amount", descKey: "description" }, options: { accountId: account.id },
      });
      for (const row of imported.transactions) {
        await upsertOverride({ batchId: imported.batchMeta.id, txnId: row.txnId,
          categoryId: row.amountKrw > 0 ? "income" : row.amountKrw === -2_100_000 ? "housing" : row.amountKrw === -700_000 ? "food" : "debt" });
      }
      return imported.batchMeta.id;
    });
    const generated = await request.post("/api/planning/v3/profile/drafts", { headers, data: { csrf, batchId } });
    expect(generated.ok()).toBeTruthy();
    draftId = (await generated.json()).data.draftId;
    const detail = await request.get(`/api/planning/v3/profile/drafts/${draftId}`, { headers });
    expect(detail.ok()).toBeTruthy();
    fixture = (await detail.json()).data;
    monthlyPatch = { monthlyIncomeNet: fixture.draftPatch.monthlyIncomeNet!,
      monthlyEssentialExpenses: fixture.draftPatch.monthlyEssentialExpenses!,
      monthlyDiscretionaryExpenses: fixture.draftPatch.monthlyDiscretionaryExpenses! };
    expect(fixture.evidence.medians).toMatchObject({ fixedExpenseKrw: 2_600_000, debtExpenseKrw: 500_000 });
    // Soft assertions let the same reproduction reach dashboard and the actual rerun.
    expect.soft(monthlyPatch).toEqual({ monthlyIncomeNet: 5_200_000, monthlyEssentialExpenses: 2_100_000, monthlyDiscretionaryExpenses: 700_000 });
  }
  const draftDir = runWithPlanningUserScope({ userId: scopeUserId }, () => path.join(
    !isPlanningNamespaceEnabled() && process.env.PLANNING_V3_DRAFTS_DIR
      ? path.resolve(process.env.PLANNING_V3_DRAFTS_DIR)
      : path.join(resolvePlanningV3DataDir(), "drafts"),
    "profile",
  ));
  const draftFile = path.join(draftDir, `${draftId}.json`);
  await fs.mkdir(draftDir, { recursive: true });
  profileDraftFiles.push(draftFile);
  if (!observedDebt) await fs.writeFile(draftFile, `${JSON.stringify(fixture)}\n`, "utf8");
  const draftResponse = await request.get(`/api/planning/v3/profile/drafts/${draftId}?csrf=${encodeURIComponent(csrf ?? "")}`, { headers });
  expect(draftResponse.ok()).toBeTruthy();
  expect((await draftResponse.json()).data.draftPatch).toEqual(fixture.draftPatch);
  expect(await profileIds()).toEqual(beforeIds);

  let applyRequests = 0;
  page.on("request", (req) => { if (req.method() === "POST" && req.url().endsWith(`/drafts/${draftId}/apply`)) applyRequests += 1; });
  const comparisonWrites: string[] = [];
  const observeComparison = (req: import("@playwright/test").Request) => {
    if (req.url().includes("/api/planning/") && !["GET", "HEAD"].includes(req.method())) comparisonWrites.push(req.url());
  };
  const comparisonBytes = await Promise.all([profileFile, oldRunFile, draftFile].map((file) => fs.readFile(file)));
  page.on("request", observeComparison);
  await page.goto(`/planning/v3/profile/drafts/${draftId}`);
  await expect(page.getByTestId("v3-draft-meta")).toBeVisible();
  const picker = page.getByTestId("v3-draft-base-profile-picker");
  const update = page.getByTestId("v3-draft-update-profile");
  const preflightButton = page.getByTestId("v3-draft-run-preflight");
  await expect(update).toBeDisabled();
  await picker.selectOption(profileId);
  await expect(update).toBeDisabled();
  if (planActual) {
    const comparison = page.getByTestId("v3-plan-vs-actual");
    await expect(comparison).toContainText("저장 당시 첫 계획월 vs 최근 거래 2개월 중앙값");
    await expect(comparison).toContainText("관측월: 2026-07, 2026-08");
    for (const [label, values] of [
      ["월 수입", ["5,000,000원", "5,200,000원", "+200,000원"]],
      ["생활지출(부채 제외)", ["2,800,000원", "2,800,000원", "0원"]],
      ["부채상환", ["500,000원", "500,000원", "0원"]],
      ["운영 잉여현금", ["1,700,000원", "1,900,000원", "+200,000원"]],
    ] as const) {
      const cells = comparison.getByRole("row", { name: new RegExp(label.replace(/[()]/g, "\\$&")) }).getByRole("cell");
      await expect(cells).toHaveText([...values]);
    }
    await expect(comparison).toContainText("200,000원 높습니다.");
    expect(comparisonWrites).toEqual([]);
    expect(await Promise.all([profileFile, oldRunFile, draftFile].map((file) => fs.readFile(file)))).toEqual(comparisonBytes);
    expect(await profileIds()).toEqual(beforeIds);
    expect(await runIds()).toEqual([oldRun.id]);
    await page.screenshot({ path: test.info().outputPath("plan-vs-actual.png"), fullPage: true });
  }
  page.off("request", observeComparison);
  const preflight = async () => {
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/drafts/${draftId}/preflight`) && response.request().method() === "POST");
    await preflightButton.click();
    const response = await responsePromise;
    expect(response.ok()).toBeTruthy();
    expect(response.request().postDataJSON()).toMatchObject({ profileId, applyMode: "update" });
    const data = (await response.json()).data;
    expect(data.ok).toBe(true);
    expect(data.errors).toEqual([]);
    expect(data.profileRevision).toEqual(expect.any(String));
    expect(data.draftPatchHash).toEqual(expect.any(String));
    await expect(update).toBeEnabled();
    expect(await profileIds()).toEqual(beforeIds);
    return data as { profileRevision: string; draftPatchHash: string };
  };
  const firstPreflight = await preflight();
  expect(applyRequests).toBe(0);
  // A concurrent name edit changes the record generation while leaving all original cashflow values intact.
  const concurrentEdit = await request.patch(`/api/planning/v2/profiles/${profileId}`, {
    headers, data: { csrf, name: "거래 초안 대상 A (다른 화면에서 수정)" },
  });
  expect(concurrentEdit.ok()).toBeTruthy();
  const beforeConflict = await readProfile();
  const beforeConflictBytes = await fs.readFile(profileFile);
  const conflictPromise = page.waitForResponse((response) => response.url().endsWith(`/drafts/${draftId}/apply`) && response.request().method() === "POST");
  await update.click();
  const conflict = await conflictPromise;
  expect(conflict.status()).toBe(409);
  expect(conflict.request().postDataJSON()).toMatchObject({
    profileId, applyMode: "update", expectedProfileRevision: firstPreflight.profileRevision, expectedDraftPatchHash: firstPreflight.draftPatchHash,
  });
  await expect(page.getByTestId("v3-draft-apply-result")).toContainText("프로필이 변경되어 preflight를 다시 확인해야 합니다.");
  await expect(update).toBeDisabled();
  await expect(preflightButton).toBeEnabled();
  expect(await fs.readFile(profileFile)).toEqual(beforeConflictBytes);
  expect(await readProfile()).toEqual(beforeConflict);
  expect(await profileIds()).toEqual(beforeIds);
  expect(await runIds()).toEqual([oldRun.id]);

  const reviewed = await preflight();
  expect(reviewed.profileRevision).not.toBe(firstPreflight.profileRevision);
  expect(reviewed.draftPatchHash).toBe(firstPreflight.draftPatchHash);
  const updatePromise = page.waitForResponse((response) => response.url().endsWith(`/drafts/${draftId}/apply`) && response.request().method() === "POST");
  await update.click();
  const updated = await updatePromise;
  expect(updated.ok()).toBeTruthy();
  expect(updated.request().postDataJSON()).toMatchObject({
    profileId, applyMode: "update", expectedProfileRevision: reviewed.profileRevision, expectedDraftPatchHash: reviewed.draftPatchHash,
  });
  await expect(page).toHaveURL(new RegExp(`/planning\\?profileId=${profileId}$`), { timeout: 30_000 });
  expect(applyRequests).toBe(2);
  const applied = await readProfile();
  expect(applied.id).toBe(profileId);
  expect(applied.name).toBe(beforeConflict.name);
  expect(applied.createdAt).toBe(beforeProfile.createdAt);
  expect(applied.profile).toEqual({ ...beforeProfile.profile, ...monthlyPatch });
  const afterProfiles = await readProfiles();
  expect(afterProfiles.data.map((row) => row.profileId).sort()).toEqual(beforeIds);
  expect(afterProfiles.meta.defaultProfileId).toBe(profileId);
  expect(afterProfiles.data.find((row) => row.profileId === profileId)?.isDefault).toBe(true);
  expect(await readOldRun()).toEqual(oldRunRecord);
  expect(await fs.readFile(oldRunFile)).toEqual(oldRunBytes);
  expect(oldRunRecord.reproducibility.profileHash).not.toBe(computeProfileHash(applied.profile));
  expect(await runIds()).toEqual([oldRun.id]);

  await page.goto("/dashboard");
  const plan = page.getByTestId("dashboard-current-plan");
  const current = page.getByTestId("dashboard-current-state");
  await expect(plan).toHaveAttribute("data-state", "stale");
  await expect(current).toContainText(applied.name);
  await expect(current.getByText("월 순수입", { exact: true }).locator("..")).toContainText("520만원");
  await expect.soft(current.getByText("월 생활지출", { exact: true }).locator("..")).toContainText("280만원");
  if (observedDebt > 0) {
    await expect(current.getByText("월 최소 부채상환액", { exact: true }).locator("..")).toContainText("50만원");
    await expect.soft(current.getByText("월 잉여금", { exact: true }).locator("..")).toContainText("190만원");
  }
  expect(await runIds()).toEqual([oldRun.id]);
  const rerunPromise = page.waitForResponse((response) => response.url().endsWith("/api/planning/v2/runs") && response.request().method() === "POST");
  await page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true }).click();
  const rerun = await rerunPromise;
  expect(rerun.ok()).toBeTruthy();
  expect(rerun.request().postDataJSON()).toMatchObject({ profileId, rerunOfRunId: oldRun.id, input: oldRun.input });
  await expect(page).toHaveURL(/\/planning\/reports\?runId=/, { timeout: 30_000 });
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  const newRunId = new URL(page.url()).searchParams.get("runId");
  expect(newRunId).toBeTruthy();
  expect(newRunId).not.toBe(oldRun.id);
  const savedNewRun = await request.get(`/api/planning/v2/runs/${newRunId}`, { headers });
  expect(savedNewRun.ok()).toBeTruthy();
  const newRun = (await savedNewRun.json()).data;
  expect(newRun.profileId).toBe(profileId);
  if (observedDebt > 0) {
    // runArtifacts retains the first actual simulation row at monthIndex=0.
    const simulation = await runWithPlanningUserScope({ userId: scopeUserId }, () => getRunBlob(newRun.id, "simulate")) as {
      keyTimelinePoints: Array<{ monthIndex: number; row: { month: number; operatingCashflow: number } }>;
    };
    const first = simulation.keyTimelinePoints.find((point) => point.monthIndex === 0)!.row;
    expect(first.month).toBe(1);
    await test.info().attach("transaction-debt-cashflow", { body: JSON.stringify({ monthlyPatch, debt: applied.profile.debts, first }), contentType: "application/json" });
    expect.soft(first.operatingCashflow).toBe(1_900_000);
  }
  expect(newRun.reproducibility.profileHash).toBe(computeProfileHash(applied.profile));
  await page.goto("/dashboard");
  await expect(plan).toHaveAttribute("data-state", "current");
  await expect(page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true })).toHaveCount(0);
  expect(await profileIds()).toEqual(beforeIds);
  expect(await runIds()).toEqual([newRunId, oldRun.id]);
  expect(await readOldRun()).toEqual(oldRunRecord);
  expect(await fs.readFile(oldRunFile)).toEqual(oldRunBytes);
  expect((await readProfile()).profile).toEqual(applied.profile);
  await test.info().attach("draft-update-dashboard-flow", {
    body: JSON.stringify({ profileId, profilesBefore: beforeIds.length, profilesAfter: afterProfiles.data.length, conflictNoWrite: true,
      preserved: ["liquidAssets", "investmentAssets", "debts", "goals", "cashflow", "tax", "pensionsDetailed", "currentAge", "defaultProfileId"],
      oldRunId: oldRun.id, newRunId, states: ["current", "stale", "current"] }),
    contentType: "application/json",
  });
});
}

test("dashboard rerun double click and lost-response retry reuse one key and one saved run", async ({ page, request, baseURL }) => {
  const seed = await seedStale(page, request, baseURL!);
  const keys: string[] = [];
  const bodies: unknown[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/planning/v2/runs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    bodies.push(route.request().postDataJSON());
    await gate;
    const response = await route.fetch();
    if (keys.length <= 2) return route.abort("failed"); // The server saved the run; both transport responses were lost.
    await route.fulfill({ response });
  });
  const button = page.getByRole("button", { name: "현재 프로필로 다시 계산" });
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(page.getByRole("button", { name: "다시 계산 중..." })).toBeDisabled();
  await expect.poll(() => keys.length).toBe(1);
  release();
  await expect(page.getByTestId("dashboard-current-plan").getByRole("alert")).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await seed.runIds()).toHaveLength(2);
  await button.click();
  await expect(page).toHaveURL(/\/planning\/reports\?runId=/, { timeout: 30_000 });
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
  expect(await seed.runIds()).toHaveLength(2);
});

test("dashboard missing snapshot rerun keeps stale, writes no run and permits retry or condition review", async ({ page, request, baseURL }) => {
  const seed = await seedStale(page, request, baseURL!);
  await fs.rm(seed.snapshot.file);
  const before = await seed.runIds();
  const keys: string[] = [];
  page.on("request", (req) => { if (req.method() === "POST" && req.url().endsWith("/api/planning/v2/runs")) keys.push(req.headers()["idempotency-key"]); });
  const plan = page.getByTestId("dashboard-current-plan");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/planning/v2/runs") && res.request().method() === "POST");
    await page.getByRole("button", { name: "현재 프로필로 다시 계산" }).click();
    expect((await response).status()).toBe(400);
    await expect(plan.getByRole("alert")).toContainText("이전 플랜의 기준 자료를 찾을 수 없습니다.");
    await expect(plan).toHaveAttribute("data-state", "stale");
    expect(await seed.runIds()).toEqual(before);
  }
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await plan.getByRole("link", { name: "계산 조건 검토" }).click();
  await expect(page).toHaveURL(new RegExp(`/planning\\?profileId=${seed.profileId}`), { timeout: 30_000 });
  expect(await seed.runIds()).toEqual(before);
});

test("a profile created next to the untouched seed is shown only after an explicit dashboard selection", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const auth = await prepareFixtureAuth(page, baseURL!, "selection");
  const { headers } = auth;
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const listed = await request.get("/api/planning/v2/profiles", { headers });
  expect(listed.ok()).toBeTruthy();
  const listedPayload = await listed.json() as {
    data: Array<{ id: string; createdAt: string; updatedAt: string }>;
    meta: { userId: string };
  };
  // Precondition: the repository seed exists and was never edited by this suite.
  const seedRecord = listedPayload.data.find((record) => record.id === "default-profile");
  expect(seedRecord, "the untouched repository seed must exist").toBeTruthy();
  expect(seedRecord!.updatedAt).toBe(seedRecord!.createdAt);
  const scope = { userId: listedPayload.meta.userId };
  // Shared production stores may have another default from earlier tests; make the seed the default explicitly.
  await runWithPlanningUserScope(scope, () => setDefaultProfile("default-profile"));

  // Browser: type into the seed's form and save it as a new profile with 새로 만들기.
  await page.goto("/planning?profileId=default-profile");
  const workspaceForm = page.getByTestId("planning-profile-form");
  await expect(page.getByLabel("프로필 선택")).toHaveValue("default-profile", { timeout: 30_000 });
  const name = `선택 검증 ${auth.requestedUserId}`;
  await workspaceForm.getByLabel("프로필 이름").fill(name);
  await workspaceForm.getByLabel("월 실수령").fill("4,650,000");
  await workspaceForm.getByLabel("필수지출").fill("1,850,000");
  await workspaceForm.getByLabel("선택지출").fill("550,000");
  await workspaceForm.getByLabel("현금(예금)").fill("3,200,000");
  await workspaceForm.getByLabel("투자자산").fill("2,100,000");
  const createdResponse = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/planning/v2/profiles" && res.request().method() === "POST");
  await page.getByTestId("planning-profile-create-button").click();
  const keepOriginal = page.getByRole("button", { name: "변경 없이 저장", exact: true });
  if (await keepOriginal.isVisible()) await keepOriginal.click();
  const created = await createdResponse;
  expect(created.ok()).toBeTruthy();
  const newId = (await created.json()).data.id as string;
  await expect(page.getByLabel("프로필 선택")).toHaveValue(newId, { timeout: 30_000 });

  // Browser: diagnosis run and report save.
  const confirm = page.locator("#planning-run-warning-confirm-checkbox");
  if (await confirm.isVisible()) await confirm.check();
  const runResponse = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/planning/v2/runs" && res.request().method() === "POST", { timeout: 60_000 });
  await page.getByTestId("run-button").click();
  const runCreated = await runResponse;
  expect(runCreated.ok()).toBeTruthy();
  const runId = (await runCreated.json()).data.id as string;
  await expect(page.getByTestId("stage-simulate-status")).toHaveAttribute("data-stage-state", /^(success|partial_success)$/i, { timeout: 180_000 });
  await page.goto(`/planning/reports?runId=${runId}&profileId=${newId}`);
  await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
  const reportResponse = page.waitForResponse((res) => new URL(res.url()).pathname === "/api/planning/v2/reports" && res.request().method() === "POST");
  await page.getByTestId("report-save-button").click();
  expect((await reportResponse).ok()).toBeTruthy();

  // Without a selection the dashboard asks for one instead of showing the empty seed or another profile's run.
  await page.goto("/dashboard");
  const root = page.getByTestId("dashboard-root");
  const current = page.getByTestId("dashboard-current-state");
  const plan = page.getByTestId("dashboard-current-plan");
  const label = page.getByTestId("dashboard-current-profile-label");
  await expect(page.getByTestId("dashboard-selection-required")).toBeVisible();
  await expect(current).not.toContainText("아직 입력된 재무 정보가 없습니다");
  await expect(plan.getByTestId("dashboard-next-action")).toContainText("표시할 프로필을 먼저 선택하세요");
  expect(await root.innerText()).not.toContain(newId);

  // Native GET form selection.
  await page.getByLabel("표시할 프로필").selectOption(newId);
  await page.getByRole("button", { name: "이 프로필 보기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?profileId=${newId}$`), { timeout: 30_000 });
  const expectSelected = async (state: "current" | "stale", incomeText: string) => {
    await expect(label).toContainText(`선택한 프로필: ${name}`);
    await expect(current.getByText("월 순수입", { exact: true }).locator("..")).toContainText(incomeText);
    await expect(plan).toHaveAttribute("data-state", state);
    await expect(page.getByLabel("표시할 프로필")).toHaveValue(newId);
    expect(await root.innerText()).not.toContain(newId);
  };
  await expectSelected("current", "465만원");
  await expect(current.getByText("월 생활지출", { exact: true }).locator("..")).toContainText("240만원");
  await expect(plan.getByRole("link", { name: "최근 플랜 리포트 보기", exact: true })).toHaveAttribute("href", `/planning/reports?runId=${runId}&profileId=${newId}`);
  await expect(plan.getByRole("link", { name: "현재 조건으로 다시 계산", exact: true })).toHaveAttribute("href", `/planning?profileId=${newId}`);

  // Reload and reopen keep the selection from the URL.
  await page.reload();
  await expectSelected("current", "465만원");
  await page.goto("/planning");
  await page.goto(`/dashboard?profileId=${encodeURIComponent(newId)}`);
  await expectSelected("current", "465만원");

  // HTTP fixtures (value setup only): a run pinned to a snapshot, then a saved profile change.
  const snapshot = await seedSnapshot();
  const pinned = await request.post("/api/planning/v2/runs", { headers, data: { csrf, profileId: newId, title: "선택 프로필 기준 플랜", input: {
    horizonMonths: 24, snapshotId: snapshot.id, runScenarios: false, getActions: false, analyzeDebt: false, includeProducts: false, monteCarlo: null,
  } } });
  expect(pinned.ok()).toBeTruthy();
  const pinnedRunId = (await pinned.json()).data.id as string;
  const stored = (await (await request.get(`/api/planning/v2/profiles/${newId}`, { headers })).json()).data.profile;
  expect((await request.patch(`/api/planning/v2/profiles/${newId}`, { headers, data: { csrf, profile: { ...stored, monthlyIncomeNet: 4_720_000 } } })).ok()).toBeTruthy();
  await page.reload();
  await expectSelected("stale", "472만원");
  await expect(plan.getByRole("link", { name: "계산 조건 검토", exact: true })).toHaveAttribute("href", `/planning?profileId=${newId}`);
  const rerunResponse = page.waitForResponse((res) => res.url().endsWith("/api/planning/v2/runs") && res.request().method() === "POST");
  await page.getByRole("button", { name: "현재 프로필로 다시 계산", exact: true }).click();
  const rerun = await rerunResponse;
  expect(rerun.ok()).toBeTruthy();
  expect(rerun.request().postDataJSON()).toMatchObject({ profileId: newId, rerunOfRunId: pinnedRunId });
  await expect(page).toHaveURL(new RegExp(`/planning/reports\\?runId=[^&]+&profileId=${newId}$`), { timeout: 30_000 });
  await page.goto(`/dashboard?profileId=${encodeURIComponent(newId)}`);
  await expectSelected("current", "472만원");

  // The stored default is unchanged and an unusable selection never falls back.
  expect(await runWithPlanningUserScope(scope, () => getDefaultProfileId())).toBe("default-profile");
  for (const bad of ["missing-profile-id", "..%2Fx"]) {
    await page.goto(`/dashboard?profileId=${bad}`);
    await expect(page.getByTestId("dashboard-selection-invalid")).toBeVisible();
    await expect(current).not.toContainText("월 순수입");
    await expect(page.getByTestId("dashboard-profile-selector")).toBeVisible();
  }
});
