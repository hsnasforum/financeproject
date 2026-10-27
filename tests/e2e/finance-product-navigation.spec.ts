import { recommendOwnerId, recommendOwnerStorageKey } from "../../src/lib/recommend/ownerNamespace";
import { expect, test } from "./helpers/e2eTest";

type Owner = { userId: string; authSource: string };

async function readOwner(page: import("@playwright/test").Page): Promise<Owner> {
  const response = await page.evaluate(async () => {
    const res = await fetch("/api/planning/v2/profiles");
    return { status: res.status, payload: await res.json() };
  });
  expect(response.status).toBe(200);
  return (response.payload as { meta: Owner }).meta;
}

// UI navigation fixture only: the recommend API answer is fixed so the test is about history entries.
function recommendFixture(owner: Owner, kind: "deposit" | "saving") {
  return {
    ok: true,
    meta: {
      userId: owner.userId,
      authSource: owner.authSource,
      kind,
      topN: 5,
      rateMode: "max",
      candidatePool: "unified",
      candidateSources: ["finlife"],
      depositProtection: "any",
      weights: { rate: 0.6, term: 0.25, liquidity: 0.15 },
      weightNormalization: { applied: false, originalSum: 1, reason: "none" },
      assumptions: { rateSelectionPolicy: "테스트", liquidityPolicy: "테스트", normalizationPolicy: "테스트" },
    },
    items: [{
      unifiedId: "finlife:NAV-1",
      sourceId: "finlife",
      kind,
      finPrdtCd: "NAV-1",
      providerName: "탐색은행",
      productName: "탐색예금",
      finalScore: 0.8,
      selectedOption: { saveTrm: "3", termMonths: 3, appliedRate: 3.1, baseRate: 3, maxRate: 3.1, rateSource: "intr_rate2", reasons: [] },
      breakdown: [{ key: "rate", label: "금리", raw: 1, weight: 0.6, contribution: 0.6, reason: "테스트" }],
      reasons: ["탐색 테스트"],
    }],
  };
}

function recommendItems(kind: "deposit" | "saving", count: number) {
  return Array.from({ length: count }, (_, index) => ({
    unifiedId: `finlife:NAV-${index + 1}`,
    sourceId: "finlife",
    kind,
    finPrdtCd: `NAV-${index + 1}`,
    providerName: "탐색은행",
    productName: `탐색예금 ${index + 1}호`,
    finalScore: 0.8 - index * 0.05,
    selectedOption: { saveTrm: "12", termMonths: 12, appliedRate: 3.1, baseRate: 3, maxRate: 3.1, rateSource: "intr_rate2", reasons: [] },
    breakdown: [{ key: "rate", label: "금리", raw: 1, weight: 0.6, contribution: 0.6, reason: "테스트" }],
    reasons: ["탐색 테스트"],
  }));
}

