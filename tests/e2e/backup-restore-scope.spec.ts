import { expect, test, type Page } from "@playwright/test";

const CHECKLIST_KEY = "finlife_planner_checklist_checked_v1";
const SERVER_PATH = "tmp/user_feedback.json";

function bundleFile(input: {
  serverFiles?: Record<string, string | null>;
  clientStorage?: Record<string, string | null>;
}) {
  return {
    name: "backup-scope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      generatedAt: "2026-09-03T00:00:00.000Z",
      serverFiles: input.serverFiles ?? {},
      clientStorage: input.clientStorage ?? {},
    })),
  };
}

async function openBackupPage(page: Page) {
  await page.goto("/settings/backup");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('input[type="file"]')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/dev/backup/restore-point", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { exists: false, createdAt: null } }),
    });
  });
});

test("browser-only restore neither requests server restore nor changes a legacy financial checklist", async ({ page }) => {
  const currentChecklist = JSON.stringify({ "R_DEBT_01-월 상환액 재산정": true });
  const legacyChecklist = JSON.stringify({
    "R_INSURANCE_01-보장 공백 확인": true,
    "R_EMERGENCY_01-비상금 자동이체": false,
  });
  let serverRestoreRequests = 0;

  await page.addInitScript(({ checklistKey, checklistValue }) => {
    window.localStorage.setItem(checklistKey, checklistValue);
  }, { checklistKey: CHECKLIST_KEY, checklistValue: currentChecklist });
  await page.route("**/api/dev/backup/import", async (route) => {
    serverRestoreRequests += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });

  await openBackupPage(page);
  await page.locator('input[type="file"]').setInputFiles(bundleFile({
    clientStorage: {
      products_shelf_v1: "[\"deposit-1\"]",
      [CHECKLIST_KEY]: legacyChecklist,
    },
  }));

  const restoreButton = page.getByRole("button", { name: "브라우저 설정 복원 실행" });
  await expect(restoreButton).toBeVisible();
  await expect(page.getByRole("button", { name: /Restore Point 자동 생성/ })).toHaveCount(0);
  await restoreButton.click();

  await expect(page.getByText(/브라우저 설정 복원이 완료되었습니다/)).toBeVisible();
  expect(serverRestoreRequests).toBe(0);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("products_shelf_v1")))
    .toBe("[\"deposit-1\"]");
  expect(await page.evaluate((key) => window.localStorage.getItem(key), CHECKLIST_KEY)).toBe(currentChecklist);
  await expect(page.getByText("Server Files", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Restore Point", { exact: true })).toHaveCount(1);
});

test("server-only restore makes no browser writes and reports only the server scope", async ({ page }) => {
  let serverRestoreRequests = 0;
  const originalShelf = "[\"existing\"]";

  await page.addInitScript((value) => {
    window.localStorage.setItem("products_shelf_v1", value);
  }, originalShelf);
  await page.route("**/api/dev/backup/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { serverFiles: { [SERVER_PATH]: "[]" }, readFailed: [] } }),
    });
  });
  await page.route("**/api/dev/backup/import", async (route) => {
    serverRestoreRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        written: [SERVER_PATH],
        skipped: [],
        restorePointCreated: true,
        validated: true,
        rolledBack: false,
        issues: [],
      }),
    });
  });

  await openBackupPage(page);
  await page.locator('input[type="file"]').setInputFiles(bundleFile({
    serverFiles: { [SERVER_PATH]: "[{\"id\":1}]" },
    clientStorage: { products_shelf_v1: "[\"replacement\"]" },
  }));
  await page.getByRole("checkbox", { name: /클라이언트 저장소 복원/ }).uncheck();

  await expect(page.getByText("Restore Point는 선택한 서버 파일에만 적용됩니다.")).toBeVisible();
  const restoreButton = page.getByRole("button", { name: "서버 파일 복원 실행 (Restore Point 자동 생성)" });
  await expect(restoreButton).toBeVisible();
  await restoreButton.click();
  await expect(page.getByRole("button", { name: "서버 파일 복원 중..." })).toBeVisible();

  await expect(page.getByText("서버 파일 검증과 복원이 완료되었습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText(/브라우저 설정 복원이 완료되었습니다/)).toHaveCount(0);
  expect(serverRestoreRequests).toBe(1);
  expect(await page.evaluate(() => window.localStorage.getItem("products_shelf_v1"))).toBe(originalShelf);
  await expect(page.getByText("localStorage", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Server Files", { exact: true })).toBeVisible();
  await expect(page.getByText("Restore Point", { exact: true })).toHaveCount(2);
});

test("combined restore shows browser and server outcomes separately", async ({ page }) => {
  let serverRestoreRequests = 0;

  await page.route("**/api/dev/backup/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { serverFiles: { [SERVER_PATH]: "[]" }, readFailed: [] } }),
    });
  });
  await page.route("**/api/dev/backup/import", async (route) => {
    serverRestoreRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        written: [SERVER_PATH],
        skipped: [],
        restorePointCreated: true,
        validated: true,
        rolledBack: false,
        issues: [],
      }),
    });
  });

  await openBackupPage(page);
  await page.locator('input[type="file"]').setInputFiles(bundleFile({
    serverFiles: { [SERVER_PATH]: "[{\"id\":1}]" },
    clientStorage: { products_compare_ids_v1: "[\"deposit-1\"]" },
  }));

  await expect(page.getByText("Restore Point는 선택한 서버 파일에만 적용됩니다. 브라우저 설정은 포함되지 않습니다.")).toBeVisible();
  const restoreButton = page.getByRole("button", {
    name: "서버 파일·브라우저 설정 복원 실행 (서버 파일 Restore Point 자동 생성)",
  });
  await restoreButton.click();
  await expect(page.getByRole("button", { name: "서버 파일·브라우저 설정 복원 중..." })).toBeVisible();

  await expect(page.getByText(/서버 파일 검증과 브라우저 설정 복원이 완료되었습니다/)).toBeVisible();
  expect(serverRestoreRequests).toBe(1);
  await expect(page.getByText("localStorage", { exact: true })).toBeVisible();
  await expect(page.getByText("Server Files", { exact: true })).toBeVisible();
  await expect(page.getByText("Restore Point", { exact: true })).toHaveCount(2);
});
