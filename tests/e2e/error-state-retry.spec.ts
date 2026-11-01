// The shared fixture replaces the HMR WebSocket on public routes and prevents hydration here.
import { expect, test } from "@playwright/test";

const canExercisePlanningAuthRequired = (
  process.env.PLANNING_AUTH_REQUIRED === "1"
  && process.env.PLANNING_E2E_DISABLE_AUTH_HEADER === "1"
);

test("planning keeps corrupt profile reads in the error state after retry and reload", async ({ page }) => {
  test.skip(canExercisePlanningAuthRequired, "requires an authenticated session; the auth-required configuration shows the sign-in gate");
  const message ="저장 데이터가 손상되었을 수 있습니다. 기존 파일을 보관하고, 저장 상태를 확인한 후 다시 시도해 주세요.";
  let reads = 0;
  let writes = 0;
  await page.route("**/api/planning/v2/profiles", async route => {
    if (route.request().method() !== "GET") {
      writes += 1;
      await route.abort();
      return;
    }
    reads += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "STORAGE_CORRUPT", message } }),
    });
  });
  await page.goto("/planning?view=full");
  const error = page.getByTestId("planning-profiles-error-state");
  await expect(error).toContainText(message);
  await expect(page.getByText("저장된 프로필이 없습니다", { exact: true })).toHaveCount(0);
  const initialReads = reads;
  await error.getByRole("button", { name: "다시 불러오기" }).click();
  await expect.poll(() => reads).toBeGreaterThan(initialReads);
  await expect(error).toContainText(message);
  await page.reload();
  await expect(error).toContainText(message);
  await expect(error.locator('a[href="/ops/doctor"]')).toHaveCount(0);
  expect(writes).toBe(0);
});

test("benefits exposes the default retry action and reruns the failed request", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/public/benefits/search?**", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        contentType: "application/json",
        status: 503,
        body: JSON.stringify({ ok: false, error: { message: "혜택 조회 실패" } }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ok: true,
        data: {
          items: [],
          facets: { sido: [], sigungu: [] },
          totalMatched: 0,
          page: { nextCursor: null },
          assumptions: { note: "" },
        },
      }),
    });
  });

  await page.goto("/benefits");
  const alert = page.locator('[role="alert"]').filter({ hasText: "혜택 조회 실패" });
  await expect(alert).toContainText("혜택 조회 실패");
  await alert.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => requestCount).toBe(2);
  await expect(alert).toHaveCount(0);
});

test("subscription exposes the default retry action and reruns the failed request", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/public/housing/subscription?**", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        contentType: "application/json",
        status: 503,
        body: JSON.stringify({ ok: false, error: { message: "청약 공고 조회 실패" } }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ ok: true, data: { items: [], assumptions: { note: "" } } }),
    });
  });

  await page.goto("/housing/subscription");
  const alert = page.locator('[role="alert"]').filter({ hasText: "청약 공고 조회 실패" });
  await expect(alert).toContainText("청약 공고 조회 실패");
  await alert.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => requestCount).toBe(2);
  await expect(alert).toHaveCount(0);
});

test("planning reports keeps an unauthenticated response distinct and retries it", async ({ page }) => {
  test.skip(!canExercisePlanningAuthRequired, "requires the focused unauthenticated E2E configuration");

  // Dev Strict Mode sends an extra request that the page aborts, so answer by phase instead of request order.
  let requestCount = 0;
  let retryClicked = false;
  await page.route("**/api/planning/v2/runs?**", async (route) => {
    requestCount += 1;
    if (!retryClicked) {
      await route.fulfill({
        contentType: "application/json",
        status: 401,
        body: JSON.stringify({
          ok: false,
          error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다." },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ ok: true, data: [] }),
    });
  });

  await page.goto("/planning/reports?profileId=e2e-auth-required");
  const alert = page.locator('[role="alert"]').filter({ hasText: "로그인이 필요합니다" });
  await expect(alert).toContainText("로그인이 필요합니다");
  await expect(alert).toContainText("로그인 상태를 확인한 뒤 다시 시도해주세요.");
  await expect(alert).not.toContainText("오류가 발생했습니다");
  const requestsBeforeRetry = requestCount;
  retryClicked = true;
  await alert.getByRole("button", { name: "다시 시도" }).click();

  await expect.poll(() => requestCount).toBeGreaterThan(requestsBeforeRetry);
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("아직 저장된 실행이 없습니다")).toBeVisible();
});

test("an unknown route returns the dedicated 404 state", async ({ page }) => {
  for (const routePath of ["/__e2e_missing_route__", "/planning/__e2e_missing_route__"]) {
    const response = await page.goto(routePath);

    expect(response?.status(), routePath).toBe(404);
    await expect(page.getByRole("heading", { name: "요청한 화면을 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByText("화면을 불러오지 못했습니다")).toHaveCount(0);
  }
});
