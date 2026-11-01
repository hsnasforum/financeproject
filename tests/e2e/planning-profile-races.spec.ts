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
  profile: { monthlyIncomeNet: number; liquidAssets?: number };
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
  await page.goto("/planning?view=full");
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
    const followUpList = await holdFirst(page, isListGet);
    // Tracked from before the first save so a second write at any point is counted.
    const writes = trackProfileWrites(page);
    try {
      await clickAndSkipSuggestions(page, ui.saveButton);
      await expect.poll(patch.calls).toBe(1);

      await page.getByTestId("planning-advanced-toggle").click();
      await expect(editor).toBeVisible();
      const parsed = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
      const draft = draftKind === "valid"
        ? JSON.stringify({ ...parsed, monthlyIncomeNet: 7_777_000 }, null, 2)
        : "{ \"monthlyIncomeNet\": 7777000,";
      await editor.fill(draft);

      // Each response is awaited before the next hold is released, and every wait is registered first.
      const patched = page.waitForResponse((response) => (
        new URL(response.url()).pathname === `${LIST_PATH}/${a}` && response.request().method() === "PATCH"
      ));
      patch.release();
      await patched;
      await expect.poll(followUpList.calls).toBe(1);
      const reloaded = waitForListResponse(page);
      followUpList.release();
      await reloaded;
      // The JSON draft is a content edit in the current selection, so the completion notice keeps it unsaved.
      await expect(page.getByText("저장 요청 이후 입력한 내용은 아직 저장되지 않았습니다", { exact: false })).toBeVisible();
      await expect(ui.refreshButton).toBeEnabled();
      await settle(page);

      await expect(editor).toHaveValue(draft);
      await expect(ui.select).toHaveValue(a);
      await expect(ui.income).toHaveValue("5,000,000");
      expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
      expect(writes).toEqual(["PATCH"]);

      await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
      if (draftKind === "invalid") {
        await expect(page.getByTestId("planning-advanced-panel").locator("p.text-rose-700")).toBeVisible();
        await expect(editor).toHaveValue(draft);
        await expect(ui.income).toHaveValue("5,000,000");
        await settle(page);
        expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
        expect(writes).toEqual(["PATCH"]);
        return;
      }
      await expect(ui.income).toHaveValue("7,777,000");
      expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(5_000_000);
      await clickAndSkipSuggestions(page, ui.saveButton);
      await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(7_777_000);
      expect(writes).toEqual(["PATCH", "PATCH"]);
    } finally {
      patch.release();
      followUpList.release();
    }
  });
}

// Save guard: while the JSON editor holds an unapplied draft, every save path (create, update, duplicate and
// both normalization confirmations) writes nothing and keeps the draft, the form and the selection as they are.
const DRAFT_NOTICE = "JSON 편집 내용을 먼저 적용한 뒤 저장해 주세요.";
const SUGGESTION_HEADING = "입력 정규화 제안 (";
type SaveMode = "create" | "update" | "duplicate";

function saveButtonFor(ui: ReturnType<typeof workspace>, mode: SaveMode) {
  if (mode === "create") return ui.createButton;
  if (mode === "duplicate") return ui.duplicateButton;
  return ui.saveButton;
}

function isProfileWrite(mode: SaveMode, profileId: string) {
  return (url: URL, method: string) => (mode === "update"
    ? url.pathname === `${LIST_PATH}/${profileId}` && method === "PATCH"
    : url.pathname === LIST_PATH && method === "POST");
}

async function openJsonEditor(page: Page) {
  await page.getByTestId("planning-advanced-toggle").click();
  const editor = page.getByTestId("planning-json-editor");
  await expect(editor).toBeVisible();
  return editor;
}

// The stored name and whole profile of one record, plus the sorted ids of every stored profile, read from the API.
async function storedSnapshot(request: APIRequestContext, profileId: string) {
  const stored = await readProfile(request, profileId);
  const ids = (await listProfiles(request)).map((profile) => profile.id).sort();
  return { name: stored.name, profile: stored.profile, ids };
}

function jsonDrafts(current: string) {
  const parsed = JSON.parse(current) as Record<string, unknown>;
  return {
    valid: JSON.stringify({ ...parsed, monthlyIncomeNet: 7_777_000 }, null, 2),
    invalid: "{ \"monthlyIncomeNet\": 7777000,",
  };
}

