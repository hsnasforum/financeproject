import fs from "node:fs";
import path from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "./helpers/e2eTest";
import { normalizeFinlifeDisclosureMonth } from "../../src/lib/finlife/disclosure";
import type { FinlifeSnapshot } from "../../src/lib/finlife/snapshot";
import type { FinlifeKind, FinlifeSourceResult, NormalizedProduct } from "../../src/lib/finlife/types";
import { productIdentity } from "../../src/lib/products/productIdentity";
import { sortUnifiedOptions } from "../../src/lib/sources/unifiedEnrichPolicy";
import type { ProductFreshnessSummary } from "../../src/lib/sources/types";
import type { UnifiedProductView } from "../../src/lib/sources/unifiedTypes";

type CatalogKind = "deposit" | "saving";
const loanKinds = ["credit-loan", "mortgage-loan", "rent-house-loan"] as const;

// Read approved captures only. Every replay below stays in page.route memory;
// it neither enables a product fallback nor calls FINLIFE nor writes the DB.
function capturedSnapshot(kind: FinlifeKind): FinlifeSnapshot {
  const snapshot = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), ".data", `finlife_${kind}_snapshot.json`), "utf8",
  )) as FinlifeSnapshot;
  expect(snapshot.meta.source).toBe("finlife");
  expect(snapshot.meta.fallbackUsed).toBe(false);
  expect(Number.isFinite(Date.parse(snapshot.meta.generatedAt))).toBe(true);
  expect(snapshot.items.length).toBeGreaterThan(0);
  return snapshot;
}

function capturedProduct(snapshot: FinlifeSnapshot): NormalizedProduct {
  const item = snapshot.items.find((product) => product.raw.dcls_month === "202609" && product.options.length > 0);
  expect(item, "the approved September disclosure capture must be available").toBeDefined();
  return structuredClone(item!);
}

// Derive the expected KST clock independently of the production formatter.
function expectedCollectionTime(iso: string): string {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}. ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
}

function markReplay(testInfo: TestInfo, kind: FinlifeKind, snapshot: FinlifeSnapshot): void {
  testInfo.annotations.push({
    type: "data-evidence",
    description: `Test-only API replay of .data/finlife_${kind}_snapshot.json, collected ${snapshot.meta.generatedAt}; not live FINLIFE verification.`,
  });
}

function publicCapturedItem(kind: CatalogKind, product: NormalizedProduct): UnifiedProductView {
  return {
    stableId: productIdentity(product, kind),
    sourceId: "finlife", sourceIds: ["finlife"], kind, externalKey: product.fin_prdt_cd,
    providerName: product.kor_co_nm ?? "", productName: product.fin_prdt_nm ?? "",
    disclosureMonth: normalizeFinlifeDisclosureMonth(product.raw.dcls_month),
    badges: ["FINLIFE"],
    options: sortUnifiedOptions(product.options.map((option) => ({
      sourceId: "finlife",
      termMonths: option.save_trm && Number.isFinite(Number(option.save_trm)) ? Number(option.save_trm) : null,
      saveTrm: option.save_trm,
      intrRate: option.intr_rate ?? null,
      intrRate2: option.intr_rate2 ?? null,
    }))),
  };
}

async function replayCatalog(
  page: Page, kind: CatalogKind, snapshot: FinlifeSnapshot, item: UnifiedProductView,
): Promise<void> {
  const checkedAt = new Date().toISOString();
  const freshness: ProductFreshnessSummary = {
    checkedAt, overall: "stale",
    sources: [{
      sourceId: "finlife", kind, sourceAsOf: snapshot.meta.generatedAt, checkedAt,
      ttlMs: snapshot.meta.ttlMs, ageMs: Math.max(0, Date.now() - Date.parse(snapshot.meta.generatedAt)),
      freshness: "stale", fallbackUsed: true,
      message: "검증된 저장 스냅샷을 E2E에서 재생한 응답입니다.",
    }],
  };
  await page.route("**/api/products/unified?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") !== kind) {
      await route.fulfill({ status: 400, json: { ok: false, error: { code: "INPUT", message: "Unexpected replay kind" } } });
      return;
    }
    await route.fulfill({ status: 200, json: {
      ok: true,
      data: {
        kind, sources: { finlife: { count: 1 }, datago_kdb: { count: 0 } },
        items: [item], merged: [item],
        facets: { providers: [item.providerName], providerStatus: { state: "complete", issues: [] } },
        pageInfo: { hasMore: false, nextCursor: null, limit: 60 },
        provenance: {
          policy: "pinned_snapshot", capturedAt: checkedAt,
          versionFingerprint: `e2e-disclosure:${kind}:${snapshot.meta.generatedAt}`, freshness,
        },
      },
      meta: { generatedAt: checkedAt, freshness },
    } });
  });
  await page.route("**/api/products/unified/item?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("id") !== item.stableId) {
      await route.fulfill({ status: 404, json: { ok: false, error: { code: "NO_DATA", message: "Unknown replay product" } } });
      return;
    }
    await route.fulfill({ status: 200, json: { ok: true, data: { item }, meta: { generatedAt: checkedAt, freshness } } });
  });
}

