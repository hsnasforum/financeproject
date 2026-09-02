import { readFile } from "node:fs/promises";
import { expect, test } from "./helpers/e2eTest";

type RequestProfile = {
  kind: "deposit" | "saving";
  topN: number;
  rateMode: "max" | "base" | "simple";
  candidatePool: "unified";
  candidateSources: Array<"finlife" | "datago_kdb">;
  depositProtection: "any" | "prefer" | "require";
  weights: { rate: number; term: number; liquidity: number };
};

const SAVED_RUNS_KEY = "finance:recommend:v2:playwright-local:saved-runs";

function responseFor(profile: RequestProfile) {
  return {
    ok: true,
    meta: {
      userId: "playwright-local",
      authSource: "trusted-header",
      kind: profile.kind,
      topN: profile.topN,
      rateMode: profile.rateMode,
      candidatePool: profile.candidatePool,
      candidateSources: profile.candidateSources,
      depositProtection: profile.depositProtection,
      weights: profile.weights,
      weightNormalization: { applied: false, originalSum: 1, reason: "none" },
      assumptions: {
        rateSelectionPolicy: "테스트 금리 정책",
        liquidityPolicy: "테스트 유동성 정책",
        normalizationPolicy: "테스트 정규화 정책",
      },
    },
    items: [{
      unifiedId: "finlife:SNAPSHOT-1",
      sourceId: "finlife",
      kind: profile.kind,
      finPrdtCd: "SNAPSHOT-1",
      providerName: "스냅샷은행",
      productName: "스냅샷예금",
      finalScore: 80,
      selectedOption: {
        saveTrm: "12",
        termMonths: 12,
        appliedRate: 3.5,
        baseRate: 3.2,
        maxRate: 3.5,
        rateSource: "intr_rate2",
        reasons: [],
      },
      breakdown: [
        { key: "rate", label: "금리", raw: 1, weight: profile.weights.rate, contribution: profile.weights.rate, reason: "테스트" },
        { key: "term", label: "기간", raw: 1, weight: profile.weights.term, contribution: profile.weights.term, reason: "테스트" },
        { key: "liquidity", label: "유동성", raw: 1, weight: profile.weights.liquidity, contribution: profile.weights.liquidity, reason: "테스트" },
      ],
      reasons: ["조회 프로필 스냅샷 테스트"],
    }],
  };
}

test("recommend save and exports stay bound to the submitted profile snapshot", async ({ page }) => {
  const requests: RequestProfile[] = [];
  let downloadCount = 0;
  page.on("download", () => {
    downloadCount += 1;
  });

  await page.route(/\/api\/recommend(?:\?|$)/, async (route) => {
    const profile = route.request().postDataJSON() as RequestProfile;
    requests.push(profile);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseFor(profile)),
    });
  });
  await page.route("**/api/sources/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) });
  });

  await page.goto("/recommend");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "가중치 설정" }).click();

  const sliders = page.locator('input[type="range"]');
  await sliders.nth(0).fill("0.7");
  await sliders.nth(1).fill("0.2");
  await sliders.nth(2).fill("0.1");
  await page.getByTestId("recommend-submit").click();

  await expect(page.getByTestId("recommend-results")).toBeVisible();
  await expect(page.getByText("조회 가중치 · 금리 70% · 기간 20% · 유동성 10%", { exact: true })).toBeVisible();
  expect(requests[0]?.weights.rate).toBeCloseTo(0.7, 12);
  expect(requests[0]?.weights.term).toBeCloseTo(0.2, 12);
  expect(requests[0]?.weights.liquidity).toBeCloseTo(0.1, 12);

  await sliders.nth(0).fill("0.6");

  await expect(page.getByText("조건이 변경되어 이 결과는 이전 조회 기준입니다. 다시 조회한 뒤 저장하거나 내보내 주세요.", { exact: true })).toBeVisible();
  const saveButton = page.getByRole("button", { name: "결과 저장" });
  const jsonButton = page.getByRole("button", { name: "JSON" });
  const csvButton = page.getByRole("button", { name: "CSV" });
  await expect(saveButton).toBeDisabled();
  await expect(jsonButton).toBeDisabled();
  await expect(csvButton).toBeDisabled();
  await saveButton.evaluate((button: HTMLButtonElement) => button.click());
  await jsonButton.evaluate((button: HTMLButtonElement) => button.click());
  await csvButton.evaluate((button: HTMLButtonElement) => button.click());
  expect(downloadCount).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVED_RUNS_KEY)).toBeNull();

  await page.getByRole("button", { name: "기본값 복원" }).click();
  await expect(page.getByText("조건이 변경되어 이 결과는 이전 조회 기준입니다. 다시 조회한 뒤 저장하거나 내보내 주세요.", { exact: true })).toBeVisible();

  await page.getByTestId("recommend-submit").click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByText("조회 가중치 · 금리 55% · 기간 30% · 유동성 15%", { exact: true })).toBeVisible();
  await expect(page.getByText("조건이 변경되어 이 결과는 이전 조회 기준입니다. 다시 조회한 뒤 저장하거나 내보내 주세요.", { exact: true })).toHaveCount(0);
  await expect(saveButton).toBeEnabled();
  await expect(jsonButton).toBeEnabled();
  await expect(csvButton).toBeEnabled();

  await saveButton.click();
  const savedRuns = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), SAVED_RUNS_KEY) as Array<{
    profile: { weights: RequestProfile["weights"] };
  }>;
  expect(savedRuns[0]?.profile.weights).toEqual(requests[1]?.weights);

  const jsonDownloadPromise = page.waitForEvent("download");
  await jsonButton.click();
  const jsonDownload = await jsonDownloadPromise;
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const jsonExport = JSON.parse(await readFile(jsonPath!, "utf8")) as { profile: { weights: RequestProfile["weights"] } };
  expect(jsonExport.profile.weights).toEqual(requests[1]?.weights);

  const csvDownloadPromise = page.waitForEvent("download");
  await csvButton.click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  expect(csvPath).not.toBeNull();
  const csv = await readFile(csvPath!, "utf8");
  const [headerLine, valueLine] = csv.trim().split("\n");
  const headers = headerLine.split(",");
  const values = valueLine.split(",");
  expect(values[headers.indexOf("weightRate")]).toBe(String(requests[1]?.weights.rate));
  expect(values[headers.indexOf("weightTerm")]).toBe(String(requests[1]?.weights.term));
  expect(values[headers.indexOf("weightLiquidity")]).toBe(String(requests[1]?.weights.liquidity));
});