// Applies a valid draft, saves it with the given mode and checks the request, the response, the follow-up list
// and the stored values.
async function applyValidDraftAndSave(
  page: Page,
  request: APIRequestContext,
  ui: ReturnType<typeof workspace>,
  editor: ReturnType<Page["getByTestId"]>,
  mode: SaveMode,
  profileId: string,
  validDraft: string,
): Promise<string> {
  if ((await editor.inputValue()) !== validDraft) await editor.fill(validDraft);
  await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
  await expect(ui.income).toHaveValue("7,777,000");
  const matches = isProfileWrite(mode, profileId);
  const sent = page.waitForRequest((req) => matches(new URL(req.url()), req.method()));
  const answered = page.waitForResponse((response) => matches(new URL(response.url()), response.request().method()));
  const relisted = waitForListResponse(page);
  await clickAndSkipSuggestions(page, saveButtonFor(ui, mode));
  const body = (await sent).postDataJSON() as { profile: { monthlyIncomeNet: number } };
  expect(body.profile.monthlyIncomeNet).toBe(7_777_000);
  const payload = (await (await answered).json()) as { ok?: boolean; data?: { id?: string } };
  expect(payload.ok).toBe(true);
  const savedId = payload.data?.id ?? "";
  if (mode === "update") expect(savedId).toBe(profileId);
  else expect(savedId).not.toBe(profileId);
  await relisted;
  await expect(ui.refreshButton).toBeEnabled();
  await expect(ui.select).toHaveValue(savedId);
  expect((await readProfile(request, savedId)).profile.monthlyIncomeNet).toBe(7_777_000);
  if (mode !== "update") expect((await readProfile(request, profileId)).profile.monthlyIncomeNet).toBe(4_100_000);
  return savedId;
}

for (const mode of ["create", "update", "duplicate"] as const) {
  for (const draftKind of ["valid", "invalid"] as const) {
    test(`${mode}: an unapplied ${draftKind} JSON draft is not saved and stays as typed until it is applied`, async ({ page, request }, testInfo) => {
      test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
      const tag = uniqueTag(testInfo.workerIndex);
      const aName = `경합A-${tag}`;
      const cName = `경합C-${tag}`;
      const a = await seedProfile(request, aName, 4_100_000);
      const ui = await openWorkspace(page, a, [a]);
      const button = saveButtonFor(ui, mode);

      if (mode === "create") await ui.name.fill(cName);
      await ui.income.fill("5,000,000");
      const writes = trackProfileWrites(page);
      const editor = await openJsonEditor(page);
      const drafts = jsonDrafts(await editor.inputValue());
      const draft = drafts[draftKind];
      await editor.fill(draft);
      const before = await storedSnapshot(request, a);
      expect(before.name).toBe(aName);
      expect(before.profile.monthlyIncomeNet).toBe(4_100_000);

      await button.click();
      await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
      await settle(page);
      expect(writes).toEqual([]);
      await expect(editor).toHaveValue(draft);
      await expect(ui.income).toHaveValue("5,000,000");
      await expect(ui.select).toHaveValue(a);
      await expect(ui.name).toHaveValue(mode === "create" ? cName : aName);
      await expect(button).toBeEnabled();
      expect(await storedSnapshot(request, a)).toEqual(before);
      expect(writes).toEqual([]);

      if (draftKind === "invalid") {
        await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
        await expect(page.getByTestId("planning-advanced-panel").locator("p.text-rose-700")).toBeVisible();
        await expect(editor).toHaveValue(draft);
        await expect(ui.income).toHaveValue("5,000,000");
        await settle(page);
        expect(await storedSnapshot(request, a)).toEqual(before);
        expect(writes).toEqual([]);
      }
      await applyValidDraftAndSave(page, request, ui, editor, mode, a, drafts.valid);
      expect(writes).toEqual([mode === "update" ? "PATCH" : "POST"]);
    });
  }
}

for (const confirmButton of ["선택 적용 후 저장", "변경 없이 저장"] as const) {
  for (const draftKind of ["valid", "invalid"] as const) {
    test(`update: "${confirmButton}" with an unapplied ${draftKind} JSON draft keeps the suggestion and writes nothing`, async ({ page, request }, testInfo) => {
      test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
      const tag = uniqueTag(testInfo.workerIndex);
      const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
      const ui = await openWorkspace(page, a, [a]);
      const cash = page.getByTestId("planning-profile-form").getByLabel("현금(예금)", { exact: false });

      // 250 with a monthly income of 4,100,000 is the liquid-assets unit suggestion (UNIT_SUSPECTED_LIQUID_ASSETS).
      await cash.fill("250");
      await expect(cash).toHaveValue("250");
      const writes = trackProfileWrites(page);
      await ui.saveButton.click();
      await expect(page.getByText(SUGGESTION_HEADING, { exact: false })).toBeVisible();
      const suggestion = page.getByRole("checkbox", { name: /유동자산이 만원 단위로 입력된 것으로 보입니다/ });
      await expect(suggestion).toBeVisible();
      await expect(suggestion).not.toBeChecked();
      const checked = confirmButton === "선택 적용 후 저장";
      if (checked) await suggestion.check();
      expect(writes).toEqual([]);

      const editor = await openJsonEditor(page);
      const draft = jsonDrafts(await editor.inputValue())[draftKind];
      await editor.fill(draft);

      const confirm = page.getByRole("button", { name: confirmButton, exact: true });
      await confirm.click();
      await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
      await settle(page);
      expect(writes).toEqual([]);
      await expect(page.getByText(SUGGESTION_HEADING, { exact: false })).toBeVisible();
      if (checked) await expect(suggestion).toBeChecked();
      else await expect(suggestion).not.toBeChecked();
      await expect(confirm).toBeEnabled();
      await expect(editor).toHaveValue(draft);
      await expect(cash).toHaveValue("250");
      await expect(ui.select).toHaveValue(a);
      const stored = await readProfile(request, a);
      expect(stored.profile.monthlyIncomeNet).toBe(4_100_000);
      expect(stored.profile.liquidAssets).toBe(2_500_000);
      expect(writes).toEqual([]);
    });
  }
}

