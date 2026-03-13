import { expect, test } from "./helpers/e2eTest";

test("news settings alert rules section links to alerts and digest follow-through routes", async ({ page }) => {
  await page.goto("/planning/v3/news/settings#news-settings-alert-rules");
  await expect(page).toHaveURL(/\/planning\/v3\/news\/settings#news-settings-alert-rules$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "뉴스 기준 설정", exact: true })).toBeVisible({ timeout: 30_000 });

  const alertRulesSection = page.locator("#news-settings-alert-rules");
  await expect(alertRulesSection).toBeVisible({ timeout: 30_000 });
  await expect(alertRulesSection).toHaveAttribute("open", "", { timeout: 30_000 });
  await expect(alertRulesSection).toContainText("적용 뒤 결과 확인", { timeout: 30_000 });
  await expect(alertRulesSection).toContainText("현재 적용값 불러오기", { timeout: 30_000 });
  await expect(alertRulesSection).toContainText("알림 규칙은 이 섹션에서만 적용되며, 메인 저장과 별개입니다.", { timeout: 30_000 });
  await expect(alertRulesSection.getByRole("button", { name: "알림 규칙 적용", exact: true })).toBeDisabled({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "뉴스 기준/내 상황 저장", exact: true }).first()).toBeVisible({ timeout: 30_000 });

  const alertsLink = alertRulesSection.getByRole("link", { name: "알림함 확인", exact: true });
  await expect(alertsLink).toHaveAttribute("href", "/planning/v3/news/alerts");
  await alertsLink.click();

  await expect(page).toHaveURL(/\/planning\/v3\/news\/alerts(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "중요 알림", exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/planning/v3/news/settings#news-settings-alert-rules");
  await expect(page.getByRole("heading", { name: "뉴스 기준 설정", exact: true })).toBeVisible({ timeout: 30_000 });

  const digestLink = page.locator("#news-settings-alert-rules").getByRole("link", { name: "Digest 확인", exact: true });
  await expect(digestLink).toHaveAttribute("href", "/planning/v3/news");
  await digestLink.click();

  await expect(page).toHaveURL(/\/planning\/v3\/news(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "오늘 재무 브리핑", exact: true })).toBeVisible({ timeout: 30_000 });
});