test("a stale plan without a stored snapshot sends the user to review conditions instead of a failing rerun", async ({ page, request, baseURL }) => {
  const userId = `nav-stale-${Date.now()}`;
  const headers = { origin: baseURL!, referer: `${baseURL}/planning`, "x-planning-user-id": userId };
  await page.setExtraHTTPHeaders({ "x-planning-user-id": userId });
  await page.goto("/dashboard");
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const profile = { monthlyIncomeNet: 5_000_000, monthlyEssentialExpenses: 2_000_000, monthlyDiscretionaryExpenses: 500_000,
    liquidAssets: 5_000_000, investmentAssets: 0, debts: [], goals: [] };
  const created = await request.post("/api/planning/v2/profiles", { headers, data: { name: "탐색 프로필", profile, csrf } });
  expect(created.ok()).toBeTruthy();
  const profileId = (await created.json()).data.id as string;
  // No snapshotId: the run is not pinned to a stored snapshot (the sandbox has no latest snapshot either).
  const run = await request.post("/api/planning/v2/runs", { headers, data: { csrf, profileId, input: {
    horizonMonths: 24, runScenarios: false, getActions: false, analyzeDebt: false,
  } } });
  expect(run.ok()).toBeTruthy();
  const runData = (await run.json()).data as { id: string; input?: { snapshotId?: string } };
  expect(runData.input?.snapshotId ?? "").toBe("");
  expect((await request.patch(`/api/planning/v2/profiles/${profileId}`, { headers, data: { csrf, profile: { ...profile, monthlyIncomeNet: 6_000_000 } } })).ok()).toBeTruthy();

  const posts: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/planning/v2/runs") posts.push(req.url());
  });
  await page.goto(`/dashboard?profileId=${encodeURIComponent(profileId)}`);
  const plan = page.getByTestId("dashboard-current-plan");
  await expect(plan).toHaveAttribute("data-state", "stale");
  await expect(page.getByRole("button", { name: "현재 프로필로 다시 계산" })).toHaveCount(0);
  await expect(plan).toContainText("계산 기준 자료가 고정되어 있지 않아");
  const review = plan.getByRole("link", { name: "계산 조건 검토 후 다시 계산", exact: true });
  await expect(review).toHaveAttribute("href", `/planning?profileId=${profileId}`);
  await review.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/planning\\?profileId=${profileId}$`), { timeout: 30_000 });
  expect(posts).toEqual([]);
});

test("recommend compare notice shows the count, link, replaced name and duplicate state", async ({ page }) => {
  await page.goto("/recommend");
  const owner = await readOwner(page);
  await page.route(/\/api\/recommend(?:\?|$)/, async (route) => {
    await route.fulfill({ json: { ...recommendFixture(owner, "deposit"), items: recommendItems("deposit", 5) } });
  });
  await page.evaluate(() => ["products_shelf_v1", "products_compare_ids_v1"].forEach((key) => window.localStorage.removeItem(key)));
  await page.reload();
  await page.getByTestId("recommend-submit").click();
  await expect(page.getByTestId("recommend-results")).toBeVisible();
  const addButtons = page.getByRole("button", { name: "비교 담기" });
  const notice = page.getByTestId("compare-add-notice");

  await addButtons.nth(0).click();
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice).toHaveAttribute("aria-live", "polite");
  await expect(notice).toContainText("상품이 비교함에 담겼습니다.");
  await expect(notice).toContainText("현재 비교함 1/4개입니다.");
  for (let index = 1; index < 4; index += 1) await addButtons.nth(index).click();
  await expect(notice).toContainText("현재 비교함 4/4개입니다.");

  await addButtons.nth(4).click();
  await expect(notice).toHaveAttribute("data-compare-status", "replaced");
  await expect(notice).toContainText("먼저 담은 탐색예금 1호을(를) 빼고 새 상품을 담았습니다.");
  await expect(notice).toContainText("현재 비교함 4/4개입니다.");

  await addButtons.nth(4).click();
  await expect(notice).toHaveAttribute("data-compare-status", "duplicate");
  await expect(notice).toContainText("이미 비교함에 있는 상품입니다.");

  // The notice does not disappear on a timer, so the link is still reachable by keyboard later.
  await page.waitForTimeout(4_000);
  await expect(notice).toBeVisible();
  const link = notice.getByRole("link", { name: "비교함에서 나란히 보기" });
  await link.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/products\/compare$/, { timeout: 30_000 });
});

test("catalog compare notice links to the compare page and fits a 390px screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/api\/products\/unified\?/, async (route) => {
    await route.fulfill({ json: {
      ok: true,
      data: {
        items: Array.from({ length: 5 }, (_, index) => ({
          stableId: `nav-stable-${index + 1}`, sourceId: "finlife", kind: "deposit", externalKey: `nav-${index + 1}`,
          providerName: "탐색은행", productName: `탐색카탈로그 ${index + 1}호`,
          options: [{ termMonths: 12, intrRate: 3, intrRate2: 3.1 }],
        })),
        pageInfo: { hasMore: false, nextCursor: null, limit: 20 },
        facets: { providers: ["탐색은행"] },
      },
      meta: { generatedAt: new Date().toISOString() },
    } });
  });
  await page.goto("/products/catalog");
  await page.evaluate(() => ["products_shelf_v1", "products_compare_ids_v1"].forEach((key) => window.localStorage.removeItem(key)));
  await page.reload();
  const addButtons = page.getByRole("button", { name: "비교 후보 담기" });
  await expect(addButtons).toHaveCount(5);
  // Keyboard adds: at 390px the sticky header/filter bar can cover a card button for pointer clicks.
  for (let index = 0; index < 5; index += 1) {
    await addButtons.nth(index).focus();
    await page.keyboard.press("Enter");
  }
  const notice = page.getByTestId("compare-add-notice");
  await expect(notice).toHaveAttribute("role", "status");
  await expect(notice).toHaveAttribute("aria-live", "polite");
  await expect(notice).toHaveAttribute("data-compare-status", "replaced");
  await expect(notice).toContainText("먼저 담은 탐색카탈로그 1호을(를) 빼고 새 상품을 담았습니다.");
  await expect(notice).toContainText("현재 비교함 4/4개입니다.");
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  const linkBox = await notice.getByRole("link", { name: "비교함에서 나란히 보기" }).boundingBox();
  expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await notice.getByRole("link", { name: "비교함에서 나란히 보기" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/products\/compare$/, { timeout: 30_000 });
});

type Locator = import("@playwright/test").Locator;
type Page = import("@playwright/test").Page;

// Scrolls with wheel input (like a user) until the target sits near the middle of the screen.
async function scrollToMiddle(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const box = await target.boundingBox();
    if (!box) throw new Error("target has no box");
    const viewport = page.viewportSize()!;
    const delta = box.y + box.height / 2 - viewport.height / 2;
    if (Math.abs(delta) < 40) return box;
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(150);
  }
  return (await target.boundingBox())!;
}

// Taps the centre of the target with a touch event after checking nothing else is on top of it.
async function tapUncovered(page: Page, target: Locator) {
  const box = await scrollToMiddle(page, target);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const onTop = await target.evaluate((el, point) => {
    const top = document.elementFromPoint(point.x, point.y);
    return Boolean(top && (top === el || el.contains(top)));
  }, { x, y });
  expect(onTop, "the control must not be covered at its centre").toBe(true);
  await page.touchscreen.tap(x, y);
}

async function expectInViewport(page: Page, target: Locator) {
  const box = await target.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, "notice must be rendered").not.toBeNull();
  expect(box!.y + box!.height).toBeGreaterThan(0);
  expect(box!.y).toBeLessThan(viewport.height);
}

test.describe("390x844 touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("catalog cards stay tappable below the filter panel and the notice appears where the user tapped", async ({ page }) => {
    await page.route(/\/api\/products\/unified\?/, async (route) => {
      await route.fulfill({ json: {
        ok: true,
        data: {
          items: Array.from({ length: 5 }, (_, index) => ({
            stableId: `nav-touch-${index + 1}`, sourceId: "finlife", kind: "deposit", externalKey: `nav-touch-${index + 1}`,
            providerName: "탐색은행", productName: `탐색터치 ${index + 1}호`,
            options: [{ termMonths: 12, intrRate: 3, intrRate2: 3.1 }],
          })),
          pageInfo: { hasMore: false, nextCursor: null, limit: 20 },
          facets: { providers: ["탐색은행"] },
        },
        meta: { generatedAt: new Date().toISOString() },
      } });
    });
    await page.goto("/products/catalog");
    await page.evaluate(() => ["products_shelf_v1", "products_compare_ids_v1"].forEach((key) => window.localStorage.removeItem(key)));
    await page.reload();
    const addButtons = page.getByRole("button", { name: "비교 후보 담기" });
    await expect(addButtons).toHaveCount(5);
    const notice = page.getByTestId("compare-add-notice");

    // First, middle and last cards, then the rest; the fifth add replaces the oldest.
    for (const [step, index] of [0, 2, 4, 1, 3].entries()) {
      await tapUncovered(page, addButtons.nth(index));
      await expect(notice).toBeVisible();
      await expectInViewport(page, notice);
      await expect(notice).toContainText(`현재 비교함 ${Math.min(step + 1, 4)}/4개입니다.`);
    }
    await expect(notice).toHaveAttribute("data-compare-status", "replaced");
    await expect(notice).toContainText("먼저 담은 탐색터치 1호을(를) 빼고 새 상품을 담았습니다.");
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

    await tapUncovered(page, notice.getByRole("link", { name: "비교함에서 나란히 보기" }));
    await page.waitForURL(/\/products\/compare$/, { timeout: 30_000 });
  });

  test("recommend compare taps show the notice in view and reach the compare page", async ({ page }) => {
    await page.goto("/recommend");
    const owner = await readOwner(page);
    await page.route(/\/api\/recommend(?:\?|$)/, async (route) => {
      const items = recommendItems("deposit", 5);
      items[0] = { ...items[0], productName: "아주 긴 이름을 가진 탐색용 정기예금 상품 특판 우대금리 비대면 전용 플러스" };
      await route.fulfill({ json: { ...recommendFixture(owner, "deposit"), items } });
    });
    await page.evaluate(() => ["products_shelf_v1", "products_compare_ids_v1"].forEach((key) => window.localStorage.removeItem(key)));
    await page.reload();
    await tapUncovered(page, page.getByTestId("recommend-submit"));
    await expect(page.getByTestId("recommend-results")).toBeVisible();
    const addButtons = page.getByRole("button", { name: "비교 담기" });
    const notice = page.getByTestId("compare-add-notice");
    for (const [step, index] of [0, 2, 4].entries()) {
      await tapUncovered(page, addButtons.nth(index));
      await expect(notice).toBeVisible();
      await expectInViewport(page, notice);
      await expect(notice).toContainText(`현재 비교함 ${step + 1}/4개입니다.`);
    }
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
    const link = notice.getByRole("link", { name: "비교함에서 나란히 보기" });
    expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await tapUncovered(page, link);
    await page.waitForURL(/\/products\/compare$/, { timeout: 30_000 });
  });
});

test("an autorun save that opens history does not trap the Back button", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("dashboard-root")).toBeVisible();
  const owner = await readOwner(page);
  let recommendCalls = 0;
  await page.route(/\/api\/recommend(?:\?|$)/, async (route) => {
    recommendCalls += 1;
    await route.fulfill({ json: recommendFixture(owner, "deposit") });
  });

  // Same link the saved report's action uses (plannerActionLinks: emergency fund).
  await page.goto("/recommend?purpose=emergency&kind=deposit&preferredTerm=3&liquidityPref=high&rateMode=max&pool=unified&autorun=1&save=1&go=history");
  await page.waitForURL(/\/recommend\/history\?open=/, { timeout: 30_000 });
  const savedRunsKey = recommendOwnerStorageKey(recommendOwnerId(owner.userId), "saved-runs");
  const savedCount = async () => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    return Array.isArray(parsed) ? parsed.length : -1;
  }, savedRunsKey);
  expect(await savedCount()).toBe(1);

  await page.goBack();
  // Back from history must leave the autorun flow instead of re-running it and pushing history again.
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByTestId("dashboard-root")).toBeVisible();
  expect(await savedCount()).toBe(1);
  expect(recommendCalls).toBe(1);
});

// Compare remove control. The products below are synthetic test fixtures (e2e-cmp-*), answered by a page route;
// nothing is fetched from a real product source.

// The four existing compare tests above end on /products/compare, which then loads every basket id from the item
// API. Their own mocks cover only the recommend and catalog lists, so the item answers for exactly the ids each of
// those bodies can add are synthetic as well. The hook is keyed by exact title and does nothing for other tests.
function numberedItems(prefix: string, label: string, numbers: number[]): Array<[string, string]> {
  return numbers.map((n): [string, string] => [`${prefix}${n}`, `${label} ${n}호`]);
}

const NAV_COMPARE_ITEMS = new Map<string, ReadonlyMap<string, string>>([
  ["recommend compare notice shows the count, link, replaced name and duplicate state",
    new Map(numberedItems("finlife:NAV-", "탐색예금", [1, 2, 3, 4, 5]))],
  ["catalog compare notice links to the compare page and fits a 390px screen",
    new Map(numberedItems("nav-stable-", "탐색카탈로그", [1, 2, 3, 4, 5]))],
  ["catalog cards stay tappable below the filter panel and the notice appears where the user tapped",
    new Map(numberedItems("nav-touch-", "탐색터치", [1, 2, 3, 4, 5]))],
  ["recommend compare taps show the notice in view and reach the compare page",
    new Map<string, string>([
      ["finlife:NAV-1", "아주 긴 이름을 가진 탐색용 정기예금 상품 특판 우대금리 비대면 전용 플러스"],
      ["finlife:NAV-3", "탐색예금 3호"],
      ["finlife:NAV-5", "탐색예금 5호"],
    ])],
]);

const ITEM_API = /\/api\/products\/unified\/item\?/;
const UNKNOWN_ITEM = { ok: false, error: { code: "NO_DATA", message: "합성 fixture 없음" } };

function syntheticItemResponse(id: string, productName: string, providerName: string) {
  return {
    ok: true,
    data: {
      item: {
        stableId: id, sourceId: "finlife", kind: "deposit", providerName, productName,
        options: [{ termMonths: 12, intrRate: 3, intrRate2: 3.1 }],
      },
    },
    meta: { generatedAt: "2026-10-24T00:00:00.000Z" },
  };
}

// Known ids get a synthetic item; any other id gets a synthetic 404, never a real lookup.
async function answerItems(page: Page, items: ReadonlyMap<string, string>, providerName: string) {
  await page.route(ITEM_API, async (route) => {
    const id = new URL(route.request().url()).searchParams.get("id") ?? "";
    const productName = items.get(id);
    if (productName === undefined) {
      await route.fulfill({ status: 404, json: UNKNOWN_ITEM });
      return;
    }
    await route.fulfill({ json: syntheticItemResponse(id, productName, providerName) });
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  const items = NAV_COMPARE_ITEMS.get(testInfo.title);
  if (items) await answerItems(page, items, "탐색은행");
});

const COMPARE_SHELF_KEY = "products_shelf_v1";
const COMPARE_LEGACY_KEY = "products_compare_ids_v1";
const SYNTHETIC_COMPARE = new Map(numberedItems("e2e-cmp-", "합성비교", [1, 2, 3, 4]));

function cmpId(n: number): string {
  return `e2e-cmp-${n}`;
}

function cmpName(n: number): string {
  return `합성비교 ${n}호`;
}

type CompareSession = { itemRequests: string[]; otherApiRequests: string[] };

function compareCount(page: Page) {
  return page.getByText("비교 중인 후보", { exact: true }).locator("xpath=following-sibling::span[1]");
}

// Column 0 is the axis label; product columns follow in basket order.
function desktopRemoveControl(page: Page, column: number) {
  return page.locator("table thead th").nth(column).locator("button");
}

function namedRemoveControl(page: Page, n: number) {
  return page.getByRole("button", { name: `${cmpName(n)} 비교함에서 빼기`, exact: true });
}

function controlOpacity(control: Locator) {
  return control.evaluate((element) => getComputedStyle(element).opacity);
}

// The page shows exactly these products and this count, and asked the item API for exactly these ids.
async function expectBasketShown(page: Page, session: CompareSession, numbers: number[]) {
  await expect(compareCount(page)).toHaveText(`${numbers.length} / 4`);
  for (const n of [1, 2, 3, 4]) {
    await expect(page.getByRole("heading", { name: cmpName(n), exact: true })).toHaveCount(numbers.includes(n) ? 1 : 0);
  }
  await expect.poll(() => [...new Set(session.itemRequests)].sort()).toEqual(numbers.map(cmpId).sort());
}

async function readCompareStorage(page: Page) {
  return page.evaluate(({ shelfKey, legacyKey }) => {
    const read = (key: string): unknown => {
      const raw = window.localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    };
    return { shelf: read(shelfKey), legacy: read(legacyKey) };
  }, { shelfKey: COMPARE_SHELF_KEY, legacyKey: COMPARE_LEGACY_KEY });
}

// Both storage keys hold the basket in order; favorites and recently viewed are kept as seeded.
async function expectStoredBasket(page: Page, numbers: number[]) {
  const ids = numbers.map(cmpId);
  expect(await readCompareStorage(page)).toEqual({
    shelf: { schemaVersion: 1, favorites: ["e2e-fav"], recentViewed: ["e2e-recent"], compareBasket: ids },
    legacy: ids,
  });
}

async function expectRemoved(page: Page, session: CompareSession, remaining: number[]) {
  await expectBasketShown(page, session, remaining);
  await expectStoredBasket(page, remaining);
}

async function expectBasketSurvivesReload(page: Page, session: CompareSession, remaining: number[]) {
  session.itemRequests.length = 0;
  await page.reload();
  await expectRemoved(page, session, remaining);
}

// Records API traffic, answers the synthetic items, seeds the basket once (no init script, so a reload keeps what
// the page itself stored) and reloads.
async function openSeededCompare(page: Page, numbers: number[]): Promise<CompareSession> {
  const session: CompareSession = { itemRequests: [], otherApiRequests: [] };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    if (url.pathname === "/api/products/unified/item") session.itemRequests.push(url.searchParams.get("id") ?? "");
    else session.otherApiRequests.push(`${request.method()} ${url.pathname}`);
  });
  await answerItems(page, SYNTHETIC_COMPARE, "합성은행");
  await page.goto("/products/compare");
  await page.evaluate(({ shelfKey, legacyKey, ids }) => {
    window.localStorage.setItem(shelfKey, JSON.stringify({
      schemaVersion: 1, favorites: ["e2e-fav"], recentViewed: ["e2e-recent"], compareBasket: ids,
    }));
    window.localStorage.removeItem(legacyKey);
  }, { shelfKey: COMPARE_SHELF_KEY, legacyKey: COMPARE_LEGACY_KEY, ids: numbers.map(cmpId) });
  session.itemRequests.length = 0;
  await page.reload();
  await expectBasketShown(page, session, numbers);
  return session;
}

// Starts from the last control of the summary card and moves with real Tab presses; the next stops are the table
// header controls in DOM order (product remove control, product detail link, next product remove control, ...).
async function tabFromAddMoreLink(page: Page, presses: number) {
  await page.getByRole("link", { name: "비교 후보 더 담기", exact: true }).focus();
  for (let press = 0; press < presses; press += 1) await page.keyboard.press("Tab");
}

test.describe("compare remove control", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("compare remove (control): the existing remove control removes the hovered product and the basket survives a reload", async ({ page }) => {
    const session = await openSeededCompare(page, [1, 2, 3]);
    await expect(page.locator("table")).toHaveCount(1);
    await expect(page.locator("table")).toBeVisible();
    const header = page.locator("table thead th").nth(2);
    await expect(header.getByRole("heading", { name: cmpName(2), exact: true })).toBeVisible();
    await header.hover();
    session.itemRequests.length = 0;
    await header.locator("button").click();
    await expectRemoved(page, session, [1, 3]);
    await expectBasketSurvivesReload(page, session, [1, 3]);
    expect(session.otherApiRequests).toEqual([]);
  });

  test("compare remove: Tab shows the desktop remove control while it has keyboard focus", async ({ page }) => {
    const session = await openSeededCompare(page, [1, 2, 3]);
    await expect(page.locator("table")).toBeVisible();
    const first = desktopRemoveControl(page, 1);
    await expect(page.locator("table thead th").nth(1).getByRole("heading", { name: cmpName(1), exact: true })).toBeVisible();
    // The pointer stays off the table, so only keyboard focus can reveal the control.
    await page.mouse.move(1, 1);
    await expect.poll(() => controlOpacity(first), { message: "desktop remove control before focus" }).toBe("0");
    await tabFromAddMoreLink(page, 1);
    await expect(first).toBeFocused();
    expect(await first.evaluate((element) => element.matches(":focus-visible")), "keyboard focus matches :focus-visible").toBe(true);
    await expect.poll(() => controlOpacity(first), { message: "desktop remove control opacity while keyboard-focused" }).toBe("1");
    expect(session.otherApiRequests).toEqual([]);
  });

  test("compare remove: the named desktop remove control works with Enter and Space and the basket survives a reload", async ({ page }) => {
    const session = await openSeededCompare(page, [1, 2, 3, 4]);
    await expect(page.locator("table")).toBeVisible();
    await expect(namedRemoveControl(page, 2), "named desktop remove control").toHaveCount(1);
    await tabFromAddMoreLink(page, 3);
    await expect(namedRemoveControl(page, 2)).toBeFocused();
    session.itemRequests.length = 0;
    await page.keyboard.press("Enter");
    await expectRemoved(page, session, [1, 3, 4]);

    await tabFromAddMoreLink(page, 3);
    await expect(namedRemoveControl(page, 3)).toBeFocused();
    session.itemRequests.length = 0;
    await page.keyboard.press("Space");
    await expectRemoved(page, session, [1, 4]);
    await expectBasketSurvivesReload(page, session, [1, 4]);
    expect(session.otherApiRequests).toEqual([]);
  });

  test.describe("390x844 touch remove", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("compare remove: the named mobile remove control removes the product", async ({ page }) => {
      const session = await openSeededCompare(page, [1, 2, 3]);
      await expect(page.locator("table")).toHaveCount(1);
      await expect(page.locator("table")).toBeHidden();
      const named = namedRemoveControl(page, 2);
      await expect(named, "named mobile remove control").toHaveCount(1);
      session.itemRequests.length = 0;
      await tapUncovered(page, named);
      await expectRemoved(page, session, [1, 3]);
      expect(session.otherApiRequests).toEqual([]);
    });
  });
});

// Legacy FINLIFE alias across entry points. A full basket already holds the bare legacy code of a product; the same
// product is added again from a recommendation, whose id is "finlife:<code>". Products are synthetic test fixtures.
const LEGACY_UI_BASKET = ["finlife:deposit:0010001:SYN-A", "datago_kdb:SYN-B", "finlife:saving:0020002:SYN-C", "LEG-UI-1"];
const LEGACY_UI_NAMES = new Map<string, string>([
  ["finlife:deposit:0010001:SYN-A", "합성기존 A호"],
  ["datago_kdb:SYN-B", "합성기존 B호"],
  ["finlife:saving:0020002:SYN-C", "합성기존 C호"],
  ["LEG-UI-1", "합성레거시 예금"],
]);
// The profile API is the runtime's owner check; the other three are answered by this test.
const LEGACY_UI_API = new Set(["/api/planning/v2/profiles", "/api/recommend", "/api/sources/status", "/api/products/unified/item"]);

async function expectLegacyUiStorage(page: Page, basket: string[]) {
  expect(await readCompareStorage(page)).toEqual({
    shelf: { schemaVersion: 1, favorites: ["e2e-fav"], recentViewed: ["e2e-recent"], compareBasket: basket },
    legacy: basket,
  });
}

async function expectLegacyUiCompare(page: Page, basket: string[]) {
  await expect(compareCount(page)).toHaveText(`${basket.length} / 4`);
  for (const [id, name] of LEGACY_UI_NAMES) {
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(basket.includes(id) ? 1 : 0);
  }
}

test.describe("compare legacy alias", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("compare legacy alias: re-adding a stored legacy product from a recommendation is a duplicate and keeps the full basket", async ({ page }) => {
    const unexpectedApi: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/") && !LEGACY_UI_API.has(url.pathname)) unexpectedApi.push(`${request.method()} ${url.pathname}`);
    });
    try {
      // Every answered API is registered before the first navigation, so the initial page load is synthetic too. The
      // recommend answer needs the owner the runtime reports after that navigation; a recommend request before it is
      // answered with a synthetic error and recorded as unexpected.
      let owner: Owner | null = null;
      await page.route(/\/api\/recommend(?:\?|$)/, async (route) => {
        const current = owner;
        if (current === null) {
          unexpectedApi.push(`${route.request().method()} /api/recommend before the owner was read`);
          await route.fulfill({ status: 503, json: { ok: false, error: { code: "E2E_NOT_READY", message: "합성 fixture 준비 전 요청" } } });
          return;
        }
        const items = recommendItems("deposit", 1).map((item) => ({ ...item, unifiedId: "finlife:LEG-UI-1", finPrdtCd: "LEG-UI-1", productName: "합성레거시 예금" }));
        await route.fulfill({ json: { ...recommendFixture(current, "deposit"), items } });
      });
      await page.route(/\/api\/sources\/status(?:\?|$)/, async (route) => {
        await route.fulfill({ json: { ok: true, data: [] } });
      });
      await answerItems(page, LEGACY_UI_NAMES, "합성은행");
      await page.goto("/recommend");
      owner = await readOwner(page);
      // Seeded once; a reload keeps whatever the pages store afterwards.
      await page.evaluate(({ shelfKey, legacyKey, basket }) => {
        window.localStorage.setItem(shelfKey, JSON.stringify({
          schemaVersion: 1, favorites: ["e2e-fav"], recentViewed: ["e2e-recent"], compareBasket: basket,
        }));
        window.localStorage.setItem(legacyKey, JSON.stringify(basket));
      }, { shelfKey: COMPARE_SHELF_KEY, legacyKey: COMPARE_LEGACY_KEY, basket: LEGACY_UI_BASKET });
      await page.reload();
      await page.getByTestId("recommend-submit").click();
      await expect(page.getByTestId("recommend-results")).toBeVisible();

      const pressedCard = page.getByRole("heading", { name: "합성레거시 예금", exact: true })
        .locator("xpath=ancestor::*[.//button[normalize-space(.)='비교 담기']][1]");
      await pressedCard.getByRole("button", { name: "비교 담기", exact: true }).click();
      const notice = pressedCard.getByTestId("compare-add-notice");
      await expect(notice).toHaveCount(1);
      // Precondition of the expected RED below: if this fails, the duplicate check was never reached.
      expect(unexpectedApi, "no unregistered API before the duplicate check").toEqual([]);
      await expect(notice, "duplicate notice on the pressed card").toHaveAttribute("data-compare-status", "duplicate");
      await expect(notice).toContainText("이미 비교함에 있는 상품입니다.");
      await expect(notice).toContainText("현재 비교함 4/4개입니다.");
      await expectLegacyUiStorage(page, LEGACY_UI_BASKET);

      await notice.getByRole("link", { name: "비교함에서 나란히 보기" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/products\/compare$/, { timeout: 30_000 });
      await expectLegacyUiCompare(page, LEGACY_UI_BASKET);
      await page.reload();
      await expectLegacyUiCompare(page, LEGACY_UI_BASKET);
      await expectLegacyUiStorage(page, LEGACY_UI_BASKET);

      await page.getByRole("button", { name: "합성레거시 예금 비교함에서 빼기", exact: true }).click();
      const remaining = LEGACY_UI_BASKET.slice(0, 3);
      await expectLegacyUiCompare(page, remaining);
      await expectLegacyUiStorage(page, remaining);
      await page.reload();
      await expectLegacyUiCompare(page, remaining);
      await expectLegacyUiStorage(page, remaining);
      expect(unexpectedApi).toEqual([]);
    } finally {
      // Runs after a passing body and after a failing hard assertion alike, so requests made while that assertion was
      // still auto-waiting are checked too; the original failure still propagates. Requests after this point (page
      // teardown) are not covered.
      expect.soft(unexpectedApi, "no unregistered API through test body completion").toEqual([]);
    }
  });
});
