import type { APIRequestContext, Locator } from "@playwright/test";
import { expect, test } from "./helpers/e2eTest";

const RUN_INPUT = {
  horizonMonths: 24,
  assumptionsOverride: {},
  runScenarios: false,
  getActions: false,
  analyzeDebt: false,
  includeProducts: false,
  monteCarlo: null,
};

function baseUrl(): string {
  const configured = (
    process.env.E2E_EXTERNAL_BASE_URL
    || process.env.BASE_URL
    || process.env.E2E_BASE_URL
    || process.env.PLANNING_BASE_URL
    || ""
  ).trim().replace(/\/+$/, "");
  if (configured) return configured;
  return `http://127.0.0.1:${(process.env.PORT || "3126").trim() || "3126"}`;
}

async function devCsrf(request: APIRequestContext): Promise<string> {
  const state = await request.storageState().catch(() => null);
  return state?.cookies.find((cookie) => cookie.name === "dev_csrf")?.value?.trim() ?? "";
}

async function createProfile(request: APIRequestContext, name = `확인창 프로필 ${Date.now()}`): Promise<string> {
  const origin = baseUrl();
  const csrf = await devCsrf(request);
  const response = await request.post("/api/planning/v2/profiles", {
    headers: { origin, referer: `${origin}/planning`, "content-type": "application/json" },
    data: {
      name,
      profile: {
        monthlyIncomeNet: 4_000_000,
        monthlyEssentialExpenses: 1_800_000,
        monthlyDiscretionaryExpenses: 600_000,
        liquidAssets: 2_000_000,
        investmentAssets: 3_000_000,
        debts: [],
        goals: [],
      },
      ...(csrf ? { csrf } : {}),
    },
  });
  const payload = await response.json() as { ok?: boolean; data?: { id?: string } };
  if (!response.ok() || !payload.ok || !payload.data?.id) throw new Error("profile seed failed");
  return payload.data.id;
}

async function createRun(request: APIRequestContext, profileId: string, title: string): Promise<string> {
  const origin = baseUrl();
  const csrf = await devCsrf(request);
  const response = await request.post("/api/planning/v2/runs", {
    headers: { origin, referer: `${origin}/planning/runs`, "content-type": "application/json" },
    data: { profileId, title, input: RUN_INPUT, ...(csrf ? { csrf } : {}) },
  });
  const payload = await response.json() as { ok?: boolean; data?: { id?: string } };
  if (!response.ok() || !payload.ok || !payload.data?.id) throw new Error("run seed failed");
  return payload.data.id;
}

async function deleteProfile(request: APIRequestContext, profileId: string): Promise<void> {
  const origin = baseUrl();
  const csrf = await devCsrf(request);
  await request.delete(`/api/planning/v2/profiles/${encodeURIComponent(profileId)}`, {
    headers: { origin, referer: `${origin}/planning`, "content-type": "application/json" },
    data: { confirmText: `DELETE profile ${profileId}`, ...(csrf ? { csrf } : {}) },
  });
}

async function deleteRunToTrash(request: APIRequestContext, runId: string): Promise<void> {
  const origin = baseUrl();
  const csrf = await devCsrf(request);
  const response = await request.delete(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, {
    headers: { origin, referer: `${origin}/planning/runs`, "content-type": "application/json" },
    data: { confirmText: `DELETE run ${runId}`, ...(csrf ? { csrf } : {}) },
  });
  if (!response.ok()) throw new Error("run trash seed failed");
}

async function confirmationInput(dialog: Locator) {
  const input = dialog.locator("input");
  await expect(input).toHaveValue("");
  return input;
}

