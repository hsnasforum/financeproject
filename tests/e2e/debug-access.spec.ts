import { expect, test } from "./helpers/e2eTest";

const production = process.env.E2E_WEB_SERVER_MODE === "production";
const debugEnabled = process.env.PLANNING_DEBUG_ENABLED === "true";

test("local debug pages require the explicit flag and a non-production runtime", async ({ page }) => {
  const allowed = debugEnabled && !production;
  for (const [path, heading] of [
    ["/debug/unified", "통합 디버그 보기"],
    ["/debug/planning-v2", "Planning v2 Debug"],
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(allowed ? 200 : 404);
    if (allowed) {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
    }
  }
});

test("non-local forwarded host is forbidden in development and debug routes stay hidden in production", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-host": "example.com" });
  for (const [path, heading] of [
    ["/debug/unified", "통합 디버그 보기"],
    ["/debug/planning-v2", "Planning v2 Debug"],
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(production ? 404 : 403);
    if (production) {
      await expect(page.getByRole("heading", { name: "요청한 화면을 찾을 수 없습니다", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toHaveCount(0);
    } else {
      await expect(page.locator("body")).toHaveText("Forbidden");
    }
  }
});