// Form edits next to an unapplied JSON draft: the form (and its canonical JSON) follows the field, the typed draft
// and its parse error stay as they are, and only Apply (take the draft) or "초안 버리기" (take the form) ends it.
const DISCARD_DRAFT_BUTTON = "초안 버리기";

function cashField(page: Page) {
  return page.getByTestId("planning-profile-form").getByLabel("현금(예금)", { exact: false });
}

function draftError(page: Page) {
  return page.getByTestId("planning-advanced-panel").locator("p.text-rose-700");
}

// A valid draft has no error (typing clears it); an invalid draft carries the exact non-empty text set by Apply.
async function expectDraftError(page: Page, errorText: string | null) {
  if (errorText === null) await expect(draftError(page)).toHaveCount(0);
  else await expect(draftError(page)).toHaveText(errorText);
}

async function typeDraft(page: Page, draftKind: "valid" | "invalid") {
  const editor = await openJsonEditor(page);
  const drafts = jsonDrafts(await editor.inputValue());
  const draft = drafts[draftKind];
  await editor.fill(draft);
  let errorText: string | null = null;
  if (draftKind === "invalid") {
    await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
    await expect(draftError(page)).toHaveCount(1);
    errorText = (await draftError(page).textContent()) ?? "";
    expect(errorText.trim().length).toBeGreaterThan(0);
  }
  await expectDraftError(page, errorText);
  return { editor, draft, drafts, errorText };
}

for (const draftKind of ["valid", "invalid"] as const) {
  test(`form edits keep an unapplied ${draftKind} JSON draft and its error, and saving stays blocked`, async ({ page, request }, testInfo) => {
    test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
    const tag = uniqueTag(testInfo.workerIndex);
    const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
    const ui = await openWorkspace(page, a, [a]);
    const writes = trackProfileWrites(page);
    const { editor, draft, errorText } = await typeDraft(page, draftKind);
    const before = await storedSnapshot(request, a);

    // Two form edits in a row (income, then cash): both show up in the form, the draft does not move.
    await ui.income.fill("6,100,000");
    await cashField(page).fill("3,000,000");
    await expect(ui.income).toHaveValue("6,100,000");
    await expect(cashField(page)).toHaveValue("3,000,000");
    await expect(editor).toHaveValue(draft);
    await expectDraftError(page, errorText);

    await ui.saveButton.click();
    await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
    await settle(page);
    await expect(editor).toHaveValue(draft);
    await expectDraftError(page, errorText);
    await expect(ui.income).toHaveValue("6,100,000");
    await expect(ui.select).toHaveValue(a);
    expect(await storedSnapshot(request, a)).toEqual(before);
    expect(writes).toEqual([]);
  });

  test(`discarding an unapplied ${draftKind} JSON draft after form edits restores the form JSON and saving works`, async ({ page, request }, testInfo) => {
    test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
    const tag = uniqueTag(testInfo.workerIndex);
    const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
    const ui = await openWorkspace(page, a, [a]);
    const writes = trackProfileWrites(page);
    const { editor } = await typeDraft(page, draftKind);

    await ui.income.fill("6,100,000");
    await cashField(page).fill("3,000,000");
    await page.getByRole("button", { name: DISCARD_DRAFT_BUTTON, exact: true }).click();

    // The editor now shows the current form as canonical JSON; no error is left; nothing was written yet.
    const restored = JSON.parse(await editor.inputValue()) as { monthlyIncomeNet?: number; liquidAssets?: number };
    expect(restored.monthlyIncomeNet).toBe(6_100_000);
    expect(restored.liquidAssets).toBe(3_000_000);
    await expectDraftError(page, null);
    await expect(ui.income).toHaveValue("6,100,000");
    expect(writes).toEqual([]);

    const sent = page.waitForRequest((req) => req.method() === "PATCH" && new URL(req.url()).pathname === `${LIST_PATH}/${a}`);
    await clickAndSkipSuggestions(page, ui.saveButton);
    const body = (await sent).postDataJSON() as { profile: { monthlyIncomeNet: number; liquidAssets: number } };
    expect(body.profile.monthlyIncomeNet).toBe(6_100_000);
    expect(body.profile.liquidAssets).toBe(3_000_000);
    await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(6_100_000);
    expect((await readProfile(request, a)).profile.liquidAssets).toBe(3_000_000);
    expect(writes).toEqual(["PATCH"]);
  });
}

