import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEFAULT_PLANNING_POLICY } from "../../src/lib/planning/catalog/planningPolicy";
import { buildResultSummaryMetrics } from "../../src/lib/planning/v2/resultSummary";

test("one zero-cash run keeps scoped diagnosis through save reopen and printable output", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(120_000);
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  const headers = { origin: baseURL!, referer: baseURL! + "/planning" };
  const csrf = (await request.storageState()).cookies.find((cookie) => cookie.name === "dev_csrf")?.value;
  const created = await request.post("/api/planning/v2/profiles", { headers, data: {
    name: "진단 표시 검토용 합성 프로필",
    profile: { monthlyIncomeNet: 4_800_000, monthlyEssentialExpenses: 2_300_000, monthlyDiscretionaryExpenses: 0,
      liquidAssets: 0, investmentAssets: 0, debts: [],
      // Synthetic fixture. The emergency target is sized for the 6-month emergency fund standard
      // (EMERGENCY_FUND_TARGET_MONTHS, 2026-10-14) so the three basic metrics stay GOOD; 4-month CAUTION
      // and the 5.99/6-month boundaries are covered by tests/planning/v2/insights/diagnosisAssessment.test.ts.
      goals: [{ id: "trust-goal", name: "검토용 비상금", targetAmount: 15_000_000, currentAmount: 0, targetMonth: 12 }] },
    ...(csrf ? { csrf } : {}),
  } });
  expect(created.ok()).toBeTruthy();
  const profileId = (await created.json()).data.id as string;
  await page.goto("/planning?profileId=" + profileId);
  const form = page.getByTestId("planning-profile-form");
  await expect(form.getByLabel("월 실수령")).toHaveValue("4,800,000");
  await expect(form.getByLabel("목표 이름", { exact: true })).toHaveValue("검토용 비상금");
  const runResponsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/planning/v2/runs");
  const runButton = page.getByTestId("run-button");
  await expect(runButton).toBeEnabled();
  await runButton.click();
  const runResponse = await runResponsePromise;
  expect(runResponse.ok()).toBeTruthy();
  const runId = (await runResponse.json()).data.id as string;
  const readRun = async () => {
    const response = await request.get("/api/planning/v2/runs/" + runId, { headers });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  const before = await readRun();
  expect(before.outputs.resultDto.summary.worstCashKrw).toBe(0);
  // Fixture preconditions on the stored run, using the product's own summary metrics and policy:
  // basic metrics GOOD (emergency fund >= caution months, DSR below caution, positive surplus),
  // while the zero worst-cash month alone makes the overall assessment RISK.
  const policy = DEFAULT_PLANNING_POLICY;
  const metrics = buildResultSummaryMetrics(before.outputs.resultDto);
  const preconditions = {
    emergencyFundMonths: metrics.emergencyFundMonths,
    dsrPct: metrics.dsrPct ?? before.outputs.resultDto.summary.dsrPct,
    monthlySurplusKrw: metrics.monthlySurplusKrw,
    worstCashKrw: before.outputs.resultDto.summary.worstCashKrw,
  };
  console.log(`[fixture-preconditions] ${JSON.stringify(preconditions)}`);
  await testInfo.attach("fixture-preconditions", { contentType: "application/json", body: JSON.stringify(preconditions) });
  expect(preconditions.emergencyFundMonths).toBeGreaterThanOrEqual(policy.emergencyFundMonths.caution);
  expect(preconditions.dsrPct).toBeLessThan(policy.dsr.cautionPct);
  expect(preconditions.monthlySurplusKrw).toBeGreaterThan(policy.monthlySurplusKrw.riskMax);
  const workspace = page.getByTestId("diagnosis-assessment").first();
  await expect(workspace).toBeVisible();
  await expect(workspace).toHaveAttribute("data-state", "RISK");
  await expect(workspace).toContainText("위험 신호 있음");
  await expect(workspace).toContainText("기본 지표 판정: 양호");
  await expect(workspace).toContainText("기간 중 최저 현금");
  const workspaceText = await workspace.innerText();
  await testInfo.attach("workspace-desktop", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  await page.goto("/planning/reports?runId=" + runId);
  const brief = page.getByTestId("saved-report-brief");
  await expect(brief).toContainText("위험 신호 있음");
  await expect(brief).toContainText("기본 지표 판정: 양호");
  await expect(brief).not.toContainText("정기 점검만 이어가면 됩니다");
  const reportAssessment = brief.getByTestId("diagnosis-assessment");
  // innerText keeps the block separators; the saved/reopened copies below are compared the same way.
  const scopedText = await reportAssessment.innerText();
  expect(workspaceText.replace(/\s/g, "")).toContain(scopedText.replace(/\s/g, ""));
  await page.getByTestId("report-save-button").click();
  const detailLink = page.getByTestId("report-saved-detail-link");
  await expect(detailLink).toBeVisible();
  const detailPath = await detailLink.getAttribute("href");
  expect(detailPath).toMatch(/^\/planning\/reports\//);
  await page.getByTestId("report-advanced-toggle").click();
  const archive = page.locator(".report-root");
  await expect(archive.getByRole("heading", { name: "리포트 목록" })).toBeVisible();
  // The archive ID column shows report.id.slice(0, 8), which is "report-2" for every `report-<date>-…` id,
  // so earlier reports of the shared E2E user make the label ambiguous. The list is newest-first
  // (reports/storage.ts), and the opened report is checked by its full id.
  const reportId = detailPath!.split("/").pop()!;
  await archive.getByRole("button", { name: reportId.slice(0, 8), exact: true }).first().click();
  await expect(archive).toContainText("ID: " + reportId);
  await expect(archive.getByTestId("diagnosis-assessment")).toContainText("기본 지표 판정: 양호");
  await expect(archive.getByTestId("diagnosis-assessment")).toHaveAttribute("data-state", "RISK");
  await detailLink.click();
  await expect(page.getByTestId("saved-report-record")).toBeVisible();
  await expect(page.getByTestId("saved-report-brief").getByTestId("diagnosis-assessment")).toHaveText(scopedText, { useInnerText: true });
  await page.reload();
  await expect(page.getByTestId("saved-report-brief").getByTestId("diagnosis-assessment")).toHaveText(scopedText, { useInnerText: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("saved-report-brief")).toContainText("기본 지표 판정: 양호");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await testInfo.attach("saved-mobile", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  const reopened = await page.context().newPage();
  await reopened.goto(detailPath!);
  await expect(reopened.getByTestId("saved-report-brief").getByTestId("diagnosis-assessment")).toHaveText(scopedText, { useInnerText: true });
  await reopened.close();

  const output = await request.get("/api/planning/v2/runs/" + runId + "/report", { headers });
  expect(output.ok()).toBeTruthy();
  const html = await output.text();
  expect(html).toContain("위험 신호 있음");
  expect(html).toContain("기본 지표 판정: 양호");
  expect(html).toContain("기간 중 최저 현금");
  await page.goto("/api/planning/v2/runs/" + runId + "/report");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("기본 지표 판정: 양호", { exact: true })).toBeVisible();
  await testInfo.attach("print-output", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  expect(await readRun()).toEqual(before);
  expect(exceptions).toEqual([]);
  await testInfo.attach("same-run-preserved", { contentType: "application/json", body: JSON.stringify({
    profileId, runId, detailPath, worstCashKrw: 0, riskSignal: true, basicMetrics: "GOOD",
    runSha256: createHash("sha256").update(JSON.stringify(before)).digest("hex"), unchangedAfterReopenAndPrint: true,
  }) });
});
