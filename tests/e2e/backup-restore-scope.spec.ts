import { expect, test, type Page } from "@playwright/test";

const CHECKLIST_KEY = "finlife_planner_checklist_checked_v1";

function bundleFile(clientStorage: Record<string, string | null>) {
  return {
    name: "backup-scope.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      generatedAt: "2026-09-03T00:00:00.000Z",
      serverFiles: {},
      clientStorage,
    })),
  };
}

function browserPanel(page: Page) {
  return page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "3) 브라우저 화면 설정 내보내기", exact: true }),
  });
}

async function openBackupPage(page: Page) {
  await page.goto("/settings/backup");
  await expect(browserPanel(page).locator('input[type="file"]')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/settings/backup/status", async (route) => {
    await route.fulfill({ json: { ok: true, csrfToken: "scope-csrf-fixture" } });
  });
});

async function mockEncryptedRestore(page: Page) {
  const counts = { preview: 0, restore: 0 };
  await page.route("**/api/settings/backup/preview", async (route) => {
    counts.preview += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toContain("scope-csrf-fixture");
    await route.fulfill({ json: {
      ok: true,
      previewToken: "scope-preview-fixture",
      data: {
        manifest: { kind: "planning-user-backup", formatVersion: 1, mode: "full", scope: "user" },
        actual: { profiles: 1, runs: 0, totalFiles: 1, totalBytes: 32 },
        ids: { profileIds: ["scope-profile-fixture"], runIds: [], snapshotIds: [] },
        warnings: [],
      },
    } });
  });
  await page.route("**/api/settings/backup/restore", async (route) => {
    counts.restore += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toContain("scope-preview-fixture");
    expect(route.request().postData()).toContain("scope-csrf-fixture");
    await route.fulfill({ json: {
      ok: true,
      data: { mode: "merge", imported: { profiles: 1 }, issues: [], warnings: [] },
      message: "사용자 백업을 복원했습니다.",
    } });
  });
  return counts;
}

async function restoreEncryptedFixture(page: Page) {
  // Server responses are mocked here; crypto, owner and rollback are covered by API integration tests.
  await page.getByLabel("복구 암호", { exact: true }).fill("scope-fixture-passphrase");
  await page.getByTestId("ops-backup-file-input").setInputFiles({
    name: "scope-fixture.enc",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("opaque encrypted backup transport fixture"),
  });
  await page.getByTestId("ops-backup-preview-button").click();
  await expect(page.getByTestId("ops-backup-preview-card")).toBeVisible();
  await page.getByTestId("ops-backup-restore-button").click();
  const dialog = page.getByRole("dialog", { name: "복원 실행 확인" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "복원 시작", exact: true }).click();
  await expect(page.getByTestId("ops-backup-restore-card")).toContainText("프로필: 1개");
}

test("browser-only restore neither requests server restore nor changes a legacy financial checklist", async ({ page }) => {
  const currentChecklist = JSON.stringify({ "R_DEBT_01-월 상환액 재산정": true });
  const legacyChecklist = JSON.stringify({ "R_INSURANCE_01-보장 공백 확인": true });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: CHECKLIST_KEY, value: currentChecklist,
  });
  const counts = await mockEncryptedRestore(page);
  await openBackupPage(page);
  const panel = browserPanel(page);
  await panel.locator('input[type="file"]').setInputFiles(bundleFile({
    products_shelf_v1: JSON.stringify(["deposit-1"]),
    [CHECKLIST_KEY]: legacyChecklist,
  }));
  await panel.getByRole("button", { name: "브라우저 설정 복원", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("브라우저 설정을 복원했습니다.");
  expect(counts).toEqual({ preview: 0, restore: 0 });
  expect(await page.evaluate(() => localStorage.getItem("products_shelf_v1"))).toBe(JSON.stringify(["deposit-1"]));
  expect(await page.evaluate((key) => localStorage.getItem(key), CHECKLIST_KEY)).toBe(currentChecklist);
  await expect(page.getByTestId("ops-backup-restore-card")).toHaveCount(0);
});

test("server-only restore makes no browser writes and reports only the server scope", async ({ page }) => {
  const originalShelf = JSON.stringify(["existing"]);
  await page.addInitScript((value) => localStorage.setItem("products_shelf_v1", value), originalShelf);
  const counts = await mockEncryptedRestore(page);
  await openBackupPage(page);
  await restoreEncryptedFixture(page);
  expect(counts).toEqual({ preview: 1, restore: 1 });
  expect(await page.evaluate(() => localStorage.getItem("products_shelf_v1"))).toBe(originalShelf);
  await expect(browserPanel(page).getByRole("status")).toHaveCount(0);
});

test("sequential server and browser restores show their outcomes separately", async ({ page }) => {
  const counts = await mockEncryptedRestore(page);
  await openBackupPage(page);
  await restoreEncryptedFixture(page);
  const panel = browserPanel(page);
  await panel.locator('input[type="file"]').setInputFiles(bundleFile({
    products_compare_ids_v1: JSON.stringify(["deposit-1"]),
  }));
  await panel.getByRole("button", { name: "브라우저 설정 복원", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("브라우저 설정을 복원했습니다.");
  await expect(page.getByTestId("ops-backup-restore-card")).toContainText("프로필: 1개");
  expect(counts).toEqual({ preview: 1, restore: 1 });
  expect(await page.evaluate(() => localStorage.getItem("products_compare_ids_v1"))).toBe(JSON.stringify(["deposit-1"]));
});