// Same task: two real DOM input events (editor, then income field) dispatched back to back in one evaluate call,
// so no Playwright step and no paint lies between them. React handles each discrete event; no hook internals used.
test("a JSON draft and a form edit dispatched in the same task keep the draft and apply the form edit", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const writes = trackProfileWrites(page);
  const editor = await openJsonEditor(page);
  const draft = jsonDrafts(await editor.inputValue()).valid;
  const editorHandle = await editor.elementHandle();
  const incomeHandle = await ui.income.elementHandle();
  await page.evaluate(([area, input, text]) => {
    // Fail loudly if the targets are not the JSON textarea and the income input; never dispatch to anything else.
    if (!(area instanceof HTMLTextAreaElement) || !(input instanceof HTMLInputElement)) {
      throw new Error("same-task targets are not the JSON editor textarea and the income input");
    }
    const setArea = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setArea || !setInput) throw new Error("native value setters are unavailable");
    setArea.call(area, text);
    area.dispatchEvent(new Event("input", { bubbles: true }));
    setInput.call(input, "6100000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, [editorHandle, incomeHandle, draft] as const);

  await expect(ui.income).toHaveValue("6,100,000");
  await expect(editor).toHaveValue(draft);
  await expectDraftError(page, null);
  await ui.saveButton.click();
  await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
  await settle(page);
  await expectDraftError(page, null);
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
});

test("applying a valid JSON draft after form edits takes the draft values", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const writes = trackProfileWrites(page);
  const { editor } = await typeDraft(page, "valid");

  await cashField(page).fill("3,000,000");
  await page.getByRole("button", { name: "Apply JSON", exact: true }).click();

  // Apply is the explicit choice of the draft: its income (7,777,000) and its cash (the seeded 2,500,000) win.
  await expect(ui.income).toHaveValue("7,777,000");
  await expect(cashField(page)).toHaveValue("2,500,000");
  const applied = JSON.parse(await editor.inputValue()) as { monthlyIncomeNet?: number };
  expect(applied.monthlyIncomeNet).toBe(7_777_000);
  expect(writes).toEqual([]);

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(7_777_000);
  expect((await readProfile(request, a)).profile.liquidAssets).toBe(2_500_000);
  expect(writes).toEqual(["PATCH"]);
});

test("form edits without a JSON draft keep the editor in sync with the form (control)", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const writes = trackProfileWrites(page);
  const editor = await openJsonEditor(page);

  await ui.income.fill("6,100,000");
  await cashField(page).fill("3,000,000");
  const synced = JSON.parse(await editor.inputValue()) as { monthlyIncomeNet?: number; liquidAssets?: number };
  expect(synced.monthlyIncomeNet).toBe(6_100_000);
  expect(synced.liquidAssets).toBe(3_000_000);

  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(6_100_000);
  expect(writes).toEqual(["PATCH"]);
});

test("switching profiles shows the selected profile's JSON instead of an unapplied draft (control)", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, `경합B-${tag}`, 6_200_000);
  const ui = await openWorkspace(page, a, [a, b]);
  const writes = trackProfileWrites(page);
  const { editor } = await typeDraft(page, "valid");

  // Existing contract: an explicit selection change loads the selected profile; the draft is not carried over.
  await ui.select.selectOption(b);
  await expect(ui.income).toHaveValue("6,200,000");
  await expect.poll(async () => (JSON.parse(await editor.inputValue()) as { monthlyIncomeNet?: number }).monthlyIncomeNet)
    .toBe(6_200_000);
  await settle(page);
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
  expect((await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_200_000);
});

// JSON editor error accessibility: an error is one role=alert element whose id the editor names in
// aria-describedby, with aria-invalid="true"; without an error the editor has neither attribute and no alert.
function draftAlert(page: Page) {
  return page.getByTestId("planning-advanced-panel").getByRole("alert");
}

async function expectEditorErrorLinked(page: Page, errorText: string) {
  const alert = draftAlert(page);
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveText(errorText);
  const alertId = (await alert.getAttribute("id")) ?? "";
  expect(alertId).not.toBe("");
  await expect(page.locator(`[id="${alertId}"]`)).toHaveCount(1);
  const editor = page.getByTestId("planning-json-editor");
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await expect(editor).toHaveAttribute("aria-describedby", alertId);
}

async function expectEditorErrorCleared(page: Page) {
  await expect(draftAlert(page)).toHaveCount(0);
  const editor = page.getByTestId("planning-json-editor");
  await expect(editor).not.toHaveAttribute("aria-invalid");
  await expect(editor).not.toHaveAttribute("aria-describedby");
}

test("an invalid JSON Apply error is an alert linked to the editor and stays linked after form edits", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const writes = trackProfileWrites(page);
  const { errorText } = await typeDraft(page, "invalid");
  await expectEditorErrorLinked(page, errorText ?? "");

  await ui.income.fill("6,100,000");
  await cashField(page).fill("3,000,000");
  await expect(ui.income).toHaveValue("6,100,000");
  await expectEditorErrorLinked(page, errorText ?? "");
  await settle(page);
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
});

test("an invalid JSON error link clears after discarding the draft and after applying a valid draft", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const writes = trackProfileWrites(page);
  const { editor, drafts, errorText } = await typeDraft(page, "invalid");
  await expectEditorErrorLinked(page, errorText ?? "");

  // Path 1: discard.
  await page.getByRole("button", { name: DISCARD_DRAFT_BUTTON, exact: true }).click();
  await expectEditorErrorCleared(page);

  // Path 2: a new invalid Apply links again, then a valid draft applied explicitly clears it.
  await editor.fill(drafts.invalid);
  await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
  await expectEditorErrorLinked(page, errorText ?? "");
  await editor.fill(drafts.valid);
  await page.getByRole("button", { name: "Apply JSON", exact: true }).click();
  await expect(ui.income).toHaveValue("7,777,000");
  await expectEditorErrorCleared(page);
  await settle(page);
  expect(writes).toEqual([]);
});

