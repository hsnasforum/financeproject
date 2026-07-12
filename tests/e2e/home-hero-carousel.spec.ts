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
