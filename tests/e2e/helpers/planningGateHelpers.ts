import fs from "node:fs/promises";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

const TERMINAL_LABELS = new Set(["성공", "실패", "생략"]);
const GOLDEN_PROFILE_FIXTURE_DIR = path.join(process.cwd(), "tests", "fixtures", "planning", "golden", "profiles");
const GOLDEN_FIXTURE_FILES = [
  "golden-good-basic.json",
  "golden-caution-tight-cashflow.json",
  "golden-risk-negative-cashflow.json",
  "golden-caution-multi-debt-refi.json",
  "golden-risk-goals-pressure.json",
] as const;
const DEFAULT_RUN_INPUT: Record<string, unknown> = {
  horizonMonths: 120,
  assumptionsOverride: {},
  runScenarios: true,
  getActions: true,
  analyzeDebt: true,
  includeProducts: false,
  monteCarlo: null,
};

export type GoldenRunFixture = {
  id: string;
  name: string;
  profile: Record<string, unknown>;
  runInput?: Record<string, unknown>;
};

export type SeededGoldenRun = {
  fixture: GoldenRunFixture;
  runId: string;
  profileId: string;
};

function nowMs(): number {
  return Date.now();
}

function resolveBaseUrl(): string {
  return (process.env.E2E_BASE_URL || process.env.PLANNING_BASE_URL || `http://localhost:${process.env.PORT || "3100"}`)
    .trim()
    .replace(/\/+$/, "");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isRunStartResponse(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/api/planning/run";
  } catch {
    return false;
  }
}

async function ensureMigrationsReady(request: APIRequestContext): Promise<void> {
  const baseUrl = resolveBaseUrl();
  await request.get("/api/ops/doctor?action=RUN_MIGRATIONS", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/ops/doctor`,
    },
  }).catch(() => undefined);
}

async function readGoldenFixture(fileName: string): Promise<GoldenRunFixture> {
  const filePath = path.join(GOLDEN_PROFILE_FIXTURE_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  const row = asRecord(parsed);
  const id = asString(row.id);
  const name = asString(row.name);
  const profile = asRecord(row.profile);
  const runInputRaw = row.runInput === undefined ? undefined : asRecord(row.runInput);
  if (!id || !name || Object.keys(profile).length === 0) {
    throw new Error(`invalid golden fixture: ${fileName}`);
  }
  return {
    id,
    name,
    profile,
    ...(runInputRaw ? { runInput: runInputRaw } : {}),
  };
}

export async function loadGoldenFixtures(): Promise<GoldenRunFixture[]> {
  const fixtures: GoldenRunFixture[] = [];
  for (const fileName of GOLDEN_FIXTURE_FILES) {
    fixtures.push(await readGoldenFixture(fileName));
  }
  return fixtures;
}

async function seedRunWithFixture(request: APIRequestContext, fixture: GoldenRunFixture): Promise<{ runId: string; profileId: string }> {
  await ensureMigrationsReady(request);
  const baseUrl = resolveBaseUrl();
  const profileRes = await request.post("/api/planning/v2/profiles", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning`,
      "content-type": "application/json",
    },
    data: {
      name: fixture.name,
      profile: fixture.profile,
    },
  });
  const profileJson = (await profileRes.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const profileId = profileJson?.data?.id;
  if (!profileRes.ok() || !profileJson?.ok || !profileId) {
    throw new Error(`failed to seed profile: status=${profileRes.status()}`);
  }

  const runRes = await request.post("/api/planning/v2/runs", {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning`,
      "content-type": "application/json",
    },
    data: {
      profileId,
      title: `Golden Replay ${fixture.id}`,
      input: fixture.runInput ?? DEFAULT_RUN_INPUT,
    },
  });
  const runJson = (await runRes.json().catch(() => null)) as { ok?: boolean; data?: { id?: string } } | null;
  const runId = runJson?.data?.id;
  if (!runRes.ok() || !runJson?.ok || !runId) {
    throw new Error(`failed to seed run: status=${runRes.status()}`);
  }

  // Golden replay must be deterministic: Monte Carlo must remain SKIPPED.
  const runMetaRes = await request.get(`/api/planning/v2/runs/${encodeURIComponent(runId)}`, {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/planning/reports`,
    },
  });
  const runMetaJson = (await runMetaRes.json().catch(() => null)) as {
    ok?: boolean;
    data?: {
      stages?: Array<{ id?: string; status?: string }>;
    };
  } | null;
  const monteCarloStage = runMetaJson?.data?.stages?.find((stage) => stage.id === "monteCarlo");
  if (!runMetaRes.ok() || !runMetaJson?.ok || monteCarloStage?.status !== "SKIPPED") {
    throw new Error(`golden run must keep monteCarlo SKIPPED (runId=${runId})`);
  }

  return { runId, profileId };
}

export async function seedRunForReports(request: APIRequestContext): Promise<string> {
  await ensureMigrationsReady(request);
  const seeded = await seedRunWithFixture(request, {
    id: "pw-default",
    name: `PW Seed ${Date.now()}`,
    profile: {
      monthlyIncomeNet: 4_800_000,
      monthlyEssentialExpenses: 1_750_000,
      monthlyDiscretionaryExpenses: 850_000,
      liquidAssets: 2_400_000,
      investmentAssets: 7_100_000,
      debts: [
        {
          id: "demo-loan-1",
          name: "Seed Loan",
          balance: 18_000_000,
          minimumPayment: 420_000,
          aprPct: 6.2,
          remainingMonths: 84,
          repaymentType: "amortizing",
        },
      ],
      goals: [
        { id: "goal-emergency", name: "Emergency", targetAmount: 12_000_000, targetMonth: 12, priority: 5 },
      ],
    },
    runInput: DEFAULT_RUN_INPUT,
  });
  return seeded.runId;
}

