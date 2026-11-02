import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { seedRunForReports } from "./helpers/planningGateHelpers";

test("save completing during a recovery offer survives cancellation and reopen", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const { profileId } = await seedRunForReports(request);
  await page.goto("/planning?profileId=" + profileId);
  const form = page.getByTestId("planning-profile-form");
  const income = form.getByLabel("월 실수령");
  await expect(income).toHaveValue("4,800,000");
  await income.fill("4,950,000");
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let saves = 0;
  await page.route("**/api/planning/v2/profiles/" + profileId, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    saves++;
    await held;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.getByTestId("planning-profile-update-button").click();
  const suggestions = page.getByRole("button", { name: "변경 없이 저장", exact: true });
  if (await suggestions.isVisible()) await suggestions.click();
  await expect.poll(() => saves).toBe(1);
  // CSSOM changes keep the production CSP intact while injecting an absent body.
  await form.evaluate((element) => element.style.setProperty("display", "none", "important"));
  const recovery = page.getByRole("region", { name: "재무진단 화면 복구" });
  try {
    await expect(recovery).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (dialog) => dialog.dismiss());
    await recovery.getByRole("button", { name: "다시 불러오기" }).click();
    await expect(recovery).toBeVisible();
  } finally { release(); }
  const headers = { origin: baseURL!, referer: baseURL! + "/planning" };
  await expect.poll(async () => {
    const response = await request.get("/api/planning/v2/profiles/" + profileId, { headers });
    return (await response.json()).data.profile.monthlyIncomeNet;
  }).toBe(4_950_000);
  await form.evaluate((element) => element.style.removeProperty("display"));
  await expect(recovery).toHaveCount(0);
  await expect(income).toHaveValue("4,950,000");
  await page.reload();
  await expect(income).toHaveValue("4,950,000");
  expect(saves).toBe(1);
  await testInfo.attach("save-during-recovery", {
    contentType: "application/json",
    body: JSON.stringify({ cancelledReload: true, saves, reopenedIncome: 4_950_000 }),
  });
});

test("real encrypted backup restore preserves profile goals run and saved report", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const { profileId, runId } = await seedRunForReports(request);
  const headers = { origin: baseURL!, referer: baseURL! + "/settings/backup" };
  const devCsrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const created = await request.post("/api/planning/v2/reports", {
    headers, data: { runId, ...(devCsrf ? { csrf: devCsrf } : {}) },
  });
  expect(created.ok()).toBeTruthy();
  const reportId = (await created.json()).data.id as string;
  const paths = [
    "/api/planning/v2/profiles/" + profileId,
    "/api/planning/v2/runs/" + runId,
    "/api/planning/v2/reports/" + reportId,
  ];
  async function read() {
    return Promise.all(paths.map(async (path) => {
      const response = await request.get(path, { headers });
      expect(response.ok()).toBeTruthy();
      return (await response.json()).data;
    }));
  }
  const before = await read();
  expect(before[0].profile.goals.length).toBeGreaterThan(0);
  const status = await request.get("/api/settings/backup/status", { headers });
  expect(status.ok()).toBeTruthy();
  const csrf = (await status.json()).csrfToken as string;
  const vaultCookie = (await request.storageState()).cookies.find((cookie) => cookie.name === "planning_vault_csrf");
  expect(vaultCookie?.value).toBe(csrf);
  // The production harness pins a desktop-session Cookie header. Preserve it
  // and forward the real cookie jar after each response (CSRF and preview binding).
  const sessionCookie = testInfo.project.use.extraHTTPHeaders?.cookie;
  async function backupHeaders() {
    if (!sessionCookie) return headers;
    const cookies = (await request.storageState()).cookies
      .filter((cookie) => cookie.name !== "planning.desktop-session")
      .map((cookie) => `${cookie.name}=${cookie.value}`);
    return { ...headers, cookie: [sessionCookie, ...cookies].join("; ") };
  }
  const passphrase = "release-disposable-backup-passphrase";
  const exported = await request.post("/api/settings/backup/export", {
    headers: await backupHeaders(), data: { csrf, passphrase, mode: "full", gzip: true },
  });
  expect(exported.ok()).toBeTruthy();
  const bytes = await exported.body();
  expect(bytes.length).toBeGreaterThan(100);
  const receipt = exported.headers()["x-planning-backup-export-receipt"];
  expect(receipt).toBeTruthy();
  const finalized = await request.post("/api/settings/backup/export/finalize", {
    headers: await backupHeaders(), data: { csrf, receipt },
  });
  expect(finalized.ok()).toBeTruthy();
  const changed = await request.patch(paths[0], {
    headers, data: { name: before[0].name, profile: { ...before[0].profile, monthlyIncomeNet: 4_990_000 }, ...(devCsrf ? { csrf: devCsrf } : {}) },
  });
  expect(changed.ok()).toBeTruthy();
  expect((await read())[0].profile.monthlyIncomeNet).toBe(4_990_000);
  const file = { name: "disposable-roundtrip.enc.json", mimeType: "application/json", buffer: bytes };
  const preview = await request.post("/api/settings/backup/preview", {
    headers: await backupHeaders(), multipart: { csrf, passphrase, file },
  });
  expect(preview.ok()).toBeTruthy();
  const previewToken = (await preview.json()).previewToken as string;
  expect((await request.storageState()).cookies.some((cookie) => cookie.name === "planning_backup_preview_session")).toBe(true);
  const restored = await request.post("/api/settings/backup/restore", {
    headers: await backupHeaders(), multipart: { csrf, passphrase, file, previewToken, mode: "replace" },
  });
  expect(restored.ok()).toBeTruthy();
  const result = await restored.json();
  expect(result.ok).toBe(true);
  expect(result.data.issues).toEqual([]);
  const after = await read();
  expect(after).toEqual(before);
  await page.goto("/planning?profileId=" + profileId);
  await expect(page.getByTestId("planning-profile-form").getByLabel("월 실수령")).toHaveValue("4,800,000");
  await page.goto("/planning/reports/" + reportId);
  await expect(page.getByTestId("saved-report-record")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("saved-report-record")).toBeVisible();
  expect(await read()).toEqual(before);
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  await testInfo.attach("real-backup-roundtrip", {
    contentType: "application/json",
    body: JSON.stringify({ profileGoalsRunReportEqual: true, beforeSha256: hash(before), afterSha256: hash(after), encryptedBytes: bytes.length }),
  });
});
