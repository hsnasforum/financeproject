import path from "node:path";
import { expect, test } from "./helpers/e2eTest";

test("planning v3 transactions uploads csv and follows override save through in batch detail", async ({ page }) => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "planning-v3", "csv", "sample.csv");
  const suffix = Date.now().toString(36);
  const primaryAccountName = `메인 통장 ${suffix}`;
  const secondaryAccountName = `보조 통장 ${suffix}`;

  await page.goto("/planning/v3/accounts");
  await page.getByTestId("v3-account-name").fill(primaryAccountName);
  await page.getByTestId("v3-account-kind").selectOption("checking");
  await page.getByTestId("v3-create-account").click();
  await expect(page.getByTestId("v3-create-account")).toHaveText("계좌 생성", { timeout: 30_000 });
  await page.getByTestId("v3-account-name").fill(secondaryAccountName);
  await page.getByTestId("v3-account-kind").selectOption("checking");
  await page.getByTestId("v3-create-account").click();
  await expect(page.getByTestId("v3-create-account")).toHaveText("계좌 생성", { timeout: 30_000 });

  await page.goto("/planning/v3/transactions");
  await page.getByTestId("v3-upload-account-select").selectOption({ label: `${primaryAccountName} (checking)` });

  await page.getByTestId("v3-upload-input").setInputFiles(fixturePath);
  await page.getByTestId("v3-upload-submit").click();

  await expect(page).toHaveURL(/\/planning\/v3\/transactions\/batches\/[^/?#]+(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByTestId("v3-batch-meta")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("v3-batch-range")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("거래 분류, 계좌 매핑, 이체 판정은 먼저 오버라이드로 저장됩니다. 아래 카테고리 집계와 캐시플로우는 저장 뒤 자동으로 다시 계산됩니다.", { exact: true })).toBeVisible({ timeout: 30_000 });

  const firstTxnRow = page.getByTestId(/v3-txn-row-/).first();
  await expect(firstTxnRow.getByRole("button", { name: "계좌 저장", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(firstTxnRow.getByRole("button", { name: "분류 저장", exact: true })).toBeVisible({ timeout: 30_000 });
  const transferButton = firstTxnRow.locator('[data-testid^="v3-txn-transfer-"]');
  await expect(transferButton).toBeVisible({ timeout: 30_000 });

  await firstTxnRow.locator('select[data-testid^="v3-txn-account-"]').selectOption({ label: secondaryAccountName });
  await firstTxnRow.getByRole("button", { name: "계좌 저장", exact: true }).click();

  await expect(page.getByText("거래 계좌 매핑을 저장했습니다. 아래 카테고리 집계와 캐시플로우는 자동으로 다시 계산됩니다.", { exact: true })).toBeVisible({ timeout: 30_000 });

  const categorySelect = firstTxnRow.locator('select[data-testid^="v3-txn-category-"]');
  const currentCategory = await categorySelect.inputValue();
  const nextCategory = currentCategory === "fixed" ? "food" : "fixed";
  await categorySelect.selectOption(nextCategory);
  await firstTxnRow.getByRole("button", { name: "분류 저장", exact: true }).click();

  await expect(page.getByText("거래 분류 오버라이드를 저장했습니다. 아래 카테고리 집계와 캐시플로우는 자동으로 다시 계산됩니다.", { exact: true })).toBeVisible({ timeout: 30_000 });

  const initialTransferLabel = (await transferButton.textContent())?.trim() ?? "";
  const expectedTransferLabel = initialTransferLabel === "이체로 저장" ? "일반으로 저장" : "이체로 저장";
  await transferButton.click();

  await expect(page.getByText("이체 판정을 저장했습니다. 아래 카테고리 집계와 캐시플로우는 자동으로 다시 계산됩니다.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(transferButton).toHaveText(expectedTransferLabel, { timeout: 30_000 });
  await expect(page.getByTestId("v3-cashflow-table")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("v3-breakdown-table")).toBeVisible({ timeout: 30_000 });
});
