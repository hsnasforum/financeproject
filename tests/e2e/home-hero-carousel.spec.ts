// The shared fixture replaces the HMR WebSocket on `/` and prevents hydration here.
import { expect, test } from "@playwright/test";

test("home hero carousel stays manual and supports keyboard slide selection", async ({ page }) => {
  await page.goto("/");

  const carousel = page.getByRole("region", { name: "시작 가이드 추천 슬라이드" });
  const activeSlide = page.getByTestId("home-hero-active-slide");
  const firstControl = page.getByRole("button", { name: "1번 슬라이드: 월 현금흐름" });
  const secondControl = page.getByRole("button", { name: "2번 슬라이드: 이번 달 액션" });

  await expect(carousel).toHaveAttribute("aria-roledescription", "캐러셀");
  await expect(activeSlide).toHaveAttribute("aria-roledescription", "슬라이드");
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");
  await expect(activeSlide).toHaveAttribute("aria-label", "1 / 3: 월 현금흐름");

  await secondControl.focus();
  await expect(secondControl).toBeFocused();
  await secondControl.press("Enter");
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-action-preview");

  await firstControl.focus();
  await firstControl.press("Enter");
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");
  await page.waitForTimeout(4_800);
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");

  await secondControl.focus();
  await secondControl.press("Enter");
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-action-preview");
  await expect(activeSlide).toHaveAttribute("aria-label", "2 / 3: 이번 달 액션");
  await expect(secondControl).toHaveAttribute("aria-current", "true");
  await expect(carousel.locator('button[aria-current="true"]')).toHaveCount(1);
});

test("home hero carousel remains still when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const activeSlide = page.getByTestId("home-hero-active-slide");
  const firstControl = page.getByRole("button", { name: "1번 슬라이드: 월 현금흐름" });
  const secondControl = page.getByRole("button", { name: "2번 슬라이드: 이번 달 액션" });

  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");
  await secondControl.click();
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-action-preview");
  await firstControl.click();
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");
  await page.waitForTimeout(4_800);
  await expect(activeSlide).toHaveAttribute("data-slide-id", "landing-diagnosis-preview");
});

test("home savings entry keeps its label, query, active tab, and responsive width aligned", async ({ page }) => {
  await page.route("**/api/products/unified?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: [], pageInfo: { hasMore: false, nextCursor: null } },
      }),
    });
  });
  await page.goto("/");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    const savingsEntry = page.getByRole("link", {
      name: "적금 적금 금리 비교 후 바로 플랜에 연결 살펴보기 →",
      exact: true,
    });
    await expect(savingsEntry).toBeVisible();
    expect(await savingsEntry.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  const savingsEntry = page.getByRole("link", {
    name: "적금 적금 금리 비교 후 바로 플랜에 연결 살펴보기 →",
    exact: true,
  });
  await savingsEntry.hover();
  await expect(savingsEntry.getByText("살펴보기 →", { exact: true })).toBeVisible();

  await savingsEntry.click();
  await expect(page).toHaveURL(/\/products\/catalog\?kind=saving/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("kind")).toBe("saving");
  await expect(page.getByRole("heading", { name: "통합 상품 탐색" })).toBeVisible();
  await expect(page.getByRole("button", { name: "정기적금", exact: true }).locator('span[aria-hidden="true"]')).toHaveCount(1);
});
