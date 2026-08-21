import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/e2eTest";

const RECOMMEND_E2E_OWNER_ID = (process.env.PLANNING_E2E_USER_ID || "playwright-local").trim();
const RECOMMEND_E2E_SAVED_RUNS_KEY = `finance:recommend:v2:${encodeURIComponent(RECOMMEND_E2E_OWNER_ID)}:saved-runs`;
const RECOMMEND_E2E_PROFILE_KEY = `finance:recommend:v2:${encodeURIComponent(RECOMMEND_E2E_OWNER_ID)}:profile`;

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

type RecommendDetailOptionFixture = {
  save_trm: string;
  intr_rate: number;
  intr_rate2: number;
  raw: Record<string, unknown>;
};

type RecommendResultFixture = {
  selectedOption?: {
    detailOptionKey?: string;
    saveTrm: string;
    termMonths: number;
    appliedRate: number;
    baseRate: number;
    maxRate: number;
    rateSource: "intr_rate2" | "intr_rate";
    reasons: string[];
  };
  detailOptions?: RecommendDetailOptionFixture[];
};

async function mockRecommendResult(page: Page, fixture: RecommendResultFixture = {}) {
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
            selectedOption: fixture.selectedOption ?? {
              saveTrm: "12",
              termMonths: 12,
              appliedRate: 3.5,
              baseRate: 3.1,
              maxRate: 3.5,
              rateSource: "intr_rate2",
              reasons: [],
            },
            detailProduct: {
              fin_prdt_cd: "E2E-D001",
              kor_co_nm: "검증은행",
              fin_prdt_nm: "결과 패널 검증 예금",
              options: fixture.detailOptions ?? [
                {
                  save_trm: "6",
                  intr_rate: 2.7,
                  intr_rate2: 3,
                  raw: { intr_rate_type_nm: "단리" },
                },
                {
                  save_trm: "12",
                  intr_rate: 3.1,
                  intr_rate2: 3.5,
                  raw: { intr_rate_type_nm: "복리" },
                },
              ],
              raw: { join_way: "비대면-LONGOPTIONIDENTITYWITHOUTBREAKS0123456789012345678901234567890123456789" },
              sourceUpdatedAt: "2026-07-11T00:00:00.000Z",
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

test("public page titles resolve through the active Next.js metadata hierarchy", async ({ page }) => {
  for (const [pathname, title] of [
    ["/", "개인 재무진단과 금융상품 비교 | MMD"],
    ["/dashboard", "재무 대시보드 | MMD"],
    ["/recommend/history", "추천 비교 기록 | MMD"],
  ] as const) {
    await page.goto(pathname);
    await expect(page).toHaveTitle(title);
  }
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

test("legacy recommend state waits for confirmation before owner migration", async ({ page }) => {
  const legacyProfile = {
    purpose: "emergency",
    kind: "deposit",
    preferredTerm: 3,
    liquidityPref: "high",
    rateMode: "max",
    topN: 3,
    candidatePool: "unified",
    candidateSources: ["finlife"],
    depositProtection: "any",
    weights: { rate: 0.6, term: 0.25, liquidity: 0.15 },
  };
  await page.addInitScript((profile) => {
    const seededKey = "recommend-legacy-e2e-seeded";
    if (sessionStorage.getItem(seededKey) === "1") return;
    localStorage.setItem("recommend_profile_v1", JSON.stringify(profile));
    sessionStorage.setItem(seededKey, "1");
  }, legacyProfile);

  await page.goto("/recommend");
  await expect(page.getByTestId("recommend-legacy-migration")).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), RECOMMEND_E2E_PROFILE_KEY)).toBeNull();

  await page.getByRole("button", { name: "현재 계정으로 가져오기" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("recommend-legacy-migration")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("recommend_profile_v1"))).toBeNull();
  expect(await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, RECOMMEND_E2E_PROFILE_KEY)).toMatchObject({
    version: 2,
    ownerId: RECOMMEND_E2E_OWNER_ID,
    profile: { purpose: "emergency", preferredTerm: 3 },
  });
});

