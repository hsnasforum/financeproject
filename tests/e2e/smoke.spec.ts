import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/e2eTest";

const RECOMMEND_E2E_OWNER_ID = (process.env.PLANNING_E2E_USER_ID || "playwright-local").trim();
const RECOMMEND_E2E_SAVED_RUNS_KEY = `finance:recommend:v2:${encodeURIComponent(RECOMMEND_E2E_OWNER_ID)}:saved-runs`;

async function expectNoCspConsoleErrors(page: Page, routePath: string) {
  const violations: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Content Security Policy|Refused to (?:load|execute)/i.test(text)) {
      violations.push(text);
    }
  };
  const onPageError = (error: Error) => {
    const text = error.message ?? String(error);
    if (/Content Security Policy|Refused to (?:load|execute)/i.test(text)) {
      violations.push(text);
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  await page.goto(routePath);
  await page.waitForLoadState("networkidle");
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  expect(violations).toEqual([]);
}

async function mockRecommendResult(page: Page) {
  await page.route("**/api/recommend**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        meta: {
          kind: "deposit",
          topN: 5,
          rateMode: "max",
          candidatePool: "unified",
          candidateSources: ["finlife"],
          depositProtection: "prefer",
          userId: RECOMMEND_E2E_OWNER_ID,
          authSource: "trusted-header",
          weights: { rate: 0.5, term: 0.3, liquidity: 0.2 },
          assumptions: {
            rateSelectionPolicy: "최고금리는 우대조건 충족을 가정합니다.",
            liquidityPolicy: "중도해지 조건은 별도 확인합니다.",
            normalizationPolicy: "후보 안에서 점수를 정규화합니다.",
            depositProtectionPolicy: "예금자 보호 신호를 우선 확인합니다.",
          },
          fallback: { mode: "mock" },
        },
        items: [
          {
            unifiedId: "ignored-before-normalization",
            sourceId: "finlife",
            kind: "deposit",
            finPrdtCd: "E2E-D001",
            providerName: "검증은행",
            productName: "결과 패널 검증 예금",
            finalScore: 82.5,
            selectedOption: {
              saveTrm: "12",
              termMonths: 12,
              appliedRate: 3.5,
              baseRate: 3.1,
              maxRate: 3.5,
              rateSource: "intr_rate2",
              reasons: [],
            },
            breakdown: [],
            reasons: ["현재 비교 조건과 맞는 기간입니다."],
            signals: { depositProtection: "matched" },
          },
        ],
      }),
    });
  });
  await page.route("**/api/sources/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });
}

test("dashboard renders", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-root")).toBeVisible();
});

test("planning page renders", async ({ page }) => {
  await page.goto("/planning");
  await expect(page.getByRole("heading", { name: /플래닝 v2|Planning v2/i })).toBeVisible({ timeout: 30_000 });
});

test("recommend page renders", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByTestId("recommend-root")).toBeVisible();
  await expect(page.getByTestId("recommend-submit")).toBeVisible();
});

test("recommend result panel keeps the submit-to-detail flow", async ({ page }) => {
  await mockRecommendResult(page);

  await page.goto("/recommend");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("recommend-submit").click();

  await expect(page.getByTestId("recommend-results")).toBeVisible();
  await expect(page.getByRole("heading", { name: "결과 패널 검증 예금" })).toBeVisible();
  await page.getByRole("button", { name: "비교 담기" }).click();
  await expect(page.getByText("상품이 비교함에 담겼습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "결과 저장" }).click();
  await expect(page.getByText("결과가 히스토리에 저장되었습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상세 분석" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("recommend autorun reuses the saved history run for the same signature", async ({ page }) => {
  await mockRecommendResult(page);
  const autorunUrl = "/recommend?purpose=emergency&kind=deposit&preferredTerm=3&liquidityPref=high&rateMode=max&pool=unified&autorun=1&save=1&go=history";

  await page.goto(autorunUrl);
  await expect(page).toHaveURL(/\/recommend\/history\?open=run_/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "추천 비교 기록" })).toBeVisible();
  await expect(page.getByText("결과 패널 검증 예금").first()).toBeVisible();
  const firstRunId = new URL(page.url()).searchParams.get("open");
  expect(firstRunId).toMatch(/^run_/);
  expect(await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw).length : 0;
  }, RECOMMEND_E2E_SAVED_RUNS_KEY)).toBe(1);

  await page.goto(autorunUrl);
  await expect(page).toHaveURL(/\/recommend\/history\?open=run_/, { timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get("open")).toBe(firstRunId);
  expect(await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw).length : 0;
  }, RECOMMEND_E2E_SAVED_RUNS_KEY)).toBe(1);
});

