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

async function prepareBeginnerQuickStart(page: import("@playwright/test").Page): Promise<string> {
  await expect(page.getByRole("heading", { name: /플래닝 v2|Planning v2/i })).toBeVisible({ timeout: 30_000 });

  const quickStartGate = page.getByTestId("planning-quickstart-gate");
  await expect(quickStartGate).toBeVisible({ timeout: 30_000 });

  await quickStartGate.getByLabel("월 실수령액(원)").fill("3,200,000");
  await quickStartGate.getByLabel("월 고정지출(원)").fill("1,700,000");
  await quickStartGate.getByLabel("목표 이름").fill("비상금 1,000만 원");
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

  await page.getByTestId("planning-quickstart-next-step").click();
  const createButton = page.getByTestId("planning-profile-create-button");
  await expect(createButton).toBeVisible({ timeout: 30_000 });
  await createButton.click();
  await resolvePendingSuggestions(page);

  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  await expect(page.getByText("프로필 저장 완료. 다음 단계는 첫 실행이며, 결과 저장 뒤 리포트를 확인할 수 있습니다.")).toBeVisible({ timeout: 30_000 });
  await expect(appliedState).toContainText("프로필 저장 완료. 이제 첫 실행만 남았습니다.");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).toContainText("초안 적용 완료 · 프로필 저장 완료");
  await expect(page.getByTestId("planning-quickstart-next-step")).toHaveText("이제 첫 실행 시작");
  await expect(quickStartStatus).toContainText("프로필 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 첫 실행 시작");

  return readSelectedProfileId(page);
}

async function completeFirstQuickStartRun(page: import("@playwright/test").Page): Promise<void> {
  const appliedState = page.getByTestId("planning-quickstart-applied-state");
  const quickStartStatus = page.getByTestId("planning-workspace-quickstart-status");
  const firstRunButton = page.getByTestId("planning-quickstart-run-cta");

  await expect(firstRunButton).toBeVisible({ timeout: 30_000 });
  await expect(firstRunButton).toBeEnabled({ timeout: 30_000 });
  await firstRunButton.click();
  await expect(page.getByTestId("run-stages-timeline")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stage-simulate-status")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByText("첫 실행과 결과 저장을 완료했습니다. 이제 저장된 리포트를 확인하고 실행 기록에서 비교를 이어갈 수 있습니다.")).toBeVisible({ timeout: 30_000 });
  await expect(appliedState).toContainText("첫 실행과 결과 저장까지 완료했습니다. 이제 저장된 리포트를 확인하면 됩니다.");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).toContainText("초안 적용 완료 · 프로필 저장 완료 · 첫 실행 완료 · 결과 저장 완료");
  await expect(page.getByTestId("planning-quickstart-next-step")).toHaveText("저장된 리포트 확인");
  await expect(quickStartStatus).toContainText("프로필 저장 완료 · 첫 실행 완료 · 결과 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 저장된 리포트 확인 또는 실행 내역 비교");
  await expect(page.getByTestId("planning-quickstart-report-button")).toBeVisible({ timeout: 30_000 });
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

  await page.goto("/planning");
  await prepareBeginnerQuickStart(page);
  await completeFirstQuickStartRun(page);
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
  await expect(restoredState).toContainText("첫 실행 시작");
  await expect(quickStartStatus).toContainText("프로필 저장 완료");
  await expect(quickStartStatus).toContainText("다음 단계 · 첫 실행 시작");
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

  const runsLink = page.getByTestId("planning-quickstart-runs-link");
  await expect(runsLink).toBeVisible({ timeout: 30_000 });
  await expect(runsLink).toHaveClass(/bg-emerald-600/);

  await page.getByTestId("planning-quickstart-next-step").click();
  await expect(runsLink).toBeFocused();
  await runsLink.click();
  await expect(page).toHaveURL(/\/planning\/runs\?profileId=/);
});