test("partial legacy recommend migration reloads owner state before persistence resumes", async ({ page }) => {
  const legacyProfile = {
    purpose: "emergency",
    kind: "deposit",
    preferredTerm: 3,
    liquidityPref: "high",
    rateMode: "max",
    topN: 3,
    candidatePool: "unified",
    candidateSources: ["finlife"],
    depositProtection: "any",
    weights: { rate: 0.6, term: 0.25, liquidity: 0.15 },
  };
  await page.addInitScript((profile) => {
    const seededKey = "recommend-legacy-partial-e2e-seeded";
    if (sessionStorage.getItem(seededKey) === "1") return;
    localStorage.setItem("recommend_profile_v1", JSON.stringify(profile));
    localStorage.setItem("recommend_last_result_v1", "{broken");
    sessionStorage.setItem(seededKey, "1");
  }, legacyProfile);

  await page.goto("/recommend");
  await page.getByRole("button", { name: "현재 계정으로 가져오기" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("recommend-legacy-migration")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("recommend_last_result_v1"))).toBe("{broken");
  expect(await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, RECOMMEND_E2E_PROFILE_KEY)).toMatchObject({
    version: 2,
    ownerId: RECOMMEND_E2E_OWNER_ID,
    profile: { purpose: "emergency", preferredTerm: 3 },
  });
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

test("I-026 same-term options expose distinct names and calculation bases", async ({ page }) => {
  await mockRecommendResult(page, {
    selectedOption: {
      detailOptionKey: JSON.stringify({
        term: "12",
        baseRate: 3,
        primeRate: 3.4,
        identity: [["intr_rate_type_nm", "복리"]],
      }),
      saveTrm: "12",
      termMonths: 12,
      appliedRate: 3.4,
      baseRate: 3,
      maxRate: 3.4,
      rateSource: "intr_rate2",
      reasons: [],
    },
    detailOptions: [
      { save_trm: "12", intr_rate: 2.8, intr_rate2: 3.1, raw: { intr_rate_type_nm: "단리" } },
      { save_trm: "12", intr_rate: 3, intr_rate2: 3.4, raw: { intr_rate_type_nm: "복리" } },
    ],
  });
  await page.goto("/recommend");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("recommend-submit").click();
  await page.getByRole("button", { name: "상세 분석" }).click();

  const dialog = page.getByRole("dialog", { name: "결과 패널 검증 예금" });
  const simple = dialog.getByRole("button", {
    name: "12개월 · 단리 · 최고금리(연, 우대포함) 3.1%",
    exact: true,
  });
  const compound = dialog.getByRole("button", {
    name: "12개월 · 복리 · 최고금리(연, 우대포함) 3.4%",
    exact: true,
  });
  const calculator = dialog.locator("[data-selected-option-rate]");

  await expect(compound).toHaveAttribute("aria-pressed", "true");
  await expect(calculator).toHaveAttribute("data-selected-option-rate", "3.4");
  await simple.click();
  await expect(simple).toHaveAttribute("aria-pressed", "true");
  await expect(calculator).toHaveAttribute("data-selected-option-rate", "3.1");
});

test("I-026 recommendation detail keeps selected option identity and calculation fidelity", async ({ page }) => {
  await mockRecommendResult(page);
  await page.goto("/recommend");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("recommend-submit").click();
  await page.getByRole("button", { name: "상세 분석" }).click();

  const dialog = page.getByRole("dialog", { name: "결과 패널 검증 예금" });
  const sixMonths = dialog.getByRole("button", { name: "6개월", exact: true });
  const twelveMonths = dialog.getByRole("button", { name: "12개월", exact: true });
  const calculator = dialog.locator("[data-selected-option-term]");

  await expect(sixMonths).toHaveAttribute("aria-pressed", "false");
  await expect(twelveMonths).toHaveAttribute("aria-pressed", "true");
  await expect(calculator).toHaveAttribute("data-selected-option-term", "12");
  await expect(calculator).toHaveAttribute("data-selected-option-rate", "3.5");
  const twelveMonthMaturity = await dialog.getByText("예상 수령액", { exact: true }).locator("..").innerText();

  await sixMonths.click();
  await expect(sixMonths).toHaveAttribute("aria-pressed", "true");
  await expect(twelveMonths).toHaveAttribute("aria-pressed", "false");
  await expect(calculator).toHaveAttribute("data-selected-option-term", "6");
  await expect(calculator).toHaveAttribute("data-selected-option-rate", "3");
  const sixMonthMaturity = await dialog.getByText("예상 수령액", { exact: true }).locator("..").innerText();
  expect(sixMonthMaturity).not.toBe(twelveMonthMaturity);
});

test("I-021 product detail keeps mobile cards and desktop table in responsive parity", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockRecommendResult(page);
  await page.goto("/recommend");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("recommend-submit").click();
  await page.getByRole("button", { name: "상세 분석" }).click();

  const dialog = page.getByRole("dialog", { name: "결과 패널 검증 예금" });
  const mobileList = dialog.locator("[data-option-mobile-list]");
  const mobileCards = dialog.locator("[data-option-mobile-card]");
  const desktopTable = dialog.locator("[data-option-desktop-table]");
  const desktopScroll = dialog.locator("[data-option-desktop-scroll]");
  const expectedFieldOrder = [
    "기간", "이자 방식", "기본금리(연)", "최고금리(연, 우대포함)",
    "기간", "이자 방식", "기본금리(연)", "최고금리(연, 우대포함)",
  ];

  await expect(dialog.locator('[data-option-mobile-card][data-selected="true"]')).toContainText("12개월");
  const mobileFieldPairs = await mobileList.locator("[data-option-field]").evaluateAll((fields) => fields.map((field) => ({
    label: field.getAttribute("data-option-field"),
    value: field.getAttribute("data-option-value"),
  })));
  expect(mobileFieldPairs.map(({ label }) => label)).toEqual(expectedFieldOrder);

  await dialog.getByRole("button", { name: "6개월", exact: true }).click();
  await expect(dialog.locator('[data-option-mobile-card][data-selected="true"]')).toContainText("6개월");
  await expect(dialog.locator("[data-selected-option-term]")).toHaveAttribute("data-selected-option-term", "6");
  await expect(dialog.locator("[data-selected-option-term]")).toHaveAttribute("data-selected-option-rate", "3");

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(mobileList).toBeVisible();
    await expect(desktopTable).toBeHidden();
    await expect(mobileCards).toHaveCount(2);
    expect(await mobileCards.evaluateAll((cards) => cards.every((card) => card.scrollWidth <= card.clientWidth + 1))).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }

  for (const viewport of [{ width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect(mobileList).toBeHidden();
    await expect(desktopTable).toBeVisible();
    await expect(desktopTable.locator('tbody tr[data-selected="true"]')).toContainText("6개월");
    const desktopFieldPairs = await desktopTable.locator("[data-option-field]").evaluateAll((fields) => fields.map((field) => ({
      label: field.getAttribute("data-option-field"),
      value: field.getAttribute("data-option-value"),
    })));
    expect(desktopFieldPairs).toEqual(mobileFieldPairs);
    expect(await desktopScroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
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

test("standalone diagnostics endpoint stays unavailable", async ({ request }) => {
  const requestHeaders: Array<Record<string, string>> = [
    {},
    { cookie: "authjs.session-token=invalid-test-session" },
  ];
  for (const headers of requestHeaders) {
    const response = await request.get("/api/diagnostics/snapshot", { headers });
    const body = await response.text();

    expect(response.status()).toBe(404);
    expect(body).not.toContain("recentErrors");
    expect(body).not.toContain("dartArtifacts");
  }
});

test("production hides dev and debug surfaces", async ({ request }) => {
  test.skip(
    (process.env.E2E_WEB_SERVER_MODE ?? "development").trim().toLowerCase() !== "production",
    "production runtime only",
  );

  for (const routePath of [
    "/api/dev/errors/recent",
    "/api/diagnostics/snapshot",
    "/dev/data",
    "/debug/unified",
    "/dashboard/artifacts",
  ]) {
    const response = await request.get(routePath);
    expect(response.status(), routePath).toBe(404);
  }
});

test("main landmark stays singular across representative route shells", async ({ page }) => {
  test.slow();
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
