import { expect, test } from "./helpers/e2eTest";
import { type APIRequestContext, type Page, type Route } from "@playwright/test";

// Response-hold regressions for the planning workspace profile editor.
// Every hold fetches the real server response first and only delays delivery,
// so a released response carries the data that was current when it was read.

const LIST_PATH = "/api/planning/v2/profiles";
const SETTLE_MS = 700;

function resolveBaseUrl(): string {
  const configured = (
    process.env.E2E_EXTERNAL_BASE_URL
    || process.env.BASE_URL
    || process.env.E2E_BASE_URL
    || process.env.PLANNING_BASE_URL
    || ""
  ).trim().replace(/\/+$/, "");
  if (configured) return configured;
  const port = (process.env.PORT || "3126").trim() || "3126";
  return `http://127.0.0.1:${port}`;
}

async function readDevCsrf(request: APIRequestContext): Promise<string> {
  const storageState = await request.storageState().catch(() => null);
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  return cookies.find((cookie) => cookie.name === "dev_csrf")?.value?.trim() ?? "";
}

function apiHeaders() {
  const baseUrl = resolveBaseUrl();
  return { origin: baseUrl, referer: `${baseUrl}/planning` };
}

type StoredProfile = {
  id: string;
  name: string;
  profile: { monthlyIncomeNet: number };
};

async function seedProfile(request: APIRequestContext, name: string, monthlyIncomeNet: number): Promise<string> {
  const csrf = await readDevCsrf(request);
  const response = await request.post(LIST_PATH, {
    headers: { ...apiHeaders(), "content-type": "application/json" },
    data: {
      name,
      profile: {
        monthlyIncomeNet,
        monthlyEssentialExpenses: 1_800_000,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 2_500_000,
        investmentAssets: 4_400_000,
        debts: [],
        goals: [
          {
            id: "goal-emergency",
            name: "비상금",
            targetAmount: 12_000_000,
            currentAmount: 1_000_000,
            targetMonth: 12,
            priority: 5,
            minimumMonthlyContribution: 0,
          },
        ],
      },
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const profileId = payload?.data?.id;
  if (!response.ok() || !payload?.ok || !profileId) {
    throw new Error(`failed to seed profile: status=${response.status()}`);
  }
  return profileId;
}

async function readProfile(request: APIRequestContext, profileId: string): Promise<StoredProfile> {
  const response = await request.get(`${LIST_PATH}/${profileId}`, { headers: apiHeaders() });
  const payload = (await response.json()) as { data: StoredProfile };
  return payload.data;
}

async function listProfiles(request: APIRequestContext): Promise<StoredProfile[]> {
  const response = await request.get(LIST_PATH, { headers: apiHeaders() });
  const payload = (await response.json()) as { data: StoredProfile[] };
  return payload.data;
}

type Hold = {
  calls: () => number;
  release: () => void;
};

// Holds the first matching request. Later matching requests pass through untouched.
async function deliverRealResponseLate(route: Route, gate: Promise<void>) {
  const response = await route.fetch();
  await gate;
  await route.fulfill({ response });
}

async function holdFirst(
  page: Page,
  matches: (url: URL, method: string) => boolean,
  deliver: (route: Route, gate: Promise<void>) => Promise<void> = deliverRealResponseLate,
): Promise<Hold> {
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.pathname.startsWith(LIST_PATH), async (route) => {
    const url = new URL(route.request().url());
    if (!matches(url, route.request().method())) return route.fallback();
    calls += 1;
    if (calls > 1) return route.fallback();
    await deliver(route, gate);
  });
  return { calls: () => calls, release: () => release() };
}

function isListGet(url: URL, method: string) {
  return url.pathname === LIST_PATH && method === "GET";
}

function waitForListResponse(page: Page) {
  return page.waitForResponse((response) => (
    new URL(response.url()).pathname === LIST_PATH && response.request().method() === "GET"
  ));
}

function workspace(page: Page) {
  const form = page.getByTestId("planning-profile-form");
  return {
    select: page.getByLabel("프로필 선택"),
    name: form.getByLabel("프로필 이름"),
    income: form.getByLabel("월 실수령"),
    saveButton: page.getByTestId("planning-profile-update-button"),
    createButton: page.getByTestId("planning-profile-create-button"),
    duplicateButton: page.getByRole("button", { name: "복제", exact: true }),
    refreshButton: page.getByTestId("planning-profile-refresh-button"),
  };
}

// Waits for the initial client list load so later holds never capture it.
async function openWorkspace(page: Page, profileId: string, knownIds: string[]) {
  await page.addInitScript((seededProfileId: string) => {
    window.localStorage.setItem("planning:v2:beginnerMode", "false");
    window.localStorage.setItem("planning:v2:selectedProfileId", seededProfileId);
  }, profileId);
  const initialList = waitForListResponse(page);
  await page.goto(`/planning?profileId=${encodeURIComponent(profileId)}`);
  await initialList;
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(profileId, { timeout: 30_000 });
  for (const id of knownIds) {
    await expect(ui.select.locator(`option[value="${id}"]`)).toHaveCount(1, { timeout: 30_000 });
  }
  await expect(ui.refreshButton).toBeEnabled({ timeout: 30_000 });
  return ui;
}

async function clickAndSkipSuggestions(page: Page, button: ReturnType<Page["getByTestId"]>) {
  await button.click();
  const continueWithout = page.getByRole("button", { name: "변경 없이 저장", exact: true });
  if (await continueWithout.isVisible()) await continueWithout.click();
}

async function settle(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
}

function uniqueTag(workerIndex: number) {
  return `${Date.now().toString(36)}-${workerIndex}`;
}

test("saving before the first client load keeps the server-rendered profile name", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  await page.addInitScript((seededProfileId: string) => {
    window.localStorage.setItem("planning:v2:beginnerMode", "false");
    window.localStorage.setItem("planning:v2:selectedProfileId", seededProfileId);
  }, a);
  const list = await holdFirst(page, isListGet);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "GET");

  await page.goto(`/planning?profileId=${encodeURIComponent(a)}`);
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(a, { timeout: 30_000 });
  await expect.poll(list.calls).toBe(1);
  await expect(ui.name).toHaveValue(aName);
  await expect(ui.income).toHaveValue("4,100,000");

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect(page.getByText("프로필을 수정했습니다.")).toBeVisible();
  list.release();
  detail.release();
  await settle(page);

  const stored = await readProfile(request, a);
  expect(stored.name).toBe(aName);
  expect(stored.profile.monthlyIncomeNet).toBe(4_100_000);
  await expect(ui.name).toHaveValue(aName);
  await expect(ui.refreshButton).toBeEnabled();
});