test("the JSON editor has no error state before any Apply (control)", async ({ page, request }, testInfo) => {
  test.skip(process.env.PLANNING_DEBUG_ENABLED !== "true", "JSON editor is only rendered with --debug-pages");
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  await openWorkspace(page, a, [a]);
  const editor = await openJsonEditor(page);
  await expectEditorErrorCleared(page);
  await editor.fill(jsonDrafts(await editor.inputValue()).valid);
  await expectEditorErrorCleared(page);
});

// Automatic fallback: when the requested or stored selection is missing (or empty), the late list picks the first
// saved profile. That move must not replace unsaved content edits (quick start, sample, typing) made meanwhile.
type QuickStartValues = { income: string; fixed: string };

async function applyQuickStartDraft(page: Page, values: QuickStartValues) {
  const gate = page.getByTestId("planning-quickstart-gate");
  await expect(gate).toBeVisible({ timeout: 30_000 });
  await gate.getByLabel("월 실수령액(원)").fill(values.income);
  await gate.getByLabel("월 고정지출(원)").fill(values.fixed);
  await gate.getByLabel("목표 이름").fill("간단시작 목표");
  await gate.getByLabel("목표 금액(원)").fill("10,000,000");
  await gate.getByLabel("목표까지 남은 개월").fill("12");
  await gate.getByTestId("planning-quickstart-open-preview").click();
  await page.getByTestId("planning-quickstart-apply").click();
  await expect(page.getByTestId("planning-quickstart-applied-state")).toContainText("초안 적용 완료");
}

function trackProfileWrites(page: Page) {
  const writes: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith(LIST_PATH) && ["POST", "PATCH", "DELETE"].includes(req.method())) writes.push(req.method());
  });
  return writes;
}

async function beginWithSelection(page: Page, options: { beginner: boolean; storedId?: string; queryId?: string }) {
  await page.addInitScript(({ beginner, storedId }: { beginner: boolean; storedId: string }) => {
    window.localStorage.setItem("planning:v2:beginnerMode", beginner ? "true" : "false");
    if (storedId) window.localStorage.setItem("planning:v2:selectedProfileId", storedId);
    else window.localStorage.removeItem("planning:v2:selectedProfileId");
  }, { beginner: options.beginner, storedId: options.storedId ?? "" });
  await page.goto(options.queryId ? `/planning?profileId=${encodeURIComponent(options.queryId)}` : "/planning?view=full");
}

function missingProfileId(tag: string) {
  return `missing-${tag}-0000-0000`;
}

test("quick start applied while the list for a missing requested profile is pending keeps the draft unsaved", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const writes = trackProfileWrites(page);
  const list = await holdFirst(page, isListGet);
  await beginWithSelection(page, { beginner: true, queryId: missingProfileId(tag) });
  await expect.poll(list.calls).toBe(1);

  await applyQuickStartDraft(page, { income: "3,300,000", fixed: "1,400,000" });
  const ui = workspace(page);
  await expect(ui.income).toHaveValue("3,300,000");

  const delivered = waitForListResponse(page);
  list.release();
  await delivered;
  await settle(page);

  await expect(ui.income).toHaveValue("3,300,000");
  await expect(page.getByTestId("planning-profile-form").getByLabel("필수지출")).toHaveValue("1,400,000");
  await expect(ui.select).toHaveValue("");
  await expect(page.getByTestId("planning-quickstart-followthrough-summary")).not.toContainText("프로필 저장 완료");
  await expect(page.getByTestId("planning-quickstart-applied-state")).toContainText("이제 프로필 저장만 하면 됩니다");
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
});

test("an edit made while the list for a deleted stored selection is pending survives the fallback", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const writes = trackProfileWrites(page);
  const list = await holdFirst(page, isListGet);
  await beginWithSelection(page, { beginner: false, storedId: missingProfileId(tag) });
  await expect.poll(list.calls).toBe(1);

  const ui = workspace(page);
  await ui.income.fill("3,900,000");
  const delivered = waitForListResponse(page);
  list.release();
  await delivered;
  await settle(page);

  await expect(ui.income).toHaveValue("3,900,000");
  await expect(ui.select).toHaveValue("");
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
});

test("a quick start draft survives a failed list and a retry without new input", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const writes = trackProfileWrites(page);
  const list = await holdFirst(page, isListGet, async (route, gate) => {
    await gate;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "지연된 목록 실패" } }),
    });
  });
  await beginWithSelection(page, { beginner: true, queryId: missingProfileId(tag) });
  await expect.poll(list.calls).toBe(1);

  await applyQuickStartDraft(page, { income: "3,400,000", fixed: "1,500,000" });
  const ui = workspace(page);
  const failed = waitForListResponse(page);
  list.release();
  await failed;
  await expect(page.getByTestId("planning-profiles-error-state")).toBeVisible();
  await expect(ui.income).toHaveValue("3,400,000");

  const retried = waitForListResponse(page);
  await ui.refreshButton.click();
  await retried;
  await settle(page);

  await expect(ui.income).toHaveValue("3,400,000");
  await expect(ui.select).toHaveValue("");
  await expect(page.getByTestId("planning-quickstart-applied-state")).toContainText("이제 프로필 저장만 하면 됩니다");
  expect(writes).toEqual([]);
});

