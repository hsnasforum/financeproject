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
