import { expect, test } from "./helpers/e2eTest";

test("product category deep-link redirects to catalog preset and preserves shelf summary", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("products_shelf_v1", JSON.stringify({
      schemaVersion: 1,
      favorites: ["fixture-favorite"],
      recentViewed: [],
      compareBasket: ["fixture-compare-a", "fixture-compare-b"],
    }));
  });

  await page.goto("/products/deposit?scan=all&maxPages=auto&q=%ED%85%8C%EC%8A%A4%ED%8A%B8&fav=1&sort=nameAsc&view=option&optSort=term_desc&optGroup=1&amount=5000000");

  await expect(page).toHaveURL(/\/products\/catalog\?kind=deposit/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "통합 상품 탐색" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("products_shelf_v1") ?? "")).toContain("fixture-compare-a");
  await expect(page.getByPlaceholder("은행명 또는 상품명으로 비교 후보를 좁혀 보세요")).toHaveValue("테스트", { timeout: 30_000 });
});
