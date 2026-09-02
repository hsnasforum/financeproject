import { expect, test } from "./helpers/e2eTest";

const AFFORD_URL = "/housing/afford?incomeNet=1000000&outflow=200000&mode=rent&deposit=0&monthlyRent=300000&opportunityAprPct=0";

function affordUrl(incomeNet: number): string {
  return AFFORD_URL.replace("incomeNet=1000000", `incomeNet=${incomeNet}`);
}

test("housing composition uses normalized income and suppresses invalid percentages", async ({ page }) => {
  await page.goto(AFFORD_URL);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("기타 지출 (20%)", { exact: true })).toBeVisible();
  await expect(page.getByText("주거비 (30%)", { exact: true })).toBeVisible();
  await expect(page.getByText("잔여 50%", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "월 현금흐름 구성" })).toBeVisible();

  await page.goto(affordUrl(0));
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("계산 제한", { exact: true })).toBeVisible();
  await expect(page.getByText("월 소득 기준 0원", { exact: true })).toBeVisible();
  await expect(page.getByText("기타 지출 (-)", { exact: true })).toBeVisible();
  await expect(page.getByText("주거비 (-)", { exact: true })).toBeVisible();
  await expect(page.getByText("잔여 -", { exact: true })).toBeVisible();
  await expect(page.getByText("-500,000원", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "월 현금흐름 구성 비율 계산 불가" })).toBeVisible();

  await page.goto(affordUrl(-100));
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("월 소득 기준 0원", { exact: true })).toBeVisible();
  await expect(page.getByText("기타 지출 (-)", { exact: true })).toBeVisible();
  await expect(page.getByText("주거비 (-)", { exact: true })).toBeVisible();
  await expect(page.getByText("잔여 -", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "월 현금흐름 구성 비율 계산 불가" })).toBeVisible();
});
