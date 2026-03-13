import { expect, test } from "./helpers/e2eTest";

test("dart search -> company detail flow", async ({ page }) => {
  await page.goto("/public/dart");
  await expect(page.getByTestId("dart-search-idle")).toBeVisible({ timeout: 30_000 });

  const submitButton = page.getByTestId("dart-search-submit");
  await page.getByTestId("dart-search-input").fill("삼성");
  await expect(submitButton).toBeEnabled({ timeout: 30_000 });
  await submitButton.click();

  const missingIndexCard = page.getByTestId("dart-missing-index");
  if (await missingIndexCard.isVisible().catch(() => false)) {
    const buildButton = page.getByTestId("dart-build-index-button");
    await expect(buildButton).toBeVisible({ timeout: 30_000 });
    await buildButton.click();
    await expect(missingIndexCard).toHaveCount(0, { timeout: 30_000 });
    await expect(submitButton).toBeEnabled({ timeout: 30_000 });
    await submitButton.click();
  }

  const firstItem = page.getByTestId("dart-search-item").first();
  await expect(firstItem).toBeVisible({ timeout: 30_000 });
  await firstItem.click();

  await expect(page).toHaveURL(/\/public\/dart\/company\?corpCode=/, { timeout: 30_000 });
  await expect(page).toHaveURL(/corpName=/, { timeout: 30_000 });
  await expect(page.getByTestId("dart-company-root")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-company-name")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "검색 결과로 돌아가기" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-action")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "검색 결과로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/public\/dart\?q=/, { timeout: 30_000 });
  await expect(page.getByTestId("dart-search-input")).toHaveValue("삼성", { timeout: 30_000 });
  await expect(page.getByTestId("dart-search-item").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-recent-search-chip").filter({ hasText: "삼성" }).first()).toBeVisible({ timeout: 30_000 });

  await firstItem.click();
  await expect(page.getByTestId("dart-monitor-action")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("dart-monitor-action").click();
  await expect(page).toHaveURL(/\/public\/dart\?tab=monitor/, { timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("모니터링할 기업이 없습니다")).toHaveCount(0, { timeout: 30_000 });
});

test("dart company page handles missing corpCode and safe homepage link", async ({ page }) => {
  await page.goto("/public/dart/company");
  await expect(page.getByTestId("dart-company-root")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("회사 선택이 필요합니다")).toBeVisible({ timeout: 30_000 });

  await page.goto("/public/dart/company?corpCode=00126380");
  await expect(page.getByTestId("dart-company-name")).toHaveText("삼성전자", { timeout: 30_000 });
  const homepageLink = page.getByRole("link", { name: "www.samsung.com" });
  await expect(homepageLink).toBeVisible({ timeout: 30_000 });
  await expect(homepageLink).toHaveAttribute("href", /https:\/\/www\.samsung\.com\/?/);
  await expect(homepageLink).toHaveAttribute("rel", "noopener noreferrer");
});

test("dart monitor shows summary and blocks invalid date range", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dart_favorites_v1", JSON.stringify([
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        savedAt: "2026-03-11T00:00:00.000Z",
      },
    ]));
  });

  await page.goto("/public/dart");
  await page.getByRole("button", { name: "공시 모니터링" }).click();

  await expect(page.getByTestId("dart-monitor-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-filter-summary")).toBeVisible({ timeout: 30_000 });

  const fromInput = page.locator('input[placeholder="YYYY-MM-DD"]').nth(0);
  const toInput = page.locator('input[placeholder="YYYY-MM-DD"]').nth(1);
  const refreshAllButton = page.getByRole("button", { name: "전체 조회" });

  await fromInput.fill("2026-03-20");
  await toInput.fill("2026-03-11");
  await expect(page.getByTestId("dart-monitor-settings-error")).toContainText("시작일은 종료일보다 늦을 수 없습니다.", { timeout: 30_000 });
  await expect(refreshAllButton).toBeDisabled({ timeout: 30_000 });

  await page.getByRole("button", { name: "최근 7일" }).click();
  await expect(page.getByTestId("dart-monitor-settings-error")).toHaveCount(0, { timeout: 30_000 });
  await expect(refreshAllButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-visibility-summary")).toContainText("신규 공시가 있는 기업과 아직 확인하지 않은 기업이 먼저 보입니다.", { timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-priority-list")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-priority-00126380")).toContainText("아직 조회하지 않아 먼저 확인하는 편이 안전합니다.", { timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-priority-preview-00126380")).toContainText("최근 공시를 아직 불러오지 않았습니다.", { timeout: 30_000 });

  await page.getByTestId("dart-monitor-summary-unchecked-only").click();
  await expect(page.getByTestId("dart-monitor-visibility-summary")).toContainText("아직 확인하지 않은 기업 1곳만 보고 있습니다.", { timeout: 30_000 });
  await page.goto("/public/dart?tab=monitor");
  await expect(page.getByTestId("dart-monitor-visibility-summary")).toContainText("아직 확인하지 않은 기업 1곳만 보고 있습니다.", { timeout: 30_000 });

  await page.getByTestId("dart-monitor-summary-pending-only").click();
  await expect(page.getByTestId("dart-monitor-pending-empty")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("지금 바로 확인할 신규 공시가 없습니다")).toBeVisible({ timeout: 30_000 });
  await page.goto("/public/dart?tab=monitor");
  await expect(page.getByTestId("dart-monitor-pending-empty")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("dart-monitor-show-all").click();
  await expect(page.getByTestId("dart-monitor-pending-empty")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("dart-monitor-visibility-summary")).toContainText("신규 공시가 있는 기업과 아직 확인하지 않은 기업이 먼저 보입니다.", { timeout: 30_000 });

  await page.getByTestId("dart-monitor-priority-company-link-00126380").click();
  await expect(page).toHaveURL(/\/public\/dart\/company\?corpCode=00126380/, { timeout: 30_000 });
  await expect(page).toHaveURL(/corpName=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90/, { timeout: 30_000 });
  await expect(page.getByTestId("dart-company-name")).toHaveText("삼성전자", { timeout: 30_000 });

  await page.goto("/public/dart?tab=monitor");
  await expect(page.getByTestId("dart-monitor-summary")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("dart-monitor-remove-00126380").click();
  await expect(page.getByText("모니터링할 기업이 없습니다")).toBeVisible({ timeout: 30_000 });
});
