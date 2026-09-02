import { expect, test } from "./helpers/e2eTest";

test("FX labels mock and old data without presenting it as current", async ({ page }) => {
  await page.route(/\/api\/public\/fx(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          items: [{
            currency: "USD",
            amount: 1000,
            rate: 1350,
            asOfDate: "2026-06-22",
            krw: 1_350_000,
          }],
          totalKrw: 1_350_000,
        },
        meta: {
          cache: "miss",
          provenance: {
            mode: "mock",
            asOf: "2026-06-22",
            degraded: true,
          },
        },
      }),
    });
  });

  await page.goto("/tools/fx");
  await page.waitForLoadState("networkidle");
  const fxResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === "/api/public/fx"
  ));
  await page.getByRole("button", { name: "원화로 환산하기" }).click();
  await fxResponse;

  await expect(page.getByText("예시 데이터", { exact: true })).toBeVisible();
  await expect(page.getByText("기준 시점 오래됨", { exact: true })).toBeVisible();
  await expect(page.getByText(/한국수출입은행 최신 원문 환율/)).toBeVisible();
  await expect(page.getByText("현재 기준 환산 결과", { exact: true })).toHaveCount(0);
});
