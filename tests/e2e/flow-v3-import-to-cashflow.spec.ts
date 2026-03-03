import path from "node:path";
import { expect, test } from "@playwright/test";

test("planning v3 transactions uploads csv and opens batch detail", async ({ page }) => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "planning-v3-upload.sample.csv");

  await page.goto("/planning/v3/transactions");

  await page.getByTestId("v3-upload-input").setInputFiles(fixturePath);
  await page.getByTestId("v3-upload-submit").click();

  await expect(page).toHaveURL(/\/planning\/v3\/transactions\/batches\/[^/?#]+(?:\?.*)?$/, { timeout: 30_000 });
  await expect(page.getByTestId("v3-batch-meta")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("v3-batch-range")).toBeVisible({ timeout: 30_000 });
});
