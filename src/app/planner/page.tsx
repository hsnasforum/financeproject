"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  DEFAULT_PLANNER_ASSUMPTIONS,
  clampPlannerAssumptions,
} from "@/lib/planner/compute";
import type {
  PlannerAssumptions,
  PlannerDebt,
  PlannerGoal,
  PlannerInput,
  PlannerMetricLine,
  PlannerResult,
} from "@/lib/planner/types";

type ComputeResponse = {
  ok: boolean;
  result?: PlannerResult;
  error?: {
    message?: string;
    issues?: string[];
  };
};

const STORAGE_KEY = "planner:last";
const LAST_SNAPSHOT_KEY = "planner_last_snapshot_v1";

const DEFAULT_INPUT: PlannerInput = {
  monthlyIncomeNet: 3500000,
  monthlyFixedExpenses: 1200000,
  monthlyVariableExpenses: 700000,
  liquidAssets: 5000000,
  otherAssets: 0,
  debts: [
    { name: "신용대출", balance: 12000000, aprPct: 11.5, monthlyPayment: 350000 },
  ],
  goals: [
    { name: "비상예비자금 보강", targetAmount: 3000000, horizonMonths: 12 },
  ],
};

function fmtKrw(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString()}원`;
}

function fmtPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function fmtMonths(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}개월`;
}

function toDisplay(metric: PlannerMetricLine): string {
  if (metric.unit === "KRW") return fmtKrw(metric.value);
  if (metric.unit === "PCT") return fmtPct(metric.value);
  if (metric.unit === "MONTHS") return fmtMonths(metric.value);
  if (metric.unit === "COUNT") return metric.value === null ? "-" : `${Math.round(metric.value)}개`;
  return metric.value === null ? "-" : String(metric.value);
}

