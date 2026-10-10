import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { issuePlanningDesktopSessionBootstrap } from "../../scripts/planning_desktop_session_server.mjs";

const controlRoot = process.env.PLANNING_DESKTOP_AUTH_CONTROL_ROOT;
test.skip(!controlRoot, "Requires an isolated normal packaged launcher and its control root.");
// The normal launcher owns its random token. Do not use the usual E2E cookie
// header, addCookies, storageState, or a recorded trace containing the nonce.
test.use({ extraHTTPHeaders: {}, trace: "off" });

test("desktop session recovery does not send an unauthenticated browser to OAuth", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: "앱 실행 경로로 다시 열어 주세요.", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "로그인하기", exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("desktop-session-recovery.png"), fullPage: true });
    expect(await page.evaluate(async () => (await fetch("/api/planning/v2/profiles")).status)).toBe(401);
  } finally {
    await context.close();
  }
});

test("desktop signin bookmarks recover locally without initializing Auth.js", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/api/auth/signin?callbackUrl=%2Fplanning");
    expect(new URL(page.url()).pathname).toBe("/planning");
    await expect(page.getByRole("heading", { name: "앱 실행 경로로 다시 열어 주세요.", exact: true })).toBeVisible();
    expect((await context.request.get("/api/auth/session")).status()).toBe(404);
    expect((await context.request.get("/api/auth/providers")).status()).toBe(404);
  } finally {
    await context.close();
  }
});

test("normal packaged bootstrap authenticates fresh browsers without OAuth or preinjected cookies", async ({ browser, baseURL }) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const viewport = attempt === 0 ? { width: 1440, height: 1000 } : { width: 390, height: 844 };
    const context = await browser.newContext({ baseURL, viewport });
    try {
      expect(await context.cookies()).toEqual([]);
      const lock = JSON.parse(await fs.readFile(path.join(controlRoot!, "runtime", "desktop-instance.lock.json"), "utf8"));
      const bootstrap = await issuePlanningDesktopSessionBootstrap({ brokerUrl: lock.brokerUrl, issueCapability: lock.issueCapability });
      const page = await context.newPage();
      // Do not put the one-shot URL into assertion output or a failure trace.
      await page.goto(bootstrap).catch(() => { throw new Error("Desktop bootstrap navigation failed"); });
      expect(new URL(page.url()).pathname).toBe("/dashboard");
      await expect(page.getByRole("heading", { name: "내 재무 현황", exact: true })).toBeVisible();
      // Secondary resources load only after this explicit user action.
      await page.getByTestId("dashboard-secondary-tools").locator(":scope > summary").click();
      await expect(page.getByText("보조 정보를 불러오는 중입니다.", { exact: true })).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "새로고침", exact: true })).toBeEnabled();
      const cookie = (await context.cookies()).find((item) => item.name === "planning.desktop-session");
      expect(Boolean(cookie?.httpOnly && cookie.sameSite === "Strict")).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`desktop-dashboard-${attempt}.png`), fullPage: true });
      await page.goto("/planning");
      await expect(page.getByRole("heading", { name: "재무 진단", exact: true })).toBeVisible();
      await expect(page.getByTestId("planning-quickstart-gate")).toBeVisible();
      await expect(page.getByRole("link", { name: "로그인하기", exact: true })).toHaveCount(0);
      const currentUser = await page.evaluate(async () => {
        const response = await fetch("/api/planning/v2/profiles");
        const payload = await response.json();
        return { status: response.status, meta: payload.meta };
      });
      expect(currentUser).toMatchObject({ status: 200, meta: { userId: "default", authSource: "desktop-local-session" } });
      await page.reload();
      await expect(page.getByRole("heading", { name: "재무 진단", exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`desktop-planning-${attempt}.png`), fullPage: true });
      if (attempt === 1) await page.screenshot({ path: test.info().outputPath("desktop-planning-mobile-viewport.png") });
      const reusedStatus = await context.request.get(bootstrap).then((response) => response.status()).catch(() => 0);
      expect(reusedStatus).toBe(403);
    } finally {
      await context.close();
    }
  }
});