export async function seedGoldenRuns(request: APIRequestContext): Promise<SeededGoldenRun[]> {
  await ensureMigrationsReady(request);
  const fixtures = await loadGoldenFixtures();
  const seeded: SeededGoldenRun[] = [];
  for (const fixture of fixtures) {
    const seededRun = await seedRunWithFixture(request, fixture);
    seeded.push({ fixture, runId: seededRun.runId, profileId: seededRun.profileId });
  }
  return seeded;
}

export async function ensurePlanningPageReady(page: Page): Promise<void> {
  await ensureMigrationsReady(page.request);
  await page.goto("/planning");
  await expect(page.getByTestId("planning-profile-form")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("run-button")).toBeVisible({ timeout: 30_000 });
}

async function alignDebtIdForOffers(page: Page): Promise<void> {
  const debtIdInput = page.getByLabel("부채 ID").first();
  await debtIdInput.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await debtIdInput.isVisible().catch(() => false)) {
    await debtIdInput.fill("demo-loan-1");
  }
  const debtAprInput = page.getByLabel("금리 (%)").first();
  await debtAprInput.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await debtAprInput.isVisible().catch(() => false)) {
    await debtAprInput.fill("0");
  }
}

async function resolvePendingSuggestions(page: Page): Promise<boolean> {
  const applySuggestedSave = page.getByRole("button", { name: "선택 적용 후 저장" });
  const keepOriginalSave = page.getByRole("button", { name: "변경 없이 저장" });
  if (await applySuggestedSave.isVisible().catch(() => false)) {
    const suggestionChecks = page.getByRole("checkbox", { name: /^\[/ });
    const checkCount = await suggestionChecks.count();
    for (let index = 0; index < checkCount; index += 1) {
      const item = suggestionChecks.nth(index);
      if (!(await item.isChecked().catch(() => false))) {
        await item.check();
      }
    }
    await applySuggestedSave.click();
    await expect(applySuggestedSave).toBeHidden({ timeout: 30_000 });
    return true;
  }
  if (await keepOriginalSave.isVisible().catch(() => false)) {
    await keepOriginalSave.click();
    await expect(keepOriginalSave).toBeHidden({ timeout: 30_000 });
    return true;
  }
  return false;
}

export async function ensureRunButtonEnabled(page: Page): Promise<void> {
  await alignDebtIdForOffers(page);

  const loadSampleButton = page.getByRole("button", { name: "샘플 프로필 불러오기" });
  if (await loadSampleButton.count()) {
    await loadSampleButton.click();
    await page.waitForTimeout(300);
    await alignDebtIdForOffers(page);
  }

  const createButton = page.getByTestId("planning-profile-create-button");
  await expect(createButton).toBeVisible({ timeout: 15_000 });
  await createButton.click();
  await page.waitForTimeout(1_000);
  await resolvePendingSuggestions(page);

  const runButton = page.getByTestId("run-button");
  await alignDebtIdForOffers(page);
  await expect(runButton).toBeEnabled({ timeout: 45_000 });
}

export async function runPlanningPipeline(page: Page): Promise<string> {
  await ensurePlanningPageReady(page);
  await ensureRunButtonEnabled(page);

  const runButton = page.getByTestId("run-button");
  const dialogMessages: string[] = [];
  const dialogHandler = async (dialog: { message(): string; dismiss(): Promise<void> }) => {
    dialogMessages.push(dialog.message());
    await dialog.dismiss();
  };
  page.on("dialog", dialogHandler);
  let started = false;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const runStart = page
        .waitForResponse(
          (response) => response.request().method() === "POST" && isRunStartResponse(response.url()),
          { timeout: 8_000 },
        )
        .then(() => true)
        .catch(() => false);
      await runButton.click();
      started = await runStart;
      if (started) break;

      const handledSuggestion = await resolvePendingSuggestions(page);
      if (!handledSuggestion) {
        await page.waitForTimeout(500);
      }
    }

    if (!started) {
      const dialogSummary = dialogMessages.length > 0 ? dialogMessages.join(" | ") : "none";
      throw new Error(`run request was not started after clicking run button (dialogs=${dialogSummary})`);
    }

    await expect(page.getByTestId("run-stages-timeline")).toBeVisible({ timeout: 10_000 });
    return waitForStageTerminal(page, "simulate", 180_000);
  } finally {
    page.off("dialog", dialogHandler);
  }
}

export async function waitForStageTerminal(page: Page, stageId: string, timeoutMs = 120_000): Promise<string> {
  const statusLocator = stageId === "simulate"
    ? page.getByTestId("stage-simulate-status")
    : page.getByTestId(`stage-${stageId}-status`);
  await expect(statusLocator).toBeVisible({ timeout: 20_000 });
  const runButton = page.getByTestId("run-button");

  const startedAt = nowMs();
  let lastValue = "";

  while (nowMs() - startedAt < timeoutMs) {
    const raw = (await statusLocator.textContent()) ?? "";
    const value = raw.trim();
    if (value.length > 0) {
      lastValue = value;
    }
    if (TERMINAL_LABELS.has(value)) {
      return value;
    }
    if (value === "대기") {
      const handledSuggestion = await resolvePendingSuggestions(page);
      if (handledSuggestion && (await runButton.isEnabled().catch(() => false))) {
        await runButton.click();
      }
    }
    await page.waitForTimeout(1_000);
  }

  throw new Error(
    `run stage '${stageId}' did not reach terminal state within ${timeoutMs}ms (last='${lastValue || "unknown"}')`,
  );
}