test("an explicit selection after quick start loads the selected saved profile", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const b = await seedProfile(request, `경합B-${tag}`, 6_200_000);
  const writes = trackProfileWrites(page);
  await beginWithSelection(page, { beginner: true, queryId: b });
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(b, { timeout: 30_000 });
  await expect(ui.select.locator(`option[value="${a}"]`)).toHaveCount(1, { timeout: 30_000 });
  await expect(ui.refreshButton).toBeEnabled({ timeout: 30_000 });

  await applyQuickStartDraft(page, { income: "3,500,000", fixed: "1,500,000" });
  await expect(ui.income).toHaveValue("3,500,000");
  await ui.select.selectOption(a);
  await expect(ui.name).toHaveValue(aName);
  await expect(ui.income).toHaveValue("4,100,000");
  await settle(page);

  await expect(ui.select).toHaveValue(a);
  expect(writes).toEqual([]);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
  expect((await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_200_000);
});

test("a quick start applied before the stored selection's detail arrives never writes the server-rendered name to it", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const bName = `경합B-${tag}`;
  // Seeded first so that, in a fresh store, the server default is not B.
  await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const list = await holdFirst(page, isListGet);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${b}` && method === "GET");
  // No query: the server renders its default profile while the browser restores the stored selection B.
  await beginWithSelection(page, { beginner: true, storedId: b });
  await expect.poll(list.calls).toBe(1);
  await expect.poll(detail.calls).toBe(1);
  const ui = workspace(page);
  const renderedName = await ui.name.inputValue();
  test.skip(renderedName === bName, "the server default is already B; the mixed state cannot occur");

  await applyQuickStartDraft(page, { income: "3,600,000", fixed: "1,500,000" });
  const delivered = Promise.all([waitForListResponse(page), page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${b}`))]);
  list.release();
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.income).toHaveValue("3,600,000");
  const selected = await ui.select.inputValue();
  if (selected === b) await expect(ui.name).toHaveValue(bName);
  const save = selected ? ui.saveButton : ui.createButton;
  await clickAndSkipSuggestions(page, save);
  await settle(page);
  expect((await readProfile(request, b)).name).toBe(bName);
});

test("after a normal save, a failed list and a retry without edits may fall back to a saved profile", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  await ui.income.fill("4,300,000");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect(page.getByText("프로필을 수정했습니다.")).toBeVisible();
  await expect.poll(async () => (await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_300_000);

  const list = await holdFirst(page, isListGet, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "목록 실패" } }),
    });
  });
  await ui.refreshButton.click();
  await expect.poll(list.calls).toBe(1);
  await expect(page.getByTestId("planning-profiles-error-state")).toBeVisible();

  const retried = waitForListResponse(page);
  await ui.refreshButton.click();
  await retried;
  await settle(page);

  const selected = await ui.select.inputValue();
  expect(selected).not.toBe("");
  const stored = await readProfile(request, selected);
  await expect(ui.name).toHaveValue(stored.name);
  await expect(ui.income).toHaveValue(stored.profile.monthlyIncomeNet.toLocaleString("en-US"));
});

test("after a normal save, focusing a field alone does not block the fallback after a failed list", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const a = await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  await ui.income.fill("4,400,000");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect(page.getByText("프로필을 수정했습니다.")).toBeVisible();
  await ui.income.focus();

  const list = await holdFirst(page, isListGet, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "목록 실패" } }),
    });
  });
  await ui.refreshButton.click();
  await expect.poll(list.calls).toBe(1);
  await expect(page.getByTestId("planning-profiles-error-state")).toBeVisible();

  const retried = waitForListResponse(page);
  await ui.refreshButton.click();
  await retried;
  await settle(page);

  const selected = await ui.select.inputValue();
  expect(selected).not.toBe("");
  const stored = await readProfile(request, selected);
  await expect(ui.name).toHaveValue(stored.name);
});

test("quick start on a valid selection keeps the draft over a late detail response (control)", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const writes = trackProfileWrites(page);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${a}` && method === "GET");
  await beginWithSelection(page, { beginner: true, queryId: a, storedId: a });
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(a, { timeout: 30_000 });
  await expect.poll(detail.calls).toBe(1);

  await applyQuickStartDraft(page, { income: "3,700,000", fixed: "1,500,000" });
  const delivered = page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${a}`));
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.select).toHaveValue(a);
  await expect(ui.name).toHaveValue(aName);
  await expect(ui.income).toHaveValue("3,700,000");
  expect(writes).toEqual([]);
});