function parseNum(value: string): number {
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function priorityClass(priority: "high" | "mid" | "low"): string {
  if (priority === "high") return "bg-rose-100 text-rose-700 border-rose-200";
  if (priority === "mid") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function nearestPreferredTerm(value?: number | null): 3 | 6 | 12 | 24 | 36 {
  const allowed = [3, 6, 12, 24, 36] as const;
  if (!value || !Number.isFinite(value)) return 12;
  let best: (typeof allowed)[number] = 12;
  let bestDiff = Math.abs(value - best);
  for (const term of allowed.slice(1)) {
    const diff = Math.abs(value - term);
    if (diff < bestDiff) {
      best = term;
      bestDiff = diff;
    }
  }
  return best;
}

function buildPlannerDeepLinks(
  input: PlannerInput,
  assumptions: PlannerAssumptions,
  result: PlannerResult,
): {
  recommendHref: string;
  productsHref: string;
  summary: string;
} {
  const preferredTerm = nearestPreferredTerm(
    input.goals.find((goal) => (goal.horizonMonths ?? 0) > 0)?.horizonMonths ?? null,
  );
  const emergencyGap = result.emergencyPlan.gap;
  const debtRatioPct = result.metrics.find((metric) => metric.key === "debtServiceRatioPct")?.value ?? null;
  const hasHighDebt = result.debtPlan.highInterestDebts.length > 0;

  const purpose = emergencyGap > 0 ? "emergency" : "seed-money";
  const liquidityPref = emergencyGap > 0 ? "high" : preferredTerm >= 24 ? "low" : "mid";
  const rateMode = (hasHighDebt || (debtRatioPct !== null && debtRatioPct >= assumptions.dsrWarnPct)) ? "simple" : "max";

  const recommendParams = new URLSearchParams();
  recommendParams.set("from", "planner");
  recommendParams.set("autorun", "1");
  recommendParams.set("purpose", purpose);
  recommendParams.set("kind", "deposit");
  recommendParams.set("preferredTerm", String(preferredTerm));
  recommendParams.set("liquidityPref", liquidityPref);
  recommendParams.set("rateMode", rateMode);
  recommendParams.set("topN", "5");

  const productParams = new URLSearchParams();
  productParams.set("from", "planner");
  productParams.set("preferredTerm", String(preferredTerm));
  productParams.set("purpose", purpose);
  productParams.set("scan", "page");
  productParams.set("topFinGrpNo", "020000");
  productParams.set("pageNo", "1");

  return {
    recommendHref: `/recommend?${recommendParams.toString()}`,
    productsHref: `/products/deposit?${productParams.toString()}`,
    summary: `목적 ${purpose === "emergency" ? "비상금" : "목돈"} · 기간 ${preferredTerm}개월 · 유동성 ${liquidityPref} · 금리정책 ${rateMode}`,
  };
}

export default function PlannerPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState<PlannerInput>(DEFAULT_INPUT);
  const [assumptions, setAssumptions] = useState<PlannerAssumptions>(DEFAULT_PLANNER_ASSUMPTIONS);
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [assumptionOpen, setAssumptionOpen] = useState(false);
  const deepLinks = result ? buildPlannerDeepLinks(input, assumptions, result) : null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { input?: PlannerInput; assumptions?: Partial<PlannerAssumptions> };
      if (parsed.input) setInput(parsed.input);
      if (parsed.assumptions) setAssumptions(clampPlannerAssumptions(parsed.assumptions));
    } catch {
      // ignore malformed data
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, assumptions }));
  }, [input, assumptions]);

  function setInputNumber<K extends keyof PlannerInput>(key: K, value: string) {
    setInput((prev) => ({ ...prev, [key]: parseNum(value) }));
  }

  function updateDebt(index: number, patch: Partial<PlannerDebt>) {
    setInput((prev) => {
      const next = [...prev.debts];
      next[index] = { ...next[index], ...patch };
      return { ...prev, debts: next };
    });
  }

  function updateGoal(index: number, patch: Partial<PlannerGoal>) {
    setInput((prev) => {
      const next = [...prev.goals];
      next[index] = { ...next[index], ...patch };
      return { ...prev, goals: next };
    });
  }

  async function runCompute() {
    setLoading(true);
    setError("");
    setIssues([]);
    try {
      const res = await fetch("/api/planner/compute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, assumptions }),
      });
      const json = (await res.json()) as ComputeResponse;
      if (!res.ok || !json.ok || !json.result) {
        setResult(null);
        setError(json.error?.message ?? "계산에 실패했습니다.");
        setIssues(json.error?.issues ?? []);
        return;
      }
      setResult(json.result);
      localStorage.setItem(
        LAST_SNAPSHOT_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          input,
          result: json.result,
        }),
      );
    } catch {
      setError("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function resetAll() {
    setInput(DEFAULT_INPUT);
    setAssumptions(DEFAULT_PLANNER_ASSUMPTIONS);
    setResult(null);
    setError("");
    setIssues([]);
  }

  function exportJson() {
    const payload = JSON.stringify({ input, assumptions }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as {
          input?: PlannerInput;
          assumptions?: Partial<PlannerAssumptions>;
        };
        if (parsed.input) setInput(parsed.input);
        if (parsed.assumptions) setAssumptions(clampPlannerAssumptions(parsed.assumptions));
      } catch {
        setError("JSON 가져오기에 실패했습니다.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] py-10 md:py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4">
      <Card>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">재무설계 MVP (규칙 기반)</h1>
        <p className="mt-2 text-sm text-slate-600">오프라인 동작 · 가정값 편집 · 설명가능 계산. 확정 수익/보장을 의미하지 않습니다.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">월 소득(세후)
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={input.monthlyIncomeNet} onChange={(e) => setInputNumber("monthlyIncomeNet", e.target.value)} />
          </label>
          <label className="text-sm">월 고정지출
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={input.monthlyFixedExpenses} onChange={(e) => setInputNumber("monthlyFixedExpenses", e.target.value)} />
          </label>
          <label className="text-sm">월 변동지출
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={input.monthlyVariableExpenses} onChange={(e) => setInputNumber("monthlyVariableExpenses", e.target.value)} />
          </label>
          <label className="text-sm">현금성 자산
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={input.liquidAssets} onChange={(e) => setInputNumber("liquidAssets", e.target.value)} />
          </label>
          <label className="text-sm">기타 자산
            <input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" value={input.otherAssets ?? 0} onChange={(e) => setInputNumber("otherAssets", e.target.value)} />
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">부채</h2>
            <Button size="sm" variant="outline" onClick={() => setInput((prev) => ({ ...prev, debts: [...prev.debts, { name: "", balance: 0, aprPct: 0, monthlyPayment: 0 }] }))}>부채 추가</Button>
          </div>
          <div className="space-y-3">
            {input.debts.map((debt, index) => (
              <div key={`debt-${index}`} className="grid gap-2 md:grid-cols-5">
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="이름" value={debt.name} onChange={(e) => updateDebt(index, { name: e.target.value })} />
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="잔액" value={debt.balance} onChange={(e) => updateDebt(index, { balance: parseNum(e.target.value) })} />
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="APR%" value={debt.aprPct} onChange={(e) => updateDebt(index, { aprPct: parseNum(e.target.value) })} />
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="월 상환액" value={debt.monthlyPayment} onChange={(e) => updateDebt(index, { monthlyPayment: parseNum(e.target.value) })} />
                <Button size="sm" variant="ghost" onClick={() => setInput((prev) => ({ ...prev, debts: prev.debts.filter((_, i) => i !== index) }))}>삭제</Button>
              </div>
            ))}
            {input.debts.length === 0 ? <p className="text-xs text-slate-500">부채가 없으면 비워둘 수 있습니다.</p> : null}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">목표</h2>
            <Button size="sm" variant="outline" onClick={() => setInput((prev) => ({ ...prev, goals: [...prev.goals, { name: "", targetAmount: 0 }] }))}>목표 추가</Button>
          </div>
          <div className="space-y-3">
            {input.goals.map((goal, index) => (
              <div key={`goal-${index}`} className="grid gap-2 md:grid-cols-4">
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="목표명" value={goal.name} onChange={(e) => updateGoal(index, { name: e.target.value })} />
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="목표금액" value={goal.targetAmount} onChange={(e) => updateGoal(index, { targetAmount: parseNum(e.target.value) })} />
                <input className="h-9 rounded-md border border-slate-300 px-2 text-sm" placeholder="기한(개월, 선택)" value={goal.horizonMonths ?? ""} onChange={(e) => updateGoal(index, { horizonMonths: e.target.value.trim() ? parseNum(e.target.value) : undefined })} />
                <Button size="sm" variant="ghost" onClick={() => setInput((prev) => ({ ...prev, goals: prev.goals.filter((_, i) => i !== index) }))}>삭제</Button>
              </div>
            ))}
            {input.goals.length === 0 ? <p className="text-xs text-slate-500">목표가 없으면 비워둘 수 있습니다.</p> : null}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <button type="button" className="text-sm font-semibold text-slate-700" onClick={() => setAssumptionOpen((prev) => !prev)}>
            가정값 {assumptionOpen ? "접기" : "열기"}
          </button>
          {assumptionOpen ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs">비상금 목표 개월
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.emergencyTargetMonths} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, emergencyTargetMonths: parseNum(e.target.value) }))} />
              </label>
              <label className="text-xs">부채추가상환 전 최소 비상금(개월)
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.minEmergencyMonthsBeforeDebtExtra} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, minEmergencyMonthsBeforeDebtExtra: parseNum(e.target.value) }))} />
              </label>
              <label className="text-xs">고금리 기준 APR%
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.highInterestAprPctThreshold} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, highInterestAprPctThreshold: parseNum(e.target.value) }))} />
              </label>
              <label className="text-xs">DSR 경고 기준%
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.dsrWarnPct} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, dsrWarnPct: parseNum(e.target.value) }))} />
              </label>
              <label className="text-xs">연 수익률 가정%
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.annualReturnPct} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, annualReturnPct: parseNum(e.target.value) }))} />
              </label>
              <label className="text-xs">최대 시뮬레이션 개월
                <input className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2" value={assumptions.maxSimMonths} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, maxSimMonths: parseNum(e.target.value) }))} />
              </label>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={assumptions.applyReturnToSimulation} onChange={(e) => setAssumptions((prev) => clampPlannerAssumptions({ ...prev, applyReturnToSimulation: e.target.checked }))} />
                수익률 가정 적용
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void runCompute()} disabled={loading}>{loading ? "계산 중..." : "계산하기"}</Button>
          <Button variant="outline" onClick={resetAll}>초기화</Button>
          <Button variant="outline" onClick={exportJson}>Export JSON</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson(file);
            e.currentTarget.value = "";
          }} />
        </div>
      </Card>

      {error ? (
        <Card className="border-rose-200 bg-rose-50">
          <p className="text-sm font-semibold text-rose-700">{error}</p>
          {issues.length > 0 ? <p className="mt-2 text-xs text-rose-600">{issues.join(" | ")}</p> : null}
        </Card>
      ) : null}

      {result ? (
        <>
          {deepLinks ? (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <h2 className="text-lg font-semibold text-emerald-900">다음 단계</h2>
              <p className="mt-1 text-sm text-emerald-800">현재 계산값을 추천/상품 탐색으로 바로 전달합니다.</p>
              <p className="mt-2 text-xs text-emerald-700">{deepLinks.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={deepLinks.recommendHref}>
                  <Button variant="primary">추천으로 이동</Button>
                </Link>
                <Link href={deepLinks.productsHref}>
                  <Button variant="outline">예금 상품 탐색</Button>
                </Link>
              </div>
            </Card>
          ) : null}

          <Card>
            <h2 className="text-lg font-semibold">핵심 지표</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">지표</th>
                    <th className="py-2">값</th>
                    <th className="py-2">계산식</th>
                  </tr>
                </thead>
                <tbody>
                  {result.metrics.map((m) => (
                    <tr key={m.key} className="border-b border-slate-100 align-top">
                      <td className="py-2 font-medium text-slate-800">{m.label}</td>
                      <td className="py-2 text-slate-900">{toDisplay(m)}</td>
                      <td className="py-2 text-xs text-slate-500">{m.formula}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">우선순위 액션</h2>
            <div className="mt-3 space-y-3">
              {result.actions.map((action, idx) => (
                <div key={`${action.title}-${idx}`} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${priorityClass(action.priority)}`}>{action.priority.toUpperCase()}</span>
                    <p className="font-semibold text-slate-900">{action.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{action.action}</p>
                  <p className="mt-1 text-xs text-slate-500">근거: {action.reason}</p>
                  {(action.links ?? []).length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(action.links ?? []).map((link) => (
                        <Link key={`${link.href}-${link.label}`} href={link.href}>
                          <Button size="sm" variant="outline">{link.label}</Button>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <h3 className="font-semibold">비상금 플랜</h3>
              <p className="mt-2 text-sm">목표: {fmtKrw(result.emergencyPlan.targetAmount)}</p>
              <p className="text-sm">현재: {fmtKrw(result.emergencyPlan.current)}</p>
              <p className="text-sm">격차: {fmtKrw(result.emergencyPlan.gap)}</p>
              <p className="text-sm">권장 월배분: {fmtKrw(result.emergencyPlan.suggestedMonthly)}</p>
              <p className="text-sm">추정 개월: {result.emergencyPlan.estimatedMonths === null ? "-" : `${result.emergencyPlan.estimatedMonths}개월`}</p>
              <p className="mt-2 text-xs text-slate-500">{result.emergencyPlan.note}</p>
            </Card>

            <Card>
              <h3 className="font-semibold">부채 플랜</h3>
              <p className="mt-2 text-sm">고금리 부채: {result.debtPlan.highInterestDebts.length > 0 ? result.debtPlan.highInterestDebts.join(", ") : "없음"}</p>
              <p className="text-sm">집중 대상: {result.debtPlan.focusDebt ?? "-"}</p>
              <p className="text-sm">추가상환 월배분: {fmtKrw(result.debtPlan.extraPaymentMonthly)}</p>
              <p className="text-sm">추정 상환기간: {result.debtPlan.estimatedPayoffMonths === null ? "-" : `${result.debtPlan.estimatedPayoffMonths}개월`}</p>
              <p className="mt-2 text-xs text-slate-500">{result.debtPlan.note}</p>
            </Card>

            <Card>
              <h3 className="font-semibold">목표 플랜</h3>
              <div className="mt-2 space-y-2">
                {result.goalPlans.length === 0 ? <p className="text-sm text-slate-500">등록된 목표가 없습니다.</p> : result.goalPlans.map((goal) => (
                  <div key={goal.name} className="rounded-md border border-slate-200 p-2">
                    <p className="text-sm font-medium">{goal.name}</p>
                    <p className="text-xs">권장 월납: {fmtKrw(goal.suggestedMonthly)}</p>
                    <p className="text-xs">예상 소요: {goal.estimatedMonths === null ? "불가/제한" : `${goal.estimatedMonths}개월`}</p>
                    <p className="text-xs text-slate-500">{goal.note}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="font-semibold">경고/주의</h3>
            {(result.warnings ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">특이 경고 없음</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {result.warnings.map((w, i) => <li key={`w-${i}`}>{w}</li>)}
              </ul>
            )}

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium">사용된 가정값</p>
              <div className="mt-2 grid gap-1 md:grid-cols-2">
                <p>비상금 목표 개월: {result.assumptionsUsed.emergencyTargetMonths}</p>
                <p>부채추가상환 전 최소 비상금: {result.assumptionsUsed.minEmergencyMonthsBeforeDebtExtra}</p>
                <p>고금리 기준 APR: {result.assumptionsUsed.highInterestAprPctThreshold}%</p>
                <p>DSR 경고 기준: {result.assumptionsUsed.dsrWarnPct}%</p>
                <p>연 수익률 가정: {result.assumptionsUsed.annualReturnPct}%</p>
                <p>수익률 적용 여부: {result.assumptionsUsed.applyReturnToSimulation ? "적용" : "미적용"}</p>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              {result.explain.notes.map((note, i) => <p key={`n-${i}`}>{note}</p>)}
            </div>
          </Card>
        </>
      ) : null}
      </div>
    </main>
  );
}
