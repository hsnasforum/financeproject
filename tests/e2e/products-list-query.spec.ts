import { expect, test } from "./helpers/e2eTest";

test("product list restores deep-link filters and shelf summary", async ({ page }) => {
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

  await expect(page.getByRole("heading", { name: "예금 상품" })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("products_shelf_v1") ?? "")).toContain("fixture-compare-a");
  await expect(page.getByPlaceholder("은행명 또는 상품명을 입력하세요")).toHaveValue("테스트", { timeout: 30_000 });
  await expect(page.getByLabel("즐겨찾기")).toBeChecked({ timeout: 30_000 });
  await expect(page.getByLabel("상품별 그룹화")).toBeChecked({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: /비교함/ })).toContainText("비교함 2", { timeout: 30_000 });
  await expect(page).toHaveURL(/scan=all/, { timeout: 30_000 });
  await expect(page).toHaveURL(/view=option/, { timeout: 30_000 });
  await expect(page).toHaveURL(/optGroup=1/, { timeout: 30_000 });
});