test("profile delete confirmation resets across close and target change and submits once", async ({ page, request }) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const firstProfileId = await createProfile(request, `확인 프로필 A ${suffix}`);
  const secondProfileId = await createProfile(request, `확인 프로필 B ${suffix}`);
  let deleteRequests = 0;
  let submittedBody: Record<string, unknown> | null = null;

  await page.addInitScript((profileId) => {
    window.localStorage.setItem("planning:v2:selectedProfileId", profileId);
  }, firstProfileId);
  await page.route(/\/api\/planning\/v2\/profiles(?:\/[^/?]+)?(?:\?|$)/, async (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      deleteRequests += 1;
      submittedBody = request.postDataJSON() as Record<string, unknown>;
    }
    await route.continue();
  });

  try {
    await page.goto(`/planning?profileId=${encodeURIComponent(firstProfileId)}`);
    const profileForm = page.getByTestId("planning-profile-form");
    const profileSelect = profileForm.getByLabel("프로필 선택");
    const deleteButton = profileForm.getByRole("button", { name: "삭제", exact: true });
    await expect(profileSelect).toHaveValue(firstProfileId, { timeout: 30_000 });

    let dialog = page.getByRole("dialog", { name: "프로필 삭제 확인" });
    await expect(async () => {
      if (!await dialog.isVisible()) await deleteButton.click();
      await expect(dialog.locator("input")).toHaveValue("", { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    let input = await confirmationInput(dialog);
    const submit = dialog.getByRole("button", { name: "삭제 진행" });
    await expect(submit).toBeDisabled();
    await input.fill("WRONG");
    await expect(submit).toBeDisabled();
    expect(deleteRequests).toBe(0);
    await dialog.getByRole("button", { name: "취소" }).click();

    await deleteButton.click();
    dialog = page.getByRole("dialog", { name: "프로필 삭제 확인" });
    await confirmationInput(dialog);
    await expect(dialog.getByText(`DELETE profile ${firstProfileId}`, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "취소" }).click();

    await profileSelect.selectOption(secondProfileId);
    await expect(profileSelect).toHaveValue(secondProfileId);
    await deleteButton.click();
    dialog = page.getByRole("dialog", { name: "프로필 삭제 확인" });
    input = await confirmationInput(dialog);
    const expectedConfirm = `DELETE profile ${secondProfileId}`;
    await expect(dialog.getByText(expectedConfirm, { exact: true })).toBeVisible();
    await input.fill(expectedConfirm);
    await expect(dialog.getByRole("button", { name: "삭제 진행" })).toBeEnabled();
    await dialog.getByRole("button", { name: "삭제 진행" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    expect(deleteRequests).toBe(1);
    expect(submittedBody).toMatchObject({ confirmText: expectedConfirm });
  } finally {
    await deleteProfile(request, firstProfileId);
    await deleteProfile(request, secondProfileId);
  }
});

test("run delete confirmation resets for another run and sends no wrong-input request", async ({ page, request }) => {
  const profileId = await createProfile(request);
  const firstTitle = `확인 실행 A ${Date.now()}`;
  const secondTitle = `확인 실행 B ${Date.now()}`;
  const firstRunId = await createRun(request, profileId, firstTitle);
  const secondRunId = await createRun(request, profileId, secondTitle);
  let deleteRequests = 0;
  let submittedBody: Record<string, unknown> | null = null;

  await page.route(/\/api\/planning\/v2\/runs\/[^/?]+(?:\?|$)/, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    deleteRequests += 1;
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { deleted: true, softDeleted: true } }) });
  });

  try {
    await page.goto(`/planning/runs?profileId=${encodeURIComponent(profileId)}`);
    const table = page.getByTestId("planning-runs-table");
    await expect(table).toHaveAttribute("data-ready", "true");
    const firstRow = table.locator("tr", { hasText: firstTitle });
    const secondRow = table.locator("tr", { hasText: secondTitle });

    await firstRow.getByRole("button", { name: "삭제", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "실행 기록 삭제 확인" });
    let input = await confirmationInput(dialog);
    await input.fill(`DELETE run ${firstRunId}`);
    await dialog.getByRole("button", { name: "취소" }).click();

    await secondRow.getByRole("button", { name: "삭제", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "실행 기록 삭제 확인" });
    input = await confirmationInput(dialog);
    await expect(dialog.getByText(`DELETE run ${secondRunId}`, { exact: true })).toBeVisible();
    await input.fill("WRONG");
    await expect(dialog.getByRole("button", { name: "휴지통으로 이동" })).toBeDisabled();
    expect(deleteRequests).toBe(0);
    await input.fill(`DELETE run ${secondRunId}`);
    await dialog.getByRole("button", { name: "휴지통으로 이동" }).click();
    await expect(dialog).toBeHidden();

    expect(deleteRequests).toBe(1);
    expect(submittedBody).toMatchObject({ confirmText: `DELETE run ${secondRunId}` });
  } finally {
    await page.unroute(/\/api\/planning\/v2\/runs\/[^/?]+(?:\?|$)/).catch(() => undefined);
    await deleteProfile(request, profileId);
  }
});

test("trash restore confirmation resets for another target and submits exactly once", async ({ page, request }) => {
  const profileId = await createProfile(request);
  const firstRunId = await createRun(request, profileId, `휴지통 확인 A ${Date.now()}`);
  const secondRunId = await createRun(request, profileId, `휴지통 확인 B ${Date.now()}`);
  await deleteRunToTrash(request, firstRunId);
  await deleteRunToTrash(request, secondRunId);
  let restoreRequests = 0;
  let submittedBody: Record<string, unknown> | null = null;

  await page.route("**/api/planning/v2/trash/restore", async (route) => {
    restoreRequests += 1;
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { restored: true } }) });
  });

  try {
    await page.goto("/planning/trash");
    await page.waitForLoadState("networkidle");
    const trashResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/planning/v2/trash");
    await page.getByRole("button", { name: "새로고침" }).click();
    await trashResponse;
    const firstRow = page.locator("tr", { hasText: firstRunId });
    const secondRow = page.locator("tr", { hasText: secondRunId });
    await expect(firstRow).toBeVisible();

    await firstRow.getByRole("button", { name: "복구", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "휴지통 항목 복구" });
    let input = await confirmationInput(dialog);
    await input.fill(`RESTORE runs ${firstRunId}`);
    await dialog.getByRole("button", { name: "취소" }).click();

    await secondRow.getByRole("button", { name: "복구", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "휴지통 항목 복구" });
    input = await confirmationInput(dialog);
    await expect(dialog.getByText(`RESTORE runs ${secondRunId}`, { exact: true })).toBeVisible();
    await input.fill("WRONG");
    await expect(dialog.getByRole("button", { name: "복구하기" })).toBeDisabled();
    expect(restoreRequests).toBe(0);
    await input.fill(`RESTORE runs ${secondRunId}`);
    await dialog.getByRole("button", { name: "복구하기" }).click();
    await expect(dialog).toBeHidden();

    expect(restoreRequests).toBe(1);
    expect(submittedBody).toMatchObject({
      kind: "runs",
      id: secondRunId,
      confirmText: `RESTORE runs ${secondRunId}`,
    });
  } finally {
    await deleteProfile(request, profileId);
  }
});