test("a late list for a missing requested profile without edits still falls back to a saved profile (control)", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const list = await holdFirst(page, isListGet);
  await beginWithSelection(page, { beginner: false, queryId: missingProfileId(tag) });
  await expect.poll(list.calls).toBe(1);

  const delivered = waitForListResponse(page);
  list.release();
  await delivered;
  await settle(page);

  const ui = workspace(page);
  const selected = await ui.select.inputValue();
  expect(selected).not.toBe("");
  const stored = await readProfile(request, selected);
  await expect(ui.name).toHaveValue(stored.name);
  await expect(ui.income).toHaveValue(stored.profile.monthlyIncomeNet.toLocaleString("en-US"));
});

// Review 181: a save made while the restored selection's values are still loading must not write the
// server-rendered profile's name or values into it.
function trackPatchedProfileIds(page: Page) {
  const patched: string[] = [];
  page.on("request", (req) => {
    const pathname = new URL(req.url()).pathname;
    if (req.method() === "PATCH" && pathname.startsWith(`${LIST_PATH}/`)) patched.push(pathname.slice(LIST_PATH.length + 1));
  });
  return patched;
}

async function openRestoredSelectionWhileLoading(page: Page, request: APIRequestContext, tag: string, beginner: boolean) {
  const bName = `경합B-${tag}`;
  // Seeded first so that, in a fresh store, the server default is not B.
  await seedProfile(request, `경합A-${tag}`, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const list = await holdFirst(page, isListGet);
  const detail = await holdFirst(page, (url, method) => url.pathname === `${LIST_PATH}/${b}` && method === "GET");
  await beginWithSelection(page, { beginner, storedId: b });
  await expect.poll(list.calls).toBe(1);
  await expect.poll(detail.calls).toBe(1);
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(b);
  return { b, bName, list, detail, ui, renderedName: await ui.name.inputValue() };
}

test("a save right after quick start, before the restored selection's values arrive, keeps the draft and leaves that profile unchanged", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const patched = trackPatchedProfileIds(page);
  const { b, bName, list, detail, ui, renderedName } = await openRestoredSelectionWhileLoading(page, request, tag, true);
  test.skip(renderedName === bName, "the server default is already B; the mixed state cannot occur");

  await applyQuickStartDraft(page, { income: "3,800,000", fixed: "1,500,000" });
  await clickAndSkipSuggestions(page, ui.saveButton);
  await settle(page);

  expect(patched).not.toContain(b);
  const storedB = await readProfile(request, b);
  expect(storedB.name).toBe(bName);
  expect(storedB.profile.monthlyIncomeNet).toBe(6_200_000);
  await expect(ui.income).toHaveValue("3,800,000");
  await expect(page.getByRole("alert").filter({ hasText: "그 프로필에 저장하지 않았습니다" })).toBeVisible();
  await expect(ui.select).toHaveValue("");

  const delivered = Promise.all([waitForListResponse(page), page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${b}`))]);
  list.release();
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.income).toHaveValue("3,800,000");
  // Saving again after the responses: the draft goes to whatever save path the screen offers, never into B.
  const existingIds = new Set((await listProfiles(request)).map((profile) => profile.id));
  const selected = await ui.select.inputValue();
  await clickAndSkipSuggestions(page, selected ? ui.saveButton : ui.createButton);
  await settle(page);
  expect(patched).not.toContain(b);
  const storedBAfter = await readProfile(request, b);
  expect(storedBAfter.name).toBe(bName);
  expect(storedBAfter.profile.monthlyIncomeNet).toBe(6_200_000);
  if (!selected) {
    const created = (await listProfiles(request)).filter((profile) => !existingIds.has(profile.id));
    expect(created).toHaveLength(1);
    expect(created[0].profile.monthlyIncomeNet).toBe(3_800_000);
  }
});

test("a save without edits before the restored selection's values arrive does not write the server-rendered values into it", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const patched = trackPatchedProfileIds(page);
  const { b, bName, list, detail, ui, renderedName } = await openRestoredSelectionWhileLoading(page, request, tag, false);
  test.skip(renderedName === bName, "the server default is already B; the mixed state cannot occur");

  await clickAndSkipSuggestions(page, ui.saveButton);
  await settle(page);
  expect(patched).not.toContain(b);
  expect((await readProfile(request, b)).name).toBe(bName);
  await expect(page.getByRole("alert").filter({ hasText: "불러오는 중이라 저장하지 않았습니다" })).toBeVisible();

  const delivered = Promise.all([waitForListResponse(page), page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${b}`))]);
  list.release();
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.select).toHaveValue(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("6,200,000");
  const storedB = await readProfile(request, b);
  expect(storedB.name).toBe(bName);
  expect(storedB.profile.monthlyIncomeNet).toBe(6_200_000);
});

