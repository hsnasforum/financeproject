import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/e2eTest";

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