test("dart page shows missing index guidance when index absent", async ({ page, request }) => {
  const statusResponse = await request.get("/api/public/disclosure/corpcodes/status");
  const statusJson = statusResponse.ok() ? await statusResponse.json() as { exists?: boolean } : null;
  const indexMissing = statusJson?.exists !== true;

  await page.goto("/public/dart");
  if (indexMissing) {
    await page.getByTestId("dart-search-input").fill("삼성");
    await page.getByTestId("dart-search-submit").click();
    await expect(page.getByTestId("dart-missing-index")).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByTestId("dart-search-input")).toBeVisible();
    await expect(page.getByTestId("dart-search-submit")).toBeVisible();
  }
});

test("production CSP routes hydrate without CSP console violations", async ({ page }) => {
  for (const routePath of ["/dashboard", "/planning", "/planning/reports", "/ops"]) {
    await expectNoCspConsoleErrors(page, routePath);
  }
});

test("production hides dev and debug surfaces", async ({ request }) => {
  test.skip(
    (process.env.E2E_WEB_SERVER_MODE ?? "development").trim().toLowerCase() !== "production",
    "production runtime only",
  );

  for (const routePath of ["/api/dev/errors/recent", "/dev/data", "/debug/unified", "/dashboard/artifacts"]) {
    const response = await request.get(routePath);
    expect(response.status(), routePath).toBe(404);
  }
});

test("main landmark stays singular across representative route shells", async ({ page }) => {
  for (const pathname of [
    "/",
    "/planning",
    "/products/compare",
    "/recommend/history",
    "/settings",
    "/ops",
    "/dev/data",
  ]) {
    await page.goto(pathname);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.locator("#main-content")).toHaveCount(1);
  }
});

test("skip link is the first keyboard stop and moves focus to main content", async ({ page }) => {
  await page.goto("/planning");
  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
  const main = page.locator("#main-content");

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(main).toBeFocused();

  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => {
    const mainElement = document.querySelector("#main-content");
    return Boolean(mainElement && document.activeElement && mainElement.contains(document.activeElement));
  })).toBe(true);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test(`mobile primary navigation owns ${viewport.width}x${viewport.height} without covering main content`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /플래닝 v2|Planning v2/i })).toBeVisible({ timeout: 30_000 });

    const nav = page.getByRole("navigation", { name: "모바일 주 메뉴" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("navigation", { name: "태블릿 주 메뉴" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "데스크톱 주 메뉴" })).toBeHidden();
    await expect(page.getByTestId("mobile-header-actions")).toBeHidden();
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("href", "/planning");

    const touchTargets = await nav.locator("a").evaluateAll((links) => links.map((link) => {
      const box = link.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    for (const target of touchTargets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const mainBox = await page.locator("body > main").boundingBox();
    const navBox = await nav.boundingBox();
    expect(mainBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect((mainBox?.y ?? 0) + (mainBox?.height ?? 0)).toBeLessThanOrEqual((navBox?.y ?? 0) + 1);
  });
}

test("tablet width hands primary navigation to the header strip", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/planning");

  await expect(page.getByTestId("mobile-bottom-nav-root")).toBeHidden();
  const tabletNav = page.getByRole("navigation", { name: "태블릿 주 메뉴" });
  await expect(tabletNav).toBeVisible();
  await expect(page.getByTestId("mobile-header-actions")).toBeVisible();
  await expect(tabletNav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(tabletNav.locator('a[aria-current="page"]')).toHaveAttribute("href", "/planning");
});

test("mobile active destination follows public route groups", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const item of [
    { pathname: "/planning", href: "/planning" },
    { pathname: "/public/dart", href: "/products" },
    { pathname: "/settings/backup", href: "/settings" },
  ]) {
    await page.goto(item.pathname);
    const nav = page.getByRole("navigation", { name: "모바일 주 메뉴" });
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute("href", item.href);
  }
});

test("ops and dev routes omit the mobile nav and its spacer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const pathname of ["/ops", "/dev/data", "/dashboard/artifacts"]) {
    await page.goto(pathname);
    await expect(page.getByTestId("mobile-bottom-nav-root")).toHaveCount(0);
    await expect(page.getByTestId("mobile-bottom-nav-spacer")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "데스크톱 주 메뉴" }).locator('[aria-current="page"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "태블릿 주 메뉴" }).locator('[aria-current="page"]')).toHaveCount(0);
  }
});