test("running before the restored selection loads never writes another profile's draft into it", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const patched = trackPatchedProfileIds(page);
  const runRequests: string[] = [];
  // Stop the unrelated run creation boundary if the unsafe profile sync gets past its guard.
  // Profile reads and writes remain real, so a failure exposes the stored profile overwrite.
  await page.route((url) => url.pathname === "/api/planning/v2/runs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    runRequests.push(route.request().method());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INPUT", message: "실행 요청 경계까지 도달했습니다." } }),
    });
  });
  const { b, bName, list, detail, ui, renderedName } = await openRestoredSelectionWhileLoading(page, request, tag, true);

  try {
    expect(renderedName).not.toBe(bName);
    await applyQuickStartDraft(page, { income: "3,800,000", fixed: "1,500,000" });
    const warningConsent = page.locator("#planning-run-warning-confirm-checkbox");
    if (await warningConsent.isVisible()) await warningConsent.check();
    const runButton = page.getByTestId("run-button");
    const workspaceAlerts = page.getByRole("main").getByRole("alert");
    await expect(runButton).toBeEnabled();
    await expect(ui.select).toHaveValue(b);
    await expect(workspaceAlerts).toHaveCount(0);
    // Observe the profile-write boundary directly. A rejected sync must report why it stopped;
    // an unsafe sync is observed as soon as its real PATCH completes, without waiting for list/run work.
    const outcome = Promise.race([
      page.waitForResponse((response) => response.request().method() === "PATCH"
        && new URL(response.url()).pathname === `${LIST_PATH}/${b}`).then(() => "patch" as const),
      workspaceAlerts.filter({ hasText: "프로필" }).waitFor().then(() => "guard" as const),
    ]);
    await runButton.click();
    const observedOutcome = await outcome;

    const storedB = await readProfile(request, b);
    expect(storedB.profile.monthlyIncomeNet).toBe(6_200_000);
    expect(storedB.name).toBe(bName);
    expect(observedOutcome).toBe("guard");
    expect(patched).not.toContain(b);
    expect(runRequests).toEqual([]);
    await expect(ui.income).toHaveValue("3,800,000");

    const delivered = Promise.all([waitForListResponse(page), page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${b}`))]);
    list.release();
    detail.release();
    await delivered;
    await settle(page);

    await expect(ui.income).toHaveValue("3,800,000");
    expect((await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_200_000);
  } finally {
    list.release();
    detail.release();
  }
});

test("running after its profile loads still saves that profile's edits", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const ui = await openWorkspace(page, a, [a]);
  const runProfileIds: string[] = [];
  await page.route((url) => url.pathname === "/api/planning/v2/runs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    runProfileIds.push((route.request().postDataJSON() as { profileId: string }).profileId);
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { code: "INPUT", message: "실행 요청 경계까지 도달했습니다." } }),
    });
  });

  await ui.income.fill("5,300,000");
  const warningConsent = page.locator("#planning-run-warning-confirm-checkbox");
  if (await warningConsent.isVisible()) await warningConsent.check();
  const runButton = page.getByTestId("run-button");
  await expect(runButton).toBeEnabled();
  const patched = page.waitForResponse((response) => response.request().method() === "PATCH"
    && new URL(response.url()).pathname === `${LIST_PATH}/${a}`);
  await runButton.click();
  expect((await patched).ok()).toBe(true);
  const storedA = await readProfile(request, a);
  expect(storedA.profile.monthlyIncomeNet).toBe(5_300_000);
  expect(storedA.name).toBe(aName);
  await expect.poll(() => runProfileIds).toEqual([a]);
});

test("focusing a field while the restored selection loads still shows its stored values once they arrive", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const patched = trackPatchedProfileIds(page);
  const { b, bName, list, detail, ui, renderedName } = await openRestoredSelectionWhileLoading(page, request, tag, false);
  test.skip(renderedName === bName, "the server default is already B; the mixed state cannot occur");

  await ui.income.focus();
  const delivered = Promise.all([waitForListResponse(page), page.waitForResponse((response) => response.url().endsWith(`${LIST_PATH}/${b}`))]);
  list.release();
  detail.release();
  await delivered;
  await settle(page);

  await expect(ui.select).toHaveValue(b);
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("6,200,000");
  expect(patched).toEqual([]);
});

test("once the restored selection has loaded, editing and saving it still updates it (control)", async ({ page, request }, testInfo) => {
  const tag = uniqueTag(testInfo.workerIndex);
  const aName = `경합A-${tag}`;
  const bName = `경합B-${tag}`;
  const a = await seedProfile(request, aName, 4_100_000);
  const b = await seedProfile(request, bName, 6_200_000);
  const patched = trackPatchedProfileIds(page);
  const initialList = waitForListResponse(page);
  await beginWithSelection(page, { beginner: false, storedId: b });
  await initialList;
  const ui = workspace(page);
  await expect(ui.select).toHaveValue(b, { timeout: 30_000 });
  await expect(ui.name).toHaveValue(bName);
  await expect(ui.income).toHaveValue("6,200,000");

  await ui.income.fill("6,500,000");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_500_000);
  expect((await readProfile(request, b)).name).toBe(bName);

  await ui.select.selectOption(a);
  await expect(ui.name).toHaveValue(aName);
  await ui.select.selectOption(b);
  await expect(ui.name).toHaveValue(bName);
  await ui.income.fill("6,600,000");
  await clickAndSkipSuggestions(page, ui.saveButton);
  await expect.poll(async () => (await readProfile(request, b)).profile.monthlyIncomeNet).toBe(6_600_000);
  expect(patched.filter((id) => id === b)).toHaveLength(2);
  expect((await readProfile(request, a)).profile.monthlyIncomeNet).toBe(4_100_000);
});

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
