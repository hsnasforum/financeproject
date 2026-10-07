import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { comparePlanVsActual, loadPlanVsActualRuns } from "../src/lib/planning/v3/service/planVsActual";
import { buildResultDtoV1FromRunRecord } from "../src/lib/planning/v2/resultDto";
import { PlanVsActualComparison } from "../src/app/planning/v3/profile/drafts/[id]/_components/PlanVsActualSection";

const row = (ym = "2026-02", incomeKrw = 5_200_000, fixedExpenseKrw = 2_600_000, variableExpenseKrw = 700_000, debtExpenseKrw = 500_000) =>
  ({ ym, incomeKrw, fixedExpenseKrw, variableExpenseKrw, debtExpenseKrw });
const point = { label: "start", monthIndex: 0, incomeKrw: 5_000_000, expensesKrw: 2_800_000, debtPaymentKrw: 500_000 };
const run = (overrides: object = {}) => ({ id: "run-a", profileId: "a", overallStatus: "SUCCESS", createdAt: "2026-01-15T00:00:00.000Z",
  input: {}, outputs: { resultDto: { version: 1, timeline: { points: [point] } } }, ...overrides });
const compare = (rows: unknown[] = [row()], runs: unknown[] = [run()]) => comparePlanVsActual("a", { ymStats: rows }, runs);

