import { expect, test } from "./helpers/e2eTest";

test("data sources page shows readonly health and reflects recent ping result in impact cards", async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("data-source-ping:v1:")) {
        window.localStorage.removeItem(key);
      }
    }
  });

  await page.goto("/settings/data-sources");

  const dartHealthBlock = page.getByTestId("data-source-impact-health-dart");
  await expect(dartHealthBlock).toBeVisible({ timeout: 30_000 });
  await expect(dartHealthBlock).toContainText("운영 최신 기준", { timeout: 30_000 });
  await expect(dartHealthBlock).toContainText(/정상|주의/, { timeout: 30_000 });
  await expect(dartHealthBlock).toContainText(/검색 인덱스 생성|검색 인덱스 없음/, { timeout: 30_000 });

  const planningHealthBlock = page.getByTestId("data-source-impact-health-planning");
  await expect(planningHealthBlock).toBeVisible({ timeout: 30_000 });
  await expect(planningHealthBlock).toContainText("운영 최신 기준", { timeout: 30_000 });
  await expect(planningHealthBlock).toContainText(/최신 동기화|최신 스냅샷 없음|스냅샷 읽기 실패/, { timeout: 30_000 });

  const dartMetaBlock = page.getByTestId("data-source-impact-meta-dart");
  await expect(dartMetaBlock).toBeVisible({ timeout: 30_000 });
  await expect(dartMetaBlock).toContainText("health API 집계", { timeout: 30_000 });
  await expect(dartMetaBlock).toContainText(/검색 인덱스 생성|검색 인덱스 없음/, { timeout: 30_000 });

  const housingRecentBlock = page.getByTestId("data-source-impact-ping-housing");
  await expect(housingRecentBlock).toContainText("아직 최근 연결 확인이 없습니다", { timeout: 30_000 });

  const salesCard = page.getByTestId("data-source-card-MOLIT_SALES");
  await salesCard.getByRole("button", { name: "연결 테스트" }).click();

  await expect(housingRecentBlock).toContainText(/정상|주의/, { timeout: 30_000 });
  await expect(housingRecentBlock).not.toContainText("아직 최근 연결 확인이 없습니다", { timeout: 30_000 });
});