test("a late detail response for A does not overwrite B after the user switches", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const bName = `경합B-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "GET");

  const ui = await openWorkspace(page, a, [a, b]);
  await expect.poll(detail.calls).toBeGreaterThan(0);

  await ui.select.selectOption(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("6,200,000");
  await ui.income.fill("6,300,000");

  const delivered = page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${a}`));
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.select).toHaveValue(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("6,300,000");

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_300_000);
  expect((await readProfile(request, b)).name).toBe(bName);
  const storedA = await readProfile(request, a);
  expect(storedA.name).toBe(aName);
  expect(storedA.profile.monthlyIncomeNet).toBe(4_100_000);
});

test("A to B to A ignores a stale A detail read before the save", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, `경합B-${tag}`, 6_200_000);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "GET");

  const ui = await openWorkspace(page, a, [a, b]);
  await expect.poll(detail.calls).toBeGreaterThan(0);

  await ui.income.fill("4,700,000");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect(page.getByText("프로필을 수정했습니다.")).toBeVisible();
  await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_700_000);

  await ui.select.selectOption(b);
  await expect(ui.income).toHaveValue("6,200,000");
  await ui.select.selectOption(a);
  await expect(ui.income).toHaveValue("4,700,000");

  const delivered = page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${a}`));
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.select).toHaveValue(a);
  await expect(ui.income).toHaveValue("4,700,000");

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(workspace(page).income).toHaveValue("4,700,000", { timeout: 30_000 });
});

test("an edit made while the PATCH is pending stays unsaved until the next explicit save", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);

  await ui.income.fill("5,000,000");
  const patch = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "PATCH");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(patch.calls).toBe(1);

  await ui.income.fill("5,500,000");
  const reloaded = waitForListResponse(page);
  patch.release();
  await reloaded;
  await settle(page);

  await expect(ui.income).toHaveValue("5,500,000");
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
  await expect(page.getByText("저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다", { exact: false })).toBeVisible();

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_500_000);
  expect(patch.calls()).toBe(2);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  await expect(workspace(page).income).toHaveValue("5,500,000", { timeout: 30_000 });
});

test("moving to B while A is saving keeps the B selection and its input", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const bName = `경합B-${tag}`;
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const ui = await openWorkspace(page, a, [a, b]);

  await ui.income.fill("5,000,000");
  const patch = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "PATCH");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(patch.calls).toBe(1);

  await ui.select.selectOption(b);
  await expect(ui.income).toHaveValue("6,200,000");
  await ui.income.fill("7,000,000");
  const reloaded = waitForListResponse(page);
  patch.release();
  await reloaded;
  await settle(page);

  await expect(ui.select).toHaveValue(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("7,000,000");
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
  expect((await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_200_000);

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, b)).profile.monthlyIncomeNet).toBe(7_000_000);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
});

test("returning to A after dropping a B edit does not ask to save A again", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, `경합B-${tag}`, 6_200_000);
  const ui = await openWorkspace(page, a, [a, b]);

  await ui.income.fill("5,000,000");
  const patch = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "PATCH");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(patch.calls).toBe(1);

  await ui.select.selectOption(b);
  await expect(ui.income).toHaveValue("6,200,000");
  await ui.income.fill("7,000,000");
  await ui.select.selectOption(a);
  const reloaded = waitForListResponse(page);
  patch.release();
  await reloaded;
  await settle(page);

  await expect(ui.select).toHaveValue(a);
  await expect(ui.income).toHaveValue("5,000,000");
  // The notice clears itself after a few seconds, so a retrying "count 0" check would pass once it
  // disappears. Match the whole notice text instead: an extra unsaved line fails, and so does no notice.
  const notice = page.getByRole("status").filter({ hasText: "프로필을 수정했습니다." });
  await expect(notice).toHaveText(/^프로필을 수정했습니다\.$/);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
  expect((await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_200_000);
});

test("create while moving to B stores the new profile once and keeps B", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const bName = `경합B-${tag}`;
  const cName = `경합C-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const ui = await openWorkspace(page, a, [a, b]);

  await ui.name.fill(cName);
  const create = await holdFirst(page, (url, method) => url.pathname === LIST_PATH && method === "POST");
  await clickAndSkipSuggestions(page, ui.createButton);
  await expect.poll(create.calls).toBe(1);

  await ui.select.selectOption(b);
  await expect(ui.name).toHaveValue(bName);
  await ui.income.fill("7,100,000");
  const reloaded = waitForListResponse(page);
  create.release();
  await reloaded;
  await settle(page);

  await expect(ui.select).toHaveValue(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("7,100,000");
  const created = (await listProfiles(request)).filter((profile) => profile.name === cName);
  expect(created).toHaveLength(1);
  await expect(ui.select.locator(`option[value="${created[0].id}"]`)).toHaveCount(1);
  expect(create.calls()).toBe(1);
  expect((await readProfile(request, a)).name).toBe(aName);
});

