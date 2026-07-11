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

test("specialized product list applies the pure result pipeline to query filters", async ({ page }) => {
  await page.route("**/api/finlife/pension?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mode: "live",
        meta: {
          kind: "pension",
          pageNo: 1,
          topFinGrpNo: "020000",
          fallbackUsed: false,
          hasNext: false,
          totalProducts: 2,
          totalOptions: 2,
        },
        data: [
          {
            fin_prdt_cd: "PENSION-A",
            fin_co_no: "0010001",
            kor_co_nm: "검증금융",
            fin_prdt_nm: "알파 연금",
            options: [{ save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: {} }],
            best: { save_trm: "12", intr_rate: 3, intr_rate2: 3.4 },
            raw: {},
          },
          {
            fin_prdt_cd: "PENSION-C",
            fin_co_no: "0010002",
            kor_co_nm: "확인금융",
            fin_prdt_nm: "감마 연금",
            options: [{ save_trm: "24", intr_rate: 2.9, intr_rate2: 3.3, raw: {} }],
            best: { save_trm: "24", intr_rate: 2.9, intr_rate2: 3.3 },
            raw: {},
          },
        ],
      }),
    });
  });

  await page.goto("/products/pension?q=%EA%B0%90%EB%A7%88&sort=nameAsc");

  await expect(page.getByRole("heading", { name: "연금저축 상품" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder("은행명 또는 상품명을 입력하세요")).toHaveValue("감마");
  await expect(page.getByRole("heading", { name: "감마 연금" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "알파 연금" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/products\/pension\?.*q=%EA%B0%90%EB%A7%88/);
});

test("specialized product list ignores a superseded FINLIFE response", async ({ page }) => {
  let releaseInitialResponse: (() => void) | undefined;
  const initialResponseGate = new Promise<void>((resolve) => {
    releaseInitialResponse = resolve;
  });
  let markInitialRequestStarted: (() => void) | undefined;
  const initialRequestStarted = new Promise<void>((resolve) => {
    markInitialRequestStarted = resolve;
  });
  let initialRequests = 0;
  let settledInitialRequests = 0;
  let browserSettledInitialRequests = 0;

  const markInitialBrowserRequestSettled = (requestUrl: string) => {
    const url = new URL(requestUrl);
    if (
      url.pathname === "/api/finlife/pension"
      && url.searchParams.get("topFinGrpNo") === "020000"
    ) {
      browserSettledInitialRequests += 1;
    }
  };
  page.on("requestfinished", (request) => markInitialBrowserRequestSettled(request.url()));
  page.on("requestfailed", (request) => markInitialBrowserRequestSettled(request.url()));

  await page.route("**/api/finlife/pension?**", async (route) => {
    const url = new URL(route.request().url());
    const topFinGrpNo = url.searchParams.get("topFinGrpNo") ?? "";
    const isInitialRequest = topFinGrpNo === "020000";
    if (isInitialRequest) {
      initialRequests += 1;
      markInitialRequestStarted?.();
      await initialResponseGate;
    }

    const latest = !isInitialRequest;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mode: "live",
          meta: {
            kind: "pension",
            pageNo: 1,
            topFinGrpNo,
            fallbackUsed: false,
            hasNext: false,
            totalProducts: 1,
            totalOptions: 1,
          },
          data: [
            {
              fin_prdt_cd: latest ? "PENSION-LATEST" : "PENSION-STALE",
              fin_co_no: latest ? "0010002" : "0010001",
              kor_co_nm: latest ? "최신금융" : "이전금융",
              fin_prdt_nm: latest ? "최신 연금" : "이전 연금",
              options: [{ save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: {} }],
              best: { save_trm: "12", intr_rate: 3, intr_rate2: 3.4 },
              raw: {},
            },
          ],
        }),
      });
    } finally {
      if (isInitialRequest) settledInitialRequests += 1;
    }
  });

  await page.goto("/products/pension");
  await initialRequestStarted;
  await page.getByRole("button", { name: "저축은행", exact: true }).click();

  await expect(page.getByRole("heading", { name: "최신 연금" })).toBeVisible({ timeout: 30_000 });
  releaseInitialResponse?.();
  await expect.poll(() => settledInitialRequests).toBe(initialRequests);
  await expect.poll(() => browserSettledInitialRequests).toBe(initialRequests);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect(page.getByRole("heading", { name: "이전 연금" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "최신 연금" })).toBeVisible();
});
