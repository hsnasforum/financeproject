"use client";

import { useMemo, useState } from "react";
import { QuickViewModal, type QuickViewKind } from "@/components/QuickViewModal";
import { PlaybookModal } from "@/components/PlaybookModal";
import { SnapshotDeltaCards } from "@/components/SnapshotDeltaCards";
import { Sparkline } from "@/components/Sparkline";
import { PlannerExternalModules } from "@/components/PlannerExternalModules";
import { buildBenefitQueries, inferSubscriptionRegion } from "@/lib/planner/executionHints";
import { computeInsuranceMetrics } from "@/lib/planner/insuranceMetrics";
import { buildPlan, type PlannerInput } from "@/lib/planner/plan";
import { computeRetirementMetrics } from "@/lib/planner/retirementMetrics";
import { loadCheckedMap, saveCheckedMap, type ChecklistCheckedMap } from "@/lib/planner/checklistStorage";
import { getLinkOpenMode, setLinkOpenMode, type LinkOpenMode } from "@/lib/planner/uiPrefs";
import {
  createSnapshotId,
  deleteSnapshot,
  listSnapshots,
  loadSnapshot,
  saveSnapshot,
  type PlannerSnapshot,
} from "@/lib/planner/storage";
import { uiTextKo } from "@/lib/uiText.ko";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";

const STEPS = [
  uiTextKo.planner.stepGoal,
  uiTextKo.planner.stepAnalysis,
  uiTextKo.planner.stepAlternatives,
  uiTextKo.planner.stepExecution,
  uiTextKo.planner.stepMonitoring,
] as const;

const DEFAULT_INPUT: PlannerInput = {
  unit: "MANWON",
  goalName: "목돈 마련",
  goalAmount: 2000,
  goalDeadlineMonths: 36,
  goalPriority: "medium",
  monthlyIncome: 420,
  monthlyFixedExpense: 150,
  monthlyVariableExpense: 90,
  cashAssets: 600,
  debtBalance: 300,
  debtRateAnnual: 8,
  monthlyDebtPayment: 25,
  emergencyTargetMonths: 3,
  assumedAnnualReturn: 3,
  assumedInflationRate: 2.5,
  extraMonthlySaving: 0,
  extraMonthlyDebtPayment: 0,
  riskProfile: "balanced",
  insuranceStatus: "unknown",
  monthlyInsurancePremium: 0,
  indemnityStatus: "unknown",
  insurancePurposeHealth: false,
  insurancePurposeAccident: false,
  insurancePurposeLife: false,
  insurancePurposeIncome: false,
  retirementAssets: 0,
  retirementMonthlyContribution: 0,
  npsExpectedMonthly: 0,
  retirementNeedRatioPct: 70,
  retirementWithdrawalRatePct: 3.5,
};

const SHOW_RULE_DEBUG = process.env.NEXT_PUBLIC_SHOW_RULE_DEBUG === "1";

type QuickViewState = {
  open: boolean;
  kind: QuickViewKind;
  title: string;
  hrefForNewTab: string;
};

const INITIAL_QUICK_VIEW: QuickViewState = {
  open: false,
  kind: "products",
  title: "빠른 보기",
  hrefForNewTab: "/products/deposit",
};

function formatMoney(baseValue: number, unit: PlannerInput["unit"]): string {
  const divided = unit === "MANWON" ? baseValue / 10000 : baseValue;
  return `${divided.toLocaleString()} ${unit === "MANWON" ? "만원" : "원"}`;
}