test("duplicate without other changes selects the saved copy", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);

  await clickAndSkipSuggestions(page, ui.duplicateButton);
  await expect(page.getByText("프로필을 복제했습니다.")).toBeVisible();

  const copies = (await listProfiles(request)).filter((profile) => profile.name === `${aName} (copy)`);
  expect(copies).toHaveLength(1);
  await expect(ui.select).toHaveValue(copies[0].id);
  await expect(ui.name).toHaveValue(`${aName} (copy)`);
});

for (const mode of ["duplicate", "create"] as const) {
  test(`${mode}: an edit while the follow-up list is pending keeps A and the next save targets A`, async ({ page, request }, testInfo) => {
    const tag = uniqueTag(testInfo.workerIndex);
    const aName = `경합A-${tag}`;
    const cName = mode === "duplicate" ? `${aName} (copy)` : `경합C-${tag}`;
    const a = await seedProfile(request, aName, 4_100_000);
    const ui = await openWorkspace(page, a, [a]);

    if (mode === "create") await ui.name.fill(cName);
    const expectedAName = mode === "create" ? cName : aName;
    const followUpList = await holdFirst(page, isListGet);
    const posted = page.waitForResponse((response) => (
      new URL(response.url()).pathname === LIST_PATH && response.request().method() === "POST"
    ));
    await clickAndSkipSuggestions(page, mode === "create" ? ui.createButton : ui.duplicateButton);
    await posted;
    await expect.poll(followUpList.calls).toBe(1);

    await ui.income.fill("5,800,000");
    const delivered = waitForListResponse(page);
    followUpList.release();
    await delivered;
    await settle(page);

    const created = (await listProfiles(request)).filter((profile) => profile.name === cName && profile.id !== a);
    expect(created).toHaveLength(1);
    await expect(ui.select.locator(`option[value="${created[0].id}"]`)).toHaveCount(1);
    await expect(ui.select).toHaveValue(a);
    await expect(ui.name).toHaveValue(expectedAName);
    await expect(ui.income).toHaveValue("5,800,000");
    await expect(page.getByText("아직 저장되지 않았습니다", { exact: false })).toBeVisible();

    const patched = page.waitForRequest((req) => req.method() === "PATCH");
    await clickAndSkipSuggestions(page, ui.saveButton);
    expect(new URL((await patched).url()).pathname).toBe(`${LIST_PATH}/${a}`);
    await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_800_000);
    expect((await readProfile(request, created[0].id)).profile.monthlyIncomeNet).toBe(4_100_000);
  });
}