async function replayLoan(
  page: Page, kind: typeof loanKinds[number], snapshot: FinlifeSnapshot, product: NormalizedProduct,
): Promise<void> {
  // Replay one captured row, with counts describing this test-owned subset.
  const response: FinlifeSourceResult = {
    ok: true, mode: "fixture",
    meta: {
      kind, pageNo: 1, topFinGrpNo: "020000", fallbackUsed: true,
      hasNext: false, nextPage: null, nowPage: 1, maxPage: 1, totalCount: 1,
      totalProducts: 1, totalOptions: product.options.length, source: "snapshot",
      configuredGroups: snapshot.meta.configuredGroups, groupsScanned: snapshot.meta.groupsScanned,
      completionRate: snapshot.meta.completionRate, truncatedByHardCap: snapshot.meta.truncatedByHardCap,
      snapshot: {
        generatedAt: snapshot.meta.generatedAt,
        ageMs: Math.max(0, Date.now() - Date.parse(snapshot.meta.generatedAt)),
        completionRate: snapshot.meta.completionRate, totalProducts: 1, totalOptions: product.options.length,
      },
      fallback: { mode: "REPLAY", sourceKey: "finlife", reason: "e2e_test_only", generatedAt: snapshot.meta.generatedAt },
    },
    data: [product],
  };
  await page.route(`**/api/finlife/${kind}?**`, (route) => route.fulfill({
    status: 200, headers: { "x-finlife-mode": "replay", "x-finlife-upstream": "not-called" }, json: response,
  }));
}

async function expectDisclosure(container: Locator, month: string, generatedAt: string): Promise<void> {
  await expect(container.getByTestId("product-disclosure-month")).toHaveText(`원문 공시월: ${month}`);
  await expect(container.getByTestId("product-collection-time")).toHaveText(`수집 시각: ${expectedCollectionTime(generatedAt)}`);
  await expect(container.getByTestId("product-disclosure-month")).not.toContainText("2026년 10월");
}

async function expectMetadataWithinViewport(container: Locator): Promise<void> {
  for (const id of ["product-disclosure-month", "product-collection-time"]) {
    const bounds = await container.getByTestId(id).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: window.innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  }
}