function openNewTab(href: string) {
  if (typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function resolveQuickView(action: { label: string; href?: string }): { kind: QuickViewKind; href: string; title: string } {
  const href = action.href ?? "/products/deposit";
  if (href.includes("/tools/fx")) return { kind: "fxtool", href, title: action.label };
  if (href.includes("/benefits")) return { kind: "benefits", href, title: action.label };
  if (href.includes("/housing/subscription")) return { kind: "subscription", href, title: action.label };
  if (action.label.includes("예금/적금") || href.includes("/products") && !href.includes("deposit") && !href.includes("saving")) {
    return { kind: "products", href: "/products/deposit", title: action.label };
  }
  if (href.includes("/products/deposit")) return { kind: "deposit", href, title: action.label };
  if (href.includes("/products/saving")) return { kind: "saving", href, title: action.label };
  if (href.includes("/recommend")) return { kind: "recommend", href, title: action.label };
  return { kind: "products", href, title: action.label };
}

function TrendRow({ label, values, color }: { label: string; values: number[]; color: string }) {
  const current = values.length ? values[values.length - 1] : 0;
  const prev = values.length > 1 ? values[values.length - 2] : current;
  const diff = current - prev;
  const sign = diff > 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-bold text-slate-700">{label}</p>
        <p className={`text-xs font-medium ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          최근 변화 {sign}{diff.toFixed(1)}%
        </p>
      </div>
      <Sparkline values={values} color={color} />
    </div>
  );
}

export function PlannerWizard() {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<PlannerInput>(DEFAULT_INPUT);
  const [snapshots, setSnapshots] = useState<PlannerSnapshot[]>(() => listSnapshots());
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [checkedMap, setCheckedMap] = useState<ChecklistCheckedMap>(() => loadCheckedMap());
  const [linkOpenMode, setLinkOpenModeState] = useState<LinkOpenMode>(() => getLinkOpenMode());
  const [quickView, setQuickView] = useState<QuickViewState>(INITIAL_QUICK_VIEW);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [playbookId, setPlaybookId] = useState<string | null>(null);

  const plan = useMemo(() => buildPlan(input), [input]);

  function setNumber(key: keyof PlannerInput, value: string) {
    const clean = value.replace(/[^0-9.]/g, "");
    const num = Number(clean);
    setInput((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
  }

  function setText(key: keyof PlannerInput, value: string) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function setBoolean(key: keyof PlannerInput, value: boolean) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function saveCurrentSnapshot() {
    const snapshot: PlannerSnapshot = {
      id: createSnapshotId(),
      createdAt: new Date().toISOString(),
      input,
      metrics: plan.metrics,
      recommendations: plan.recommendations,
    };
    saveSnapshot(snapshot);
    setSnapshots(listSnapshots());
  }

  function applySnapshot(id: string) {
    const snap = loadSnapshot(id);
    if (!snap) return;
    setInput({ ...DEFAULT_INPUT, ...snap.input });
  }

  function toggleChecklist(id: string) {
    const next = { ...checkedMap, [id]: !checkedMap[id] };
    setCheckedMap(next);
    saveCheckedMap(next);
  }

  function openAction(action: { label: string; href?: string }) {
    const resolved = resolveQuickView(action);
    if (linkOpenMode === "newtab") {
      openNewTab(resolved.href);
      return;
    }

    setQuickView({
      open: true,
      kind: resolved.kind,
      title: resolved.title,
      hrefForNewTab: resolved.href,
    });
  }

  function openPlaybook(id?: string) {
    if (!id) return;
    setPlaybookId(id);
    setPlaybookOpen(true);
  }

  const compareSnapA = compareA ? loadSnapshot(compareA) : null;
  const compareSnapB = compareB ? loadSnapshot(compareB) : null;
  const benefitQueries = buildBenefitQueries(input);
  const subscriptionRegion = inferSubscriptionRegion(input.goalName);
  const trendSource = [...snapshots].slice(0, 10).reverse();
  const monthlySavingTrend = trendSource.map((s) => s.metrics.monthlySaving);
  const emergencyGapTrend = trendSource.map((s) => s.metrics.emergencyGap);
  const goalRequiredTrend = trendSource.map((s) => s.metrics.goalRequiredMonthly);
  const debtRatioTrend = trendSource.map((s) => s.metrics.debtPaymentRatio * 100);
  const insuranceMetrics = useMemo(
    () =>
      computeInsuranceMetrics({
        unit: input.unit,
        monthlyIncome: input.monthlyIncome,
        monthlyInsurancePremium: input.monthlyInsurancePremium,
      }),
    [input.unit, input.monthlyIncome, input.monthlyInsurancePremium],
  );
  const retirementMetrics = useMemo(
    () =>
      computeRetirementMetrics({
        unit: input.unit,
        monthlyIncome: input.monthlyIncome,
        monthlyFixedExpense: input.monthlyFixedExpense,
        monthlyVariableExpense: input.monthlyVariableExpense,
        retirementAssets: input.retirementAssets,
        retirementMonthlyContribution: input.retirementMonthlyContribution,
        npsExpectedMonthly: input.npsExpectedMonthly,
        retirementNeedRatioPct: input.retirementNeedRatioPct,
        retirementWithdrawalRatePct: input.retirementWithdrawalRatePct,
      }),
    [
      input.unit,
      input.monthlyIncome,
      input.monthlyFixedExpense,
      input.monthlyVariableExpense,
      input.retirementAssets,
      input.retirementMonthlyContribution,
      input.npsExpectedMonthly,
      input.retirementNeedRatioPct,
      input.retirementWithdrawalRatePct,
    ],
  );

  return (
    <main className="py-10 bg-background min-h-screen">
      <Container>
        <SectionHeader 
          title={uiTextKo.planner.title} 
          subtitle={uiTextKo.planner.subtitle} 
          icon="/icons/ic-planner.png"
          className="mb-8"
        />

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Navigation */}
          <div className="md:w-64 flex-shrink-0">
             <div className="sticky top-24 space-y-2">
                {STEPS.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      step === idx 
                        ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" 
                        : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-100"
                    }`}
                    onClick={() => setStep(idx)}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${step === idx ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {idx + 1}
                    </span>
                    {label}
                  </button>
                ))}

                <div className="mt-8 p-4 bg-slate-900 rounded-xl text-white shadow-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">설정</p>
                  <p className="text-xs font-bold mb-2">링크 오픈 방식</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${linkOpenMode === "quickview" ? "border-primary" : "border-slate-600"}`}>
                        {linkOpenMode === "quickview" && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <input
                        type="radio"
                        className="hidden"
                        name="link-open-mode"
                        checked={linkOpenMode === "quickview"}
                        onChange={() => {
                          setLinkOpenModeState("quickview");
                          setLinkOpenMode("quickview");
                        }}
                      />
                      <span className={`text-[11px] ${linkOpenMode === "quickview" ? "text-white" : "text-slate-400"}`}>빠른 보기(추천)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${linkOpenMode === "newtab" ? "border-primary" : "border-slate-600"}`}>
                        {linkOpenMode === "newtab" && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <input
                        type="radio"
                        className="hidden"
                        name="link-open-mode"
                        checked={linkOpenMode === "newtab"}
                        onChange={() => {
                          setLinkOpenModeState("newtab");
                          setLinkOpenMode("newtab");
                        }}
                      />
                      <span className={`text-[11px] ${linkOpenMode === "newtab" ? "text-white" : "text-slate-400"}`}>새 탭 열기</span>
                    </label>
                  </div>
                </div>
             </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 space-y-6">
            {step === 0 && (
              <Card className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="border-l-4 border-primary pl-4">
                  <h2 className="text-xl font-bold text-slate-900">목표 설정</h2>
                  <p className="text-sm text-slate-500 mt-1">이루고 싶은 재무 목표를 구체적으로 입력해주세요.</p>
                </div>
                
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">목표 명칭</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.goalName} onChange={(e) => setText("goalName", e.target.value)} placeholder="예: 결혼 자금, 내 집 마련" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">금액 단위</label>
                    <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" value={input.unit} onChange={(e) => setText("unit", e.target.value as PlannerInput["unit"])}>
                      <option value="MANWON">만원</option>
                      <option value="KRW">원</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">목표 금액 ({input.unit === "MANWON" ? "만원" : "원"})</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.goalAmount} onChange={(e) => setNumber("goalAmount", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">목표 기한 (개월)</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.goalDeadlineMonths} onChange={(e) => setNumber("goalDeadlineMonths", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">우선 순위</label>
                    <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" value={input.goalPriority} onChange={(e) => setText("goalPriority", e.target.value as PlannerInput["goalPriority"])}>
                      <option value="high">높음 (필수 목표)</option>
                      <option value="medium">보통</option>
                      <option value="low">낮음 (여유 시)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">위험 성향</label>
                    <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" value={input.riskProfile} onChange={(e) => setText("riskProfile", e.target.value as PlannerInput["riskProfile"])}>
                      <option value="conservative">안정형 (원금 보전 중시)</option>
                      <option value="balanced">중립형 (적정 수익 추구)</option>
                      <option value="aggressive">공격형 (높은 수익 추구)</option>
                    </select>
                  </div>
                </div>
              </Card>
            )}

            {step === 1 && (
              <Card className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="border-l-4 border-primary pl-4">
                  <h2 className="text-xl font-bold text-slate-900">현황 분석</h2>
                  <p className="text-sm text-slate-500 mt-1">현재의 소득과 지출, 자산 상태를 분석합니다.</p>
                </div>
                
                <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">월 소득 (세후)</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm font-bold text-emerald-600 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.monthlyIncome} onChange={(e) => setNumber("monthlyIncome", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">월 고정 지출</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm text-red-500 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.monthlyFixedExpense} onChange={(e) => setNumber("monthlyFixedExpense", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">월 변동 지출</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm text-red-500 focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.monthlyVariableExpense} onChange={(e) => setNumber("monthlyVariableExpense", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">현금성 자산</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.cashAssets} onChange={(e) => setNumber("cashAssets", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">부채 총액</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.debtBalance} onChange={(e) => setNumber("debtBalance", e.target.value)} />
                  </div>
                   <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">월 부채 상환액</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.monthlyDebtPayment} onChange={(e) => setNumber("monthlyDebtPayment", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">비상금 목표 (개월)</label>
                    <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" value={input.emergencyTargetMonths} onChange={(e) => setNumber("emergencyTargetMonths", e.target.value)}>
                      <option value={3}>3개월</option>
                      <option value={6}>6개월</option>
                      <option value={12}>12개월</option>
                    </select>
                  </div>
                   <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">가정 연 수익률 (%)</label>
                    <input className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all" value={input.assumedAnnualReturn} onChange={(e) => setNumber("assumedAnnualReturn", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">보험 가입 상태</label>
                    <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm focus:bg-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none" value={input.insuranceStatus} onChange={(e) => setText("insuranceStatus", e.target.value as PlannerInput["insuranceStatus"])}>
                      <option value="unknown">모름</option>
                      <option value="none">없음</option>
                      <option value="basic">기본 가입</option>
                      <option value="adequate">충분</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-surface-muted p-4">
                    <p className="text-sm font-semibold text-slate-900">보험 점검(입력 기반)</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">월 보험료 ({input.unit === "MANWON" ? "만원" : "원"})
                        <input className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.monthlyInsurancePremium} onChange={(e) => setNumber("monthlyInsurancePremium", e.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-slate-500 uppercase">실손 가입 여부
                        <select className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.indemnityStatus} onChange={(e) => setText("indemnityStatus", e.target.value as PlannerInput["indemnityStatus"])}>
                          <option value="unknown">모름</option>
                          <option value="yes">가입</option>
                          <option value="no">미가입</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <label className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1">
                        <input type="checkbox" checked={input.insurancePurposeHealth} onChange={(e) => setBoolean("insurancePurposeHealth", e.target.checked)} />
                        건강
                      </label>
                      <label className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1">
                        <input type="checkbox" checked={input.insurancePurposeAccident} onChange={(e) => setBoolean("insurancePurposeAccident", e.target.checked)} />
                        상해
                      </label>
                      <label className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1">
                        <input type="checkbox" checked={input.insurancePurposeLife} onChange={(e) => setBoolean("insurancePurposeLife", e.target.checked)} />
                        사망
                      </label>
                      <label className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1">
                        <input type="checkbox" checked={input.insurancePurposeIncome} onChange={(e) => setBoolean("insurancePurposeIncome", e.target.checked)} />
                        소득보장
                      </label>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      보험료 부담률: <span className="font-semibold">{insuranceMetrics.premiumRatioPct.toFixed(1)}%</span>{" "}
                      · 상태:{" "}
                      <span className="font-semibold">
                        {insuranceMetrics.level === "high" ? "주의" : insuranceMetrics.level === "ok" ? "적정(참고)" : "여유"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{insuranceMetrics.explain}</p>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface-muted p-4">
                    <p className="text-sm font-semibold text-slate-900">노후 준비 점검(입력 기반)</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">연금자산 합계 ({input.unit === "MANWON" ? "만원" : "원"})
                        <input className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.retirementAssets} onChange={(e) => setNumber("retirementAssets", e.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-slate-500 uppercase">월 납입액 ({input.unit === "MANWON" ? "만원" : "원"})
                        <input className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.retirementMonthlyContribution} onChange={(e) => setNumber("retirementMonthlyContribution", e.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-slate-500 uppercase">예상 국민연금 월수령액 ({input.unit === "MANWON" ? "만원" : "원"})
                        <input className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.npsExpectedMonthly} onChange={(e) => setNumber("npsExpectedMonthly", e.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-slate-500 uppercase">은퇴후 필요비율(%)
                        <input className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3" value={input.retirementNeedRatioPct} onChange={(e) => setNumber("retirementNeedRatioPct", e.target.value)} />
                      </label>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      필요 생활비(월): <span className="font-semibold">{formatMoney(retirementMetrics.retirementNeedMonthlyWon, input.unit)}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      준비 격차(자산환산): <span className="font-semibold">{formatMoney(retirementMetrics.gapWon, input.unit)}</span>
                    </p>
                    <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
                      {retirementMetrics.actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <PlannerExternalModules />
                
                <Card className="p-0 overflow-hidden border-none shadow-lg">
                   <div className="bg-slate-900 p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <Badge variant="success" className="mb-2 bg-emerald-500 text-white border-none">종합 진단 결과</Badge>
                        <h3 className="text-2xl font-black">{plan.summaryLine}</h3>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">월 가용 자금</p>
                         <p className="text-2xl font-black text-emerald-400">{formatMoney(plan.metrics.freeCashflow, input.unit)}</p>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 bg-white">
                      <div className="p-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">월 저축 가능액</p>
                        <p className="text-lg font-bold text-slate-900">{formatMoney(plan.metrics.monthlySaving, input.unit)}</p>
                      </div>
                      <div className="p-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">비상금 준비</p>
                        <p className={`text-lg font-bold ${plan.metrics.emergencyGap <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                          {plan.metrics.emergencyMonths.toFixed(1)}개월분
                        </p>
                      </div>
                      <div className="p-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">부채 상환 비중</p>
                        <p className={`text-lg font-bold ${(plan.metrics.debtPaymentRatio * 100) > 30 ? "text-red-600" : "text-slate-900"}`}>
                          {(plan.metrics.debtPaymentRatio * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">목표 달성 가능성</p>
                        <Badge variant={plan.metrics.goalFeasible ? "success" : "warning"} className="font-black text-sm px-3">
                          {plan.metrics.goalFeasible ? "매우 높음" : "추가 필요"}
                        </Badge>
                      </div>
                   </div>
                </Card>

                <div className="space-y-4">
                   <h3 className="text-lg font-bold text-slate-900 px-2 flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/><path d="m5 7 3 5-3 5"/><path d="m19 7-3 5 3 5"/></svg>
                     단계별 맞춤 제언
                   </h3>
                   {plan.recommendations.map((rec) => (
                    <Card key={rec.id} className="p-0 overflow-hidden group hover:ring-2 hover:ring-primary/10 transition-all">
                      <div className="flex flex-col md:flex-row">
                        <div className={`w-full md:w-2 ${rec.priority === "P0" ? "bg-red-500" : rec.priority === "P1" ? "bg-amber-500" : "bg-blue-500"}`} />
                        <div className="flex-1 p-6">
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter border-slate-200">
                              {rec.category}
                            </Badge>
                            {SHOW_RULE_DEBUG ? <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{rec.id}</span> : null}
                          </div>
                          
                          <h4 className="text-xl font-bold text-slate-900 mb-4">{rec.title}</h4>

                          <div className="grid md:grid-cols-2 gap-8">
                            <div>
                               <p className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-1.5">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                 제안 배경
                               </p>
                               <ul className="space-y-2">
                                {rec.rationale.map((line, i) => (
                                  <li key={i} className="text-sm text-slate-600 leading-relaxed flex items-start gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                               <p className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-1.5">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m5 9 7-7 7 7"/><path d="m5 15 7 7 7-7"/></svg>
                                 실행 방안
                               </p>
                               <div className="space-y-3">
                                {rec.actions.map((action, i) => (
                                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <span className="text-sm font-bold text-slate-700">{action.label}</span>
                                    {action.href && (
                                      <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] bg-white" onClick={() => openAction(action)}>
                                        {linkOpenMode === "newtab" ? "새 탭" : "빠른 보기"}
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                             <p className="text-[10px] text-slate-400 italic font-medium">
                               <span className="font-black text-slate-500 mr-2 uppercase tracking-tighter">Caution</span>
                               {rec.caution || "확정 수익이 아닌 가정 기반 데이터입니다."}
                             </p>
                             {SHOW_RULE_DEBUG ? (
                               <div className="flex gap-1">
                                  {rec.triggeredBy.map(tag => (
                                    <Badge key={tag} className="text-[9px] bg-slate-100 text-slate-500 border-none px-1.5">#{tag}</Badge>
                                  ))}
                               </div>
                             ) : null}
                          </div>
                        </div>
                      </div>
                    </Card>
                   ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <Card className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="border-l-4 border-primary pl-4">
                      <h2 className="text-xl font-bold text-slate-900">{uiTextKo.planner.sectionExecution}</h2>
                      <p className="text-sm text-slate-500 mt-1">오늘 바로 시작할 수 있는 항목들입니다.</p>
                    </div>
                    <Badge variant="secondary" className="px-3 py-1 text-xs">
                      완료 {Object.values(checkedMap).filter(Boolean).length} / {plan.checklist.length}
                    </Badge>
                  </div>

                  <div className="grid gap-8 md:grid-cols-2">
                    {["이번 주", "이번 달"].map(bucket => (
                      <div key={bucket} className="space-y-4">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{bucket}</h3>
                        <div className="space-y-3">
                          {plan.checklist.filter(it => it.bucket === bucket).map(item => (
                            <div key={item.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${checkedMap[item.id] ? "bg-slate-50 border-slate-200 opacity-60" : "bg-white border-slate-100 shadow-sm"}`}>
                              <button 
                                className={`mt-1 flex-shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${checkedMap[item.id] ? "bg-primary border-primary text-white" : "border-slate-300 hover:border-primary"}`}
                                onClick={() => toggleChecklist(item.id)}
                              >
                                {checkedMap[item.id] && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                              </button>
                              <div className="flex-1">
                                <p className={`text-sm font-bold ${checkedMap[item.id] ? "text-slate-400 line-through" : "text-slate-900"}`}>{item.label}</p>
                                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.reason}</p>
                                <div className="mt-3 flex gap-2">
                                  {item.href && (
                                    <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] bg-white" onClick={() => openAction({ label: item.label, href: item.href })}>
                                      이동하기
                                    </Button>
                                  )}
                                  {item.playbookId && (
                                    <Button variant="secondary" size="sm" className="h-7 px-2 text-[10px]" onClick={() => openPlaybook(item.playbookId)}>
                                      방법 보기
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-8 bg-slate-900 text-white border-none shadow-xl overflow-hidden relative">
                   <div className="absolute top-0 right-0 p-8 opacity-10">
                      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                   </div>
                   <div className="relative z-10">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      추천 서비스 바로가기
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9" onClick={() => openAction({ label: "환율 도구", href: "/tools/fx" })}>환율 도구</Button>
                      <Button variant="ghost" className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9" onClick={() => openAction({ label: "예금 검색", href: "/products/deposit" })}>예금 검색</Button>
                      <Button variant="ghost" className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9" onClick={() => openAction({ label: "적금 검색", href: "/products/saving" })}>적금 검색</Button>
                      <Button variant="ghost" className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9" onClick={() => openAction({ label: "맞춤 추천", href: "/recommend" })}>맞춤 추천</Button>
                      {benefitQueries.map((query) => (
                        <Button
                          key={query}
                          variant="ghost"
                          className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9"
                          onClick={() => openAction({ label: `혜택(${query})`, href: `/benefits?query=${encodeURIComponent(query)}` })}
                        >
                          혜택({query})
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        className="bg-slate-800 text-white hover:bg-slate-700 border-none text-[11px] h-9"
                        onClick={() => openAction({ label: `청약(${subscriptionRegion})`, href: `/housing/subscription?region=${encodeURIComponent(subscriptionRegion)}` })}
                      >
                        청약({subscriptionRegion})
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="md:col-span-2 p-8">
                     <div className="flex items-center justify-between mb-8">
                        <div className="border-l-4 border-primary pl-4">
                          <h2 className="text-xl font-bold text-slate-900">{uiTextKo.planner.sectionMonitoring}</h2>
                          <p className="text-sm text-slate-500 mt-1">지속적인 점검이 재무 성공의 핵심입니다.</p>
                        </div>
                        <Button variant="primary" size="sm" onClick={saveCurrentSnapshot} className="font-bold shadow-md shadow-primary/20">
                          스냅샷 저장
                        </Button>
                     </div>
                     
                     <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between">
                        <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">다음 점검 권장일</p>
                           <p className="text-2xl font-black text-slate-900">{plan.monitoring.nextReviewDate}</p>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-primary shadow-sm">
                           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                        </div>
                     </div>

                     <div className="mt-8 space-y-4">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">이런 상황이 발생하면 즉시 점검하세요</p>
                        <ul className="grid sm:grid-cols-2 gap-3">
                          {plan.monitoring.triggers.map((t) => (
                            <li key={t} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white text-xs font-bold text-slate-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              {t}
                            </li>
                          ))}
                        </ul>
                     </div>
                  </Card>

                  <Card className="p-8">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6">최근 히스토리</h3>
                    <div className="space-y-3">
                      {snapshots.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-12 italic">저장된 스냅샷이 없습니다.</p>
                      ) : (
                        snapshots.slice(0, 5).map((snap) => (
                          <div key={snap.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 group hover:border-primary transition-all">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{snap.createdAt.slice(0, 10)}</p>
                            <p className="text-xs font-bold text-slate-800 line-clamp-1 mb-3">{snap.input.goalName}</p>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                               <Button variant="outline" size="sm" className="h-6 px-2 text-[9px] bg-white" onClick={() => applySnapshot(snap.id)}>불러오기</Button>
                               <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] text-red-500" onClick={() => { deleteSnapshot(snap.id); setSnapshots(listSnapshots()); }}>삭제</Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>

                <Card className="p-8">
                   <div className="flex items-center gap-2 mb-8">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                      <h3 className="text-lg font-bold text-slate-900">추세 분석 및 비교</h3>
                   </div>

                   <div className="grid md:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">기준 스냅샷</label>
                        <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm font-bold outline-none" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                          <option value="">비교 대상을 선택하세요</option>
                          {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">대조 스냅샷</label>
                        <select className="w-full h-11 rounded-xl border border-border bg-slate-50 px-4 text-sm font-bold outline-none" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                          <option value="">비교 대상을 선택하세요</option>
                          {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
                        </select>
                      </div>
                   </div>

                   {compareSnapA && compareSnapB && (
                     <div className="mb-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                        <SnapshotDeltaCards prev={compareSnapA} next={compareSnapB} />
                     </div>
                   )}

                   <div className="space-y-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">성과 지표 트렌드 (최근 10회)</p>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <TrendRow label="월 저축액" values={monthlySavingTrend} color="#2563eb" />
                        <TrendRow label="비상금 부족" values={emergencyGapTrend} color="#dc2626" />
                        <TrendRow label="필요 월적립" values={goalRequiredTrend} color="#10b981" />
                        <TrendRow label="부채비율" values={debtRatioTrend} color="#7c3aed" />
                      </div>
                   </div>
                </Card>
              </div>
            )}

            <div className="mt-12 flex justify-between items-center pt-8 border-t border-slate-100">
              <Button 
                variant="outline" 
                size="lg"
                className="w-32"
                disabled={step === 0} 
                onClick={() => {
                  setStep((s) => Math.max(0, s - 1));
                  window.scrollTo(0, 0);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="m15 18-6-6 6-6"/></svg>
                이전 단계
              </Button>
              <div className="hidden sm:flex gap-2">
                 {STEPS.map((_, i) => (
                   <div key={i} className={`h-1.5 w-8 rounded-full transition-all ${i === step ? "bg-primary w-12" : i < step ? "bg-primary/30" : "bg-slate-200"}`} />
                 ))}
              </div>
              <Button 
                variant="primary" 
                size="lg"
                className="w-32 shadow-lg shadow-primary/20"
                disabled={step === STEPS.length - 1} 
                onClick={() => {
                  setStep((s) => Math.min(STEPS.length - 1, s + 1));
                  window.scrollTo(0, 0);
                }}
              >
                다음 단계
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2"><path d="m9 18 6-6-6-6"/></svg>
              </Button>
            </div>
          </div>
        </div>
      </Container>

      <QuickViewModal
        open={quickView.open}
        onClose={() => setQuickView((prev) => ({ ...prev, open: false }))}
        kind={quickView.kind}
        title={quickView.title}
        hrefForNewTab={quickView.hrefForNewTab}
      />

      <PlaybookModal open={playbookOpen} onClose={() => setPlaybookOpen(false)} playbookId={playbookId} />
    </main>
  );
}