afterEach(() => vi.unstubAllGlobals());
describe("transaction plan vs actual", () => {
  it("compares A's four metrics, excludes debt from living and renders observed +200,000", () => {
    const evidence = { ymStats: [row(), row("2026-03")] };
    const runs = [run()];
    const before = JSON.stringify({ evidence, runs });
    const result = comparePlanVsActual("a", evidence, runs);
    expect(result).toEqual({ status: "ready", runId: "run-a", createdAt: run().createdAt, months: ["2026-02", "2026-03"],
      plan: { incomeKrw: 5_000_000, livingExpenseKrw: 2_800_000, debtPaymentKrw: 500_000, operatingCashflowKrw: 1_700_000 },
      actual: { incomeKrw: 5_200_000, livingExpenseKrw: 2_800_000, debtPaymentKrw: 500_000, operatingCashflowKrw: 1_900_000 },
      delta: { incomeKrw: 200_000, livingExpenseKrw: 0, debtPaymentKrw: 0, operatingCashflowKrw: 200_000 } });
    const html = renderToStaticMarkup(<PlanVsActualComparison comparison={result} />);
    for (const text of ["최근 거래 2개월 중앙값", "생활지출(부채 제외)", "5,000,000원", "5,200,000원", "2,800,000원", "500,000원", "1,700,000원", "1,900,000원", "+200,000원", "200,000원 높습니다.", "일치하지 않을 수 있습니다."]) expect(html).toContain(text);
    expect(JSON.stringify({ evidence, runs })).toBe(before);
  });
  it("takes the median of monthly operating values, not the difference of metric medians", () => {
    const result = compare([row("2026-02", 10_000_000, 9_000_000, 0, 0), row("2026-03", 2_000_000, 0, 0, 0), row("2026-04", 4_000_000, 1_000_000, 0, 0)]);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.actual.operatingCashflowKrw).toBe(2_000_000);
    expect(result.actual.incomeKrw - result.actual.livingExpenseKrw - result.actual.debtPaymentKrw).toBe(3_000_000);
  });
  it("excludes the saved month and selects the latest normal completed run before an observed month", () => {
    const result = compare([row("2026-01", 90_000_000), row(), row("2026-03")], [
      run({ id: "same-last-month", createdAt: "2026-03-01T00:00:00Z" }),
      run({ id: "feb", createdAt: "2026-02-20T00:00:00Z" }), run(),
    ]);
    expect(result).toMatchObject({ status: "ready", runId: "feb", months: ["2026-03"], actual: { incomeKrw: 5_200_000 } });
    expect(compare([row("2026-01")])).toEqual({ status: "no-post-plan-months" });
    expect(compare([row("2025-12")])).toEqual({ status: "no-post-plan-months" });
  });
  it.each([
    { profileId: "b" }, { overallStatus: "FAILED" }, { overallStatus: "RUNNING" }, { overallStatus: undefined },
    { input: { scenario: { patch: [] } } }, { scenario: { title: "legacy what-if" } }, { createdAt: "bad" },
  ])("excludes unsuitable baseline %j without falling back to current profile", (override) => {
    expect(compare(undefined, [run(override)])).toEqual({ status: "no-plan" });
    expect(compare(undefined, [run({ ...override, id: "invalid-newer", createdAt: override.createdAt ?? "2026-01-31T00:00:00Z" }), run()]))
      .toMatchObject({ status: "ready", runId: "run-a" });
  });
  it("accepts PARTIAL_SUCCESS and genuine zero start values", () => {
    expect(compare(undefined, [run({ overallStatus: "PARTIAL_SUCCESS" })])).toMatchObject({ status: "ready" });
    expect(compare(undefined, [run({ outputs: { resultDto: { version: 1, timeline: { points: [{ ...point, incomeKrw: 0, expensesKrw: 0, debtPaymentKrw: 0 }] } } } })]))
      .toMatchObject({ status: "ready", plan: { operatingCashflowKrw: 0 } });
  });
  it.each([undefined, null, "5000000", NaN, Infinity])("does not turn an absent or invalid legacy metric %s into zero", (incomeKrw) => {
    const result = compare(undefined, [run({ outputs: { resultDto: { version: 1, timeline: { points: [{ ...point, incomeKrw }] } } } })]);
    expect(result).toEqual({ status: "missing-plan-metrics" });
    expect(renderToStaticMarkup(<PlanVsActualComparison comparison={result} />)).not.toContain("0원");
  });
  it("does not silently use an older complete metric set or a non-start point", () => {
    expect(compare(undefined, [run({ id: "newer", createdAt: "2026-01-31T00:00:00Z", outputs: {} }), run()]))
      .toEqual({ status: "missing-plan-metrics" });
    for (const start of [{ ...point, label: "end" }, { ...point, monthIndex: 12 }]) {
      expect(compare(undefined, [run({ outputs: { resultDto: { version: 1, timeline: { points: [start] } } } })]))
        .toEqual({ status: "missing-plan-metrics" });
    }
  });
  it.each([undefined, {}, { medians: { incomeKrw: 5_200_000 } }, { ymStats: [] }])("does not infer actuals without monthly evidence %j", (evidence) => {
    expect(comparePlanVsActual("a", evidence, [run()])).toEqual({ status: "no-evidence" });
  });
  it.each([[null], [{ ...row(), debtExpenseKrw: undefined }], [row(), row()], [{ ...row(), ym: "2026-13" }], [{ ...row(), incomeKrw: "5200000" }]].map((rows) => ({ rows })))("rejects ambiguous evidence %j", ({ rows }) => {
    expect(compare(rows)).toEqual({ status: "invalid-evidence" });
  });
  it("clamps non-debt fixed to zero and independently rounds even medians", () => {
    expect(compare([row("2026-02", 100, 10, 5, 20), row("2026-03", 101, 10, 5, 20)]))
      .toMatchObject({ actual: { incomeKrw: 101, livingExpenseKrw: 5, debtPaymentKrw: 20, operatingCashflowKrw: 76 } });
  });
  it.each([{ income: 4_700_000, text: "300,000원 낮습니다." }, { income: 5_000_000, text: "계획 기준과 같습니다." }])("renders operating summary $text without inventing causes", ({ income, text }) => {
    expect(renderToStaticMarkup(<PlanVsActualComparison comparison={compare([row("2026-02", income)])} />)).toContain(text);
  });
  it("uses UTC month consistently at an offset boundary", () => {
    expect(compare(undefined, [run({ createdAt: "2026-02-01T00:30:00+09:00" })])).toMatchObject({ status: "ready", months: ["2026-02"] });
  });
  it("canonicalizes legacy timeline without manufacturing zero cashflow fields", () => {
    const dto = buildResultDtoV1FromRunRecord({ createdAt: run().createdAt, input: {}, meta: {},
      outputs: { simulate: { keyTimelinePoints: [{ monthIndex: 0, row: { income: 5_000_000, cash: 100 } }] } } });
    expect(dto.timeline.points[0]).toMatchObject({ label: "start", incomeKrw: 5_000_000 });
    expect(dto.timeline.points[0]).not.toHaveProperty("expensesKrw");
    expect(dto.timeline.points[0]).not.toHaveProperty("debtPaymentKrw");
    expect(compare(undefined, [run({ outputs: { resultDto: dto } })])).toEqual({ status: "missing-plan-metrics" });
  });
  it.each(["keyTimelinePoints", "timelineSampled"])("vetoes a previously materialized zero DTO when retained %s proves missing metrics", (field) => {
    const resultDto = { version: 1, timeline: { points: [{ ...point, incomeKrw: 0, expensesKrw: 0, debtPaymentKrw: 0 }] } };
    const simulate = { [field]: [{ monthIndex: 0, row: { cash: 100 } }] };
    expect(compare(undefined, [run({ outputs: { resultDto, simulate } })])).toEqual({ status: "missing-plan-metrics" });
    expect(compare(undefined, [run({ outputs: { resultDto: { ...resultDto, raw: { simulate } } } })]))
      .toEqual({ status: "missing-plan-metrics" });
    expect(compare(undefined, [run({ outputs: { resultDto, simulate: { [field]: [{ monthIndex: 0,
      row: { income: 0, expenses: 0, debtPayment: 0 } }] } } })])).toMatchObject({ status: "ready" });
  });
});

describe("existing run API comparison reader", () => {
  it("reads all nonempty pages, including short pages, using only same-origin GET", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: [run({ id: "page-1" })] }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: [run({ id: "page-2" })] }))
      .mockResolvedValueOnce(Response.json({ ok: true, data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await loadPlanVsActualRuns("a & b", signal, "csrf")).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i += 1) {
      const [url, init] = fetcher.mock.calls[i];
      expect(new URL(url, "http://localhost").searchParams.get("profileId")).toBe("a & b");
      expect(new URL(url, "http://localhost").searchParams.get("offset")).toBe(String(i * 100));
      expect(init).toEqual({ cache: "no-store", credentials: "same-origin", signal });
    }
  });
  it("rejects a later page failure instead of comparing a partial history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: [run()] }))
      .mockResolvedValueOnce(Response.json({ ok: false }, { status: 500 })));
    await expect(loadPlanVsActualRuns("a", new AbortController().signal)).rejects.toThrow("run-list-failed");
  });
  it("fails safely if pagination repeats without progress", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ ok: true, data: [run()] })));
    await expect(loadPlanVsActualRuns("a", new AbortController().signal)).rejects.toThrow("pagination-stalled");
  });
});