test.describe("test-only captured FINLIFE snapshot API replay", () => {
  for (const kind of ["deposit", "saving"] as const) {
    test(`${kind} catalog to unified detail keeps September disclosure separate from captured collection`, async ({ page }, testInfo) => {
      const snapshot = capturedSnapshot(kind);
      const item = publicCapturedItem(kind, capturedProduct(snapshot));
      markReplay(testInfo, kind, snapshot);
      await replayCatalog(page, kind, snapshot, item);
      await page.goto(`/products/${kind}`);
      await expect(page).toHaveURL(new RegExp(`/products/catalog\\?kind=${kind}`));
      const card = page.locator("article").filter({ has: page.getByRole("heading", { name: item.productName, exact: true }) });
      await expectDisclosure(card, "2026년 9월", snapshot.meta.generatedAt);
      await card.getByRole("link", { name: "상세에서 다시 확인", exact: true }).click();
      await expect(page).toHaveURL(/\/products\/catalog\/finlife%3A/);
      await expect(page.getByRole("heading", { name: item.productName, exact: true })).toBeVisible();
      await expectDisclosure(page.locator("main"), "2026년 9월", snapshot.meta.generatedAt);
    });
  }

  for (const kind of loanKinds) {
    test(`${kind} captured REPLAY list to drawer retains disclosure and collection at 390px`, async ({ page }, testInfo) => {
      const snapshot = capturedSnapshot(kind);
      const product = capturedProduct(snapshot);
      markReplay(testInfo, kind, snapshot);
      await page.setViewportSize({ width: 390, height: 844 });
      await replayLoan(page, kind, snapshot, product);
      await page.goto(`/products/${kind}?view=product`);
      const heading = page.getByRole("heading", { name: product.fin_prdt_nm!, exact: true });
      await expect(heading).toBeVisible();
      await heading.scrollIntoViewIfNeeded();
      const row = heading.locator("..");
      await expectDisclosure(row, "2026년 9월", snapshot.meta.generatedAt);
      await expect(row).toContainText("재생 데이터 기준");
      await expect(page.getByText("MOCK 데이터", { exact: true })).toHaveCount(0);
      await expectMetadataWithinViewport(row);
      await heading.click();
      const dialog = page.getByRole("dialog", { name: product.fin_prdt_nm!, exact: true });
      await expect(dialog).toBeVisible();
      await expectDisclosure(dialog, "2026년 9월", snapshot.meta.generatedAt);
      await expectMetadataWithinViewport(dialog);
      await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expectDisclosure(row, "2026년 9월", snapshot.meta.generatedAt);
    });
  }

  for (const month of [undefined, "202600", "202613"]) {
    test(`missing or invalid disclosure ${month ?? "missing"} stays unknown through catalog and detail`, async ({ page }, testInfo) => {
      const snapshot = capturedSnapshot("deposit");
      const product = capturedProduct(snapshot);
      if (month === undefined) delete product.raw.dcls_month;
      else product.raw.dcls_month = month;
      const item = publicCapturedItem("deposit", product);
      if (month === undefined) delete item.disclosureMonth;
      markReplay(testInfo, "deposit", snapshot);
      await replayCatalog(page, "deposit", snapshot, item);
      await page.goto("/products/catalog?kind=deposit");
      const card = page.locator("article").filter({ has: page.getByRole("heading", { name: item.productName, exact: true }) });
      await expectDisclosure(card, "확인되지 않음", snapshot.meta.generatedAt);
      await card.getByRole("link", { name: "상세에서 다시 확인", exact: true }).click();
      await expect(page.getByRole("heading", { name: item.productName, exact: true })).toBeVisible();
      await expectDisclosure(page.locator("main"), "확인되지 않음", snapshot.meta.generatedAt);
    });
  }
});

test.describe("keyless unmocked production FINLIFE loan error contract", () => {
  // Run against the main-owned production server with FINLIFE_REPLAY and API
  // credentials absent. The official replay wrapper must exclude this case
  // with --grep-invert keyless; there is deliberately no automatic skip.
  test("keyless loans keep the real configuration error and do not supply replay products", async ({ page }) => {
    for (const kind of loanKinds) {
      const responsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/finlife/${kind}` && response.request().method() === "GET",
      );
      await page.goto(`/products/${kind}?view=product`);
      const response = await responsePromise;
      expect(response.status()).toBe(400);
      expect(response.headers()["x-finlife-mode"]).toBe("live");
      expect(response.headers()["x-finlife-upstream"]).toBe("not-called");
      const payload = await response.json() as FinlifeSourceResult;
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("CONFIG_MISSING");
      expect(payload.data).toEqual([]);
      expect(payload.meta.fallbackUsed).toBe(false);
      expect(payload.meta.fallback?.mode).toBe("LIVE");
      await expect(page.getByText("데이터 오류", { exact: true })).toBeVisible();
      await expect(page.getByText("FINLIFE_API_KEY가 설정되지 않았습니다.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "다시 시도하기", exact: true })).toBeVisible();
      await expect(page.getByTestId("product-disclosure-month")).toHaveCount(0);
      await expect(page.getByText("재생 데이터 기준", { exact: true })).toHaveCount(0);
      await expect(page.getByText("MOCK 데이터", { exact: true })).toHaveCount(0);
    }
  });
});