test("an edit right after the PATCH is released stays on screen and unsaved", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);

  await ui.income.fill("5,000,000");
  const patch = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "PATCH");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(patch.calls).toBe(1);

  const reloaded = waitForListResponse(page);
  // Release and type without waiting in between so the edit races the response handling.
  patch.release();
  await ui.income.fill("5,600,000");
  await reloaded;
  await settle(page);

  await expect(ui.income).toHaveValue("5,600,000");
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
  await expect(page.getByText("저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다", { exact: false })).toBeVisible();
});

test("a stored selection without a server-rendered profile requests its detail once", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  let detailRequests = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && new URL(req.url()).pathname === `${LIST_PATH}/${a}`) detailRequests += 1;
  });
  await page.addInitScript((seededProfileId: string) => {
    window.localStorage.setItem("planning:v2:beginnerMode", "false");
    window.localStorage.setItem("planning:v2:selectedProfileId", seededProfileId);
  }, a);
  const initialList = waitForListResponse(page);
  await page.goto("/planning");
  await initialList;
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(a, { timeout: 30_000 });
  await expect(ui.name).toHaveValue(aName);
  await settle(page);
  expect(detailRequests).toBe(1);
});

for (const draftKind of ["valid", "invalid"] as const) {
  test(`a ${draftKind} JSON draft typed while the PATCH is pending is kept`, async ({ page, request }, testInfo) => {
    test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
    const tag = uniqueTag(testInfo.workerIndex);
    const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
    const ui = await openWorkspace(page, a, [a]);
    const editor = page.getByTestId("planning-json-editor");

    await ui.income.fill("5,000,000");
    const patch = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "PATCH");
    await clickAndSkipSuggestions(page, ui.saveButton);
    await expect.poll(patch.calls).toBe(1);

    await page.getByTestId("planning-advanced-toggle").click();
    await expect(editor).toBeVisible();
    const parsed = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
    const draft = draftKind === "valid"
      ? JSON.stringify({ ...parsed, monthlyIncomeNet: 7_777_000 }, null, 2)
      : "{ \"monthlyIncomeNet\": 7777000,";
    await editor.fill(draft);

    const reloaded = waitForListResponse(page);
    patch.release();
    await reloaded;
    await settle(page);

    await expect(editor).toHaveValue(draft);
    expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
    // The JSON draft is a content edit in the current selection, so the completion notice keeps it unsaved.
    await expect(page.getByText("저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
    if (draftKind === "invalid") {
      await expect(editor).toHaveValue(draft);
      await expect(ui.income).toHaveValue("5,000,000");
      expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
      return;
    }
    await expect(ui.income).toHaveValue("7,777,000");
    expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
    await clickAndSkipSuggestions(page, ui.saveButton);
    await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(7_777_000);
  });
}

for (const outcome of ["success", "failure"] as const) {
  test(`an older list ${outcome} cannot overwrite the list loaded after a save`, async ({ page, request }, testInfo) => {
    const tag = uniqueTag(testInfo.workerIndex);
    const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
    const ui = await openWorkspace(page, a, [a]);

    const list = await holdFirst(page, isListGet, async (route, gate) => {
      if (outcome === "success") {
        await deliverRealResponseLate(route, gate);
        return;
      }
      await gate;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "지연된 목록 실패" } }),
      });
    });

    await ui.refreshButton.click();
    await expect.poll(list.calls).toBe(1);
    // Give the held read time to reach the server before the save writes.
    await settle(page);

    await ui.income.fill("5,200,000");
    await clickAndSkipSuggestions(page, ui.saveButton);
    await expect(page.getByText("프로필을 수정했습니다.")).toBeVisible();
    await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_200_000);
    await expect(ui.income).toHaveValue("5,200,000");

    const delivered = waitForListResponse(page);
    list.release();
    await delivered;
    await settle(page);

    await expect(ui.select).toHaveValue(a);
    await expect(ui.income).toHaveValue("5,200,000");
    await expect(page.getByTestId("planning-profiles-error-state")).toHaveCount(0);
    await expect(ui.refreshButton).toBeEnabled();
  });
}
