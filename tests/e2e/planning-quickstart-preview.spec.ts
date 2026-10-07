import { expect, test } from "./helpers/e2eTest";

async function resolvePendingSuggestions(page: import("@playwright/test").Page): Promise<void> {
  const applySuggestedSave = page.getByRole("button", { name: "선택 적용 후 저장" });
  const keepOriginalSave = page.getByRole("button", { name: "변경 없이 저장" });
  if (await applySuggestedSave.isVisible().catch(() => false)) {
    const suggestionChecks = page.getByRole("checkbox", { name: /^\[/ });
    const checkCount = await suggestionChecks.count();
    for (let index = 0; index < checkCount; index += 1) {
      const item = suggestionChecks.nth(index);
      if (!(await item.isChecked().catch(() => false))) {
        await item.check();
      }
    }
    await applySuggestedSave.click();
    await expect(applySuggestedSave).toBeHidden({ timeout: 30_000 });
    return;
  }
  if (await keepOriginalSave.isVisible().catch(() => false)) {
    await keepOriginalSave.click();
    await expect(keepOriginalSave).toBeHidden({ timeout: 30_000 });
  }
}

async function readSelectedProfileId(page: import("@playwright/test").Page): Promise<string> {
  const profileId = await page.evaluate(() => window.localStorage.getItem("planning:v2:selectedProfileId") ?? "");
  expect(profileId).not.toBe("");
  return profileId;
}

async function readProfileRunIds(
  page: import("@playwright/test").Page,
  profileId: string,
): Promise<string[]> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/planning/v2/runs?profileId=${encodeURIComponent(id)}&limit=200`, {
      cache: "no-store",
    });
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    return (payload.data ?? [])
      .map((run) => run.id ?? "")
      .filter((runId) => runId.length > 0)
      .sort();
  }, profileId);
}

async function prepareBeginnerQuickStart(page: import("@playwright/test").Page): Promise<string> {
  await expect(page.getByRole("heading", { name: /재무 진단|Planning v2/i })).toBeVisible({ timeout: 30_000 });

  const quickStartGate = page.getByTestId("planning-quickstart-gate");
  await expect(quickStartGate).toBeVisible({ timeout: 30_000 });

  await quickStartGate.getByLabel("월 실수령액(원)").fill("3,200,000");
  await quickStartGate.getByLabel("월 고정지출(원)").fill("1,700,000");
  await quickStartGate.getByLabel("목표 이름").fill("전세자금");
  await quickStartGate.getByLabel("목표 금액(원)").fill("10,000,000");
  await quickStartGate.getByLabel("목표까지 남은 개월").fill("12");

  await quickStartGate.getByTestId("planning-quickstart-open-preview").click();

  const preview = page.getByTestId("planning-quickstart-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(preview).toContainText("이 초안으로 시작하면 아래 값이 먼저 채워집니다.");
  await expect(preview).toContainText("1,500,000원");
  await expect(preview).toContainText("833,334원");
  await expect(preview).toContainText("quick rules · 배분 가능");

  await page.getByTestId("planning-quickstart-apply").click();
  await expect(page.getByTestId("planning-quickstart-preview")).toHaveCount(0);

  const appliedState = page.getByTestId("planning-quickstart-applied-state");
  await expect(appliedState).toContainText("초안 적용 완료");
  await expect(appliedState).toContainText("다음 단계");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).toContainText("초안 적용 완료");
  await expect(appliedState).toContainText("quick rules · 배분 가능");

  const profileForm = page.getByTestId("planning-profile-form");
  await expect(profileForm.getByLabel("월 실수령")).toHaveValue("3,200,000");
  await expect(profileForm.getByLabel("필수지출")).toHaveValue("1,700,000");
  await expect(profileForm.getByLabel("선택지출")).toHaveValue("0");
  await expect(profileForm.getByLabel("목표 이름", { exact: true })).toHaveCount(1);
  await expect(profileForm.getByLabel("목표 이름", { exact: true })).toHaveValue("전세자금");
  await profileForm.getByRole("button", { name: "목표 추가", exact: true }).click();
  await expect(profileForm.getByLabel("목표 이름", { exact: true })).toHaveCount(2);
  await profileForm.getByRole("button", { name: "목표 2 삭제", exact: true }).click();
  await expect(profileForm.getByLabel("목표 이름", { exact: true })).toHaveCount(1);

  await page.getByTestId("planning-quickstart-next-step").click();
  const createButton = page.getByTestId("planning-profile-create-button");
  await expect(createButton).toBeVisible({ timeout: 30_000 });
  const benefitConditions = page.getByTestId("planning-benefit-conditions");
  await expect(benefitConditions).not.toHaveAttribute("open");
  await benefitConditions.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await benefitConditions.getByLabel("출생연도").fill("1994");
  await benefitConditions.locator(":scope > summary").click();
  await expect(benefitConditions).not.toHaveAttribute("open");
  await createButton.click();
  await resolvePendingSuggestions(page);

  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  await expect(page.getByText("프로필 저장 완료. 다음 단계는 첫 실행·기록 저장이며, 완료 뒤 리포트를 확인할 수 있습니다.")).toBeVisible({ timeout: 30_000 });
  await expect(appliedState).toContainText("프로필 저장 완료. 이제 첫 실행·기록 저장만 남았습니다.");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).toContainText("초안 적용 완료 · 프로필 저장 완료");
  await expect(page.getByTestId("planning-quickstart-next-step")).toHaveText("이제 첫 실행·기록 저장");
  await expect(quickStartStatus).toContainText("프로필 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 첫 실행·기록 저장");

  return readSelectedProfileId(page);
}

async function completeFirstQuickStartRun(
  page: import("@playwright/test").Page,
  profileId: string,
): Promise<void> {
  const appliedState = page.getByTestId("planning-quickstart-applied-state");
  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  const firstRunButton = page.getByTestId("planning-quickstart-run-cta");

  await expect(firstRunButton).toBeVisible({ timeout: 30_000 });
  await expect(firstRunButton).toBeEnabled({ timeout: 30_000 });
  const beforeRunIds = await readProfileRunIds(page, profileId);
  let releaseRunRequest: () => void = () => undefined;
  const heldRunRequest = new Promise<void>((resolve) => {
    releaseRunRequest = resolve;
  });
  const holdRunRoute = async (route: import("@playwright/test").Route) => {
    await heldRunRequest;
    await route.continue();
  };
  await page.route("**/api/planning/v2/runs", holdRunRoute);
  const runCreateResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/planning/v2/runs";
  });
  const runPostPaths: string[] = [];
  const idempotencyKeys: string[] = [];
  const recordRunPost = (request: import("@playwright/test").Request) => {
    if (request.method() !== "POST") return;
    const url = new URL(request.url());
    if (!["/api/planning/v2/runs", "/api/planning/v2/run", "/api/planning/run"].includes(url.pathname)) return;
    runPostPaths.push(url.pathname);
    idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
  };
  page.on("request", recordRunPost);
  await firstRunButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  try {
    await expect(page.getByLabel("프로필 선택")).toBeDisabled();
    await expect(page.getByTestId("planning-profile-create-button")).toBeDisabled();
    await expect(page.getByTestId("planning-profile-update-button")).toBeDisabled();
    await expect(page.getByRole("button", { name: "삭제", exact: true })).toBeDisabled();
  } finally {
    releaseRunRequest();
  }
  const runCreateResponse = await runCreateResponsePromise;
  const runCreatePayload = await runCreateResponse.json() as { data?: { id?: string } };
  await expect(page.getByTestId("run-stages-timeline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stage-simulate-status")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText("첫 실행과 기록 저장을 완료했습니다. 이제 저장된 리포트를 확인하고 실행 기록에서 비교를 이어갈 수 있습니다.")).toBeVisible({ timeout: 30_000 });
  await expect(appliedState).toContainText("첫 실행과 기록 저장을 완료했습니다. 이제 저장된 리포트를 확인하면 됩니다.");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).toContainText("초안 적용 완료 · 프로필 저장 완료 · 첫 실행·기록 저장 완료");
  await expect(page.getByTestId("planning-quickstart-next-step")).toHaveText("저장된 리포트 확인");
  await expect(quickStartStatus).toContainText("프로필 저장 완료 · 첫 실행·기록 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 저장된 리포트 확인 또는 실행 내역 비교");
  await expect(page.getByTestId("planning-quickstart-report-button")).toBeVisible({ timeout: 30_000 });
  page.off("request", recordRunPost);
  await page.unroute("**/api/planning/v2/runs", holdRunRoute);

  const afterRunIds = await readProfileRunIds(page, profileId);
  const newRunIds = afterRunIds.filter((runId) => !beforeRunIds.includes(runId));
  expect(runPostPaths).toEqual(["/api/planning/v2/runs"]);
  expect(idempotencyKeys).toHaveLength(1);
  expect(idempotencyKeys[0]).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/);
  expect(afterRunIds).toHaveLength(beforeRunIds.length + 1);
  expect(newRunIds).toHaveLength(1);
  expect(runCreatePayload.data?.id).toBe(newRunIds[0]);
  await expect(page.getByTestId("planning-quickstart-report-button")).toHaveAttribute(
    "href",
    new RegExp(`runId=${encodeURIComponent(newRunIds[0] ?? "")}`),
  );
  await expect(page.getByTestId("planning-runs-link")).toHaveAttribute(
    "href",
    new RegExp(`selected=${encodeURIComponent(newRunIds[0] ?? "")}`),
  );
  await expect(page.getByTestId("planning-quickstart-save-run-button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "결과 저장", exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "실행 성공 시 실행 기록 자동 저장" })).toHaveCount(0);
}

async function enableQuickStartReviewFallback(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const subtlePrototype = globalThis.SubtleCrypto?.prototype;
    const markerKey = "__e2eQuickStartFallbackCryptoPatched";
    Object.defineProperty(globalThis, markerKey, {
      configurable: true,
      value: false,
      writable: true,
    });
    if (!subtlePrototype || typeof subtlePrototype.digest !== "function") return;
    const currentDigest = subtlePrototype.digest as SubtleCrypto["digest"] & { __e2eQuickStartFallback__?: boolean };
    if (currentDigest.__e2eQuickStartFallback__) {
      (globalThis as Record<string, unknown>)[markerKey] = true;
      return;
    }

    const fallbackDigest = async () => {
      throw new Error("e2e quickstart review fallback");
    };
    Object.defineProperty(fallbackDigest, "__e2eQuickStartFallback__", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(subtlePrototype, "digest", {
      configurable: true,
      value: fallbackDigest,
    });
    (globalThis as Record<string, unknown>)[markerKey] = true;
  });
}

test("planning quickstart previews before applying beginner draft", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("planning:v2:beginnerMode", "true");
    window.localStorage.removeItem("planning:v2:selectedProfileId");
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "내 재무 현황", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "데스크톱 주 메뉴" }).getByRole("link", { name: "재무진단", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole("heading", { name: "재무 진단", exact: true })).toBeVisible({ timeout: 30_000 });
  const calculationOptions = page.getByTestId("planning-calculation-options");
  await expect(calculationOptions).not.toHaveAttribute("open");
  await expect(page.getByTestId("planning-what-if-options")).not.toHaveAttribute("open");
  await page.screenshot({ path: test.info().outputPath("planning-input-after.png"), fullPage: true });
  const profileId = await prepareBeginnerQuickStart(page);
  await expect(page.getByTestId("planning-quickstart-inputs")).not.toHaveAttribute("open");
  const saveControl = page.getByTestId("planning-profile-update-button");
  const saveColors = await saveControl.evaluate((element) => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(saveColors.foreground).not.toBe(saveColors.background);
  await saveControl.screenshot({ path: test.info().outputPath("planning-save-control.png") });
  const appliedDetails = page.getByTestId("planning-quickstart-applied-details");
  await expect(appliedDetails).not.toHaveAttribute("open");
  await appliedDetails.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(appliedDetails.getByText("quick rules · 배분 가능", { exact: true })).toBeVisible();
  await appliedDetails.locator(":scope > summary").click();
  await calculationOptions.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(calculationOptions.getByRole("button", { name: "10년 (120개월)", exact: true })).toBeVisible();
  await calculationOptions.locator(":scope > summary").click();
  await completeFirstQuickStartRun(page, profileId);

  const ids = await readProfileRunIds(page, profileId);
  const storedProfile = await page.evaluate(async (id) => {
    const response = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(id)}`);
    return (await response.json()).data.profile;
  }, profileId);
  expect(storedProfile).toMatchObject({ monthlyIncomeNet: 3_200_000, monthlyEssentialExpenses: 1_700_000, monthlyDiscretionaryExpenses: 0, birthYear: 1994 });
  expect(storedProfile.goals).toEqual([expect.objectContaining({ name: "전세자금", targetAmount: 10_000_000, targetMonth: 12 })]);
  const result = page.getByTestId("planning-workspace-results");
  await page.getByTestId("planning-result-jump").click();
  await expect(result.getByRole("heading", { name: "진단 결과", exact: true })).toBeVisible();
  await expect(result.getByTestId("planning-key-findings")).toBeVisible();
  await expect(result.getByRole("button", { name: "핵심 요약", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(result.getByTestId("planning-result-summary")).toContainText("목표 달성1/1");
  await expect(result.getByTestId("planning-result-summary")).toContainText("현금흐름 위험");
  await expect(result.getByTestId("planning-result-summary")).not.toContainText("월 의무지출을 감당하지 못한 구간");
  const evidence = result.getByTestId("planning-result-evidence");
  await expect(evidence).not.toHaveAttribute("open");
  await evidence.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(evidence.getByTestId("planning-metric-evidence")).toBeVisible();
  await evidence.locator(":scope > summary").click();
  const interpretation = result.getByTestId("planning-result-interpretation");
  await expect(interpretation).not.toHaveAttribute("open");
  await interpretation.locator(":scope > summary").click();
  await expect(interpretation.getByTestId("interpretation-guide")).toBeVisible();
  await interpretation.locator(":scope > summary").click();
  expect(await readProfileRunIds(page, profileId)).toEqual(ids);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("planning-complete-after.png"), fullPage: true });
  await test.info().attach("result-position", { body: JSON.stringify(await result.boundingBox()), contentType: "application/json" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath("planning-mobile-after.png"), fullPage: true });
  await result.getByRole("link", { name: "저장된 리포트 열기", exact: true }).click();
  await expect(page.getByTestId("report-dashboard")).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("profileId")).toBe(profileId);
  await page.reload();
  await expect(page.getByTestId("report-dashboard")).toBeVisible();
  const reportGoals = page.locator("#report-goals");
  await expect(reportGoals.getByRole("cell", { name: "전세자금", exact: true })).toBeVisible();
  await expect(reportGoals.locator("tbody tr")).toHaveCount(1);
  expect(await readProfileRunIds(page, profileId)).toEqual(ids);

  await page.goto(`/planning?profileId=${encodeURIComponent(profileId)}`);
  const restoredStatus = page.getByTestId("planning-workspace-quickstart-status");
  await expect(restoredStatus).toContainText("프로필 저장 완료");
  await expect(restoredStatus).not.toContainText("미저장");
  const restoredForm = page.getByTestId("planning-profile-form");
  await expect(restoredForm.getByLabel("목표 이름", { exact: true })).toHaveCount(1);
  await expect(restoredForm.getByLabel("목표 이름", { exact: true })).toHaveValue("전세자금");
  const reopenedProfile = await page.evaluate(async (id) => {
    const response = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(id)}`);
    return (await response.json()).data.profile;
  }, profileId);
  expect(reopenedProfile).toEqual(storedProfile);
  expect(await readProfileRunIds(page, profileId)).toEqual(ids);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await restoredForm.screenshot({ path: test.info().outputPath("planning-goals-mobile.png") });
  await restoredForm.getByRole("button", { name: "목표 1 삭제", exact: true }).click();
  await expect(restoredForm.getByText("등록된 목표가 없습니다.", { exact: true })).toBeVisible();
  await page.getByTestId("planning-profile-update-button").click();
  await resolvePendingSuggestions(page);
  await expect(restoredStatus).toContainText("프로필 저장 완료");
  await page.reload();
  await expect(restoredStatus).toContainText("프로필 저장 완료");
  await expect(restoredStatus).not.toContainText("미저장");
  await expect(restoredForm.getByLabel("목표 이름", { exact: true })).toHaveCount(0);
  await expect(restoredForm.getByText("등록된 목표가 없습니다.", { exact: true })).toBeVisible();
  const emptyGoals = await page.evaluate(async (id) => {
    const response = await fetch(`/api/planning/v2/profiles/${encodeURIComponent(id)}`);
    return (await response.json()).data.profile.goals;
  }, profileId);
  expect(emptyGoals).toEqual([]);
  expect(await readProfileRunIds(page, profileId)).toEqual(ids);
});

test("planning arrival with profileId query focuses the next-step run target", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("planning:v2:beginnerMode", "true");
    window.localStorage.removeItem("planning:v2:selectedProfileId");
  });

  await page.goto("/planning");
  const profileId = await prepareBeginnerQuickStart(page);

  await page.goto(`/planning?profileId=${encodeURIComponent(profileId)}`);

  const restoredState = page.getByTestId("planning-quickstart-restored-state");
  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  const firstRunButton = page.getByTestId("planning-quickstart-run-cta");

  await expect(restoredState).toContainText("현재 워크스페이스 상태 기준으로 프로필 저장이 확인됐습니다.");
  await expect(restoredState).toContainText("첫 실행·기록 저장");
  await expect(quickStartStatus).toContainText("프로필 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 첫 실행·기록 저장");
  await expect(firstRunButton).toBeVisible({ timeout: 30_000 });
  await expect(firstRunButton).toBeFocused();
});

test("planning quickstart keeps review fallback focused on runs history when profile hash verification is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("planning:v2:beginnerMode", "true");
    window.localStorage.removeItem("planning:v2:selectedProfileId");
  });
  await enableQuickStartReviewFallback(page);

  await page.goto("/planning");
  await expect.poll(async () => page.evaluate(() => {
    const marker = (globalThis as Record<string, unknown>).__e2eQuickStartFallbackCryptoPatched;
    return marker === true;
  })).toBe(true);
  await prepareBeginnerQuickStart(page);

  const firstRunButton = page.getByTestId("planning-quickstart-run-cta");
  await expect(firstRunButton).toBeVisible({ timeout: 30_000 });
  await firstRunButton.click();
  await expect(page.getByTestId("run-stages-timeline")).toBeVisible({ timeout: 30_000 });

  const appliedState = page.getByTestId("planning-quickstart-applied-state");
  await expect(appliedState).toContainText("최근 실행 상태를 자동 확인하지 못했습니다. 진행 상태를 다시 확인해 주세요.");
  await expect(appliedState).toContainText("초안 적용 완료 · 실행 상태 확인 필요");
  await expect(appliedState).toContainText("아래 실행 내역에서 진행 상태를 다시 확인해 주세요.");
  await expect(page.getByTestId("planning-quickstart-next-step")).toHaveText("진행 상태 다시 확인");

  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  await expect(quickStartStatus).toContainText("프로필 저장 완료 · 실행 상태 확인 필요");
  await expect(quickStartStatus).toContainText("다음 단계 · 진행 상태 다시 확인");
  await expect(page.getByTestId("planning-quickstart-run-cta")).toHaveCount(0);

  const runsLink = page.locator("#planning-quickstart-runs-link");
  await expect(runsLink).toBeVisible({ timeout: 30_000 });
  await expect(runsLink).toHaveClass(/bg-emerald-600/);

  await page.getByTestId("planning-quickstart-next-step").click();
  await expect(runsLink).toBeFocused();
  await runsLink.click();
  await expect(page).toHaveURL((url) => (
    url.pathname === "/planning/runs"
    && Boolean(url.searchParams.get("profileId"))
    && Boolean(url.searchParams.get("selected"))
  ));
});
