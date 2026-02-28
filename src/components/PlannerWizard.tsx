"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AssumptionsCallout } from "@/components/ui/AssumptionsCallout";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: uiTextKo.planner.stepGoal, icon: "🎯", color: "text-rose-500", bg: "bg-rose-50" },
  { label: uiTextKo.planner.stepAnalysis, icon: "📊", color: "text-blue-500", bg: "bg-blue-50" },
  { label: uiTextKo.planner.stepAlternatives, icon: "✨", color: "text-emerald-500", bg: "bg-emerald-50" },
  { label: uiTextKo.planner.stepExecution, icon: "⚡", color: "text-amber-500", bg: "bg-amber-50" },
  { label: uiTextKo.planner.stepMonitoring, icon: "📅", color: "text-indigo-500", bg: "bg-indigo-50" },
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
  if (divided >= 10000) return `${(divided / 10000).toFixed(1)}억원`;
  if (divided >= 1) return `${divided.toLocaleString()}만원`;
  return `${(divided * 10000).toLocaleString()}원`;
}

function InputHint({ value, unit }: { value: number, unit: PlannerInput["unit"] }) {
  if (!value) return null;
  const inManwon = unit === "MANWON" ? value : value / 10000;
  if (inManwon >= 10000) {
    return <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{(inManwon / 10000).toFixed(1)}억원</span>;
  }
  return <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{inManwon.toLocaleString()}만원</span>;
}

function FinancialHealthGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg className="h-full w-full -rotate-90">
          <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
          <motion.circle 
            cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" 
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - (score / 100) * circumference }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
            strokeLinecap="round"
            className={cn(
              score > 70 ? "text-emerald-500" : score > 40 ? "text-amber-500" : "text-rose-500"
            )}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-xl font-black text-slate-900 tabular-nums"
          >
            {score}
          </motion.span>
        </div>
      </div>
      <p className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Health Score</p>
    </div>
  );
}

function MascotGuide({ step }: { step: number }) {
  const messages = [
    "안녕하세요! 먼저 당신이 이루고 싶은 재무 목표를 알려주세요. 구체적일수록 정확한 설계가 가능합니다.",
    "현재의 수입과 지출을 꼼꼼히 적어주세요. 이 데이터가 모든 분석의 기초가 됩니다.",
    "분석이 완료되었습니다! 현재 상태를 진단하고, 목표 달성을 위한 최적의 경로를 제안해 드립니다.",
    "이제 실행할 시간입니다. 이번 주와 이번 달에 꼭 해야 할 일들을 체크리스트로 정리했습니다.",
    "설계된 내용을 저장하고 주기적으로 점검하세요. 변화가 생기면 언제든 다시 설계를 수정할 수 있습니다."
  ];

  return (
    <motion.div 
      key={step}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-8 flex items-center gap-6 p-6 bg-white rounded-3xl shadow-card border border-emerald-100 overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
        <Image src="/nb/mascot.png" alt="" width={160} height={160} />
      </div>
      <motion.div 
        whileHover={{ scale: 1.05, rotate: 5 }}
        className="relative shrink-0 h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center overflow-hidden ring-4 ring-emerald-50/50"
      >
        <Image src="/nb/mascot.png" alt="Mascot" width={64} height={64} className="object-cover" />
      </motion.div>
      <div className="relative">
        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Financial Assistant</p>
        <p className="text-sm font-bold text-slate-700 leading-relaxed">{messages[step]}</p>
      </div>
    </motion.div>
  );
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
    <motion.div 
      whileHover={{ y: -2 }}
      className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-primary/20"
    >
      <div>
        <p className="text-[11px] font-black text-slate-400 uppercase mb-1 tracking-tight">{label}</p>
        <p className={cn("text-xs font-bold tabular-nums", diff >= 0 ? "text-emerald-600" : "text-red-600")}>
          {sign}{diff.toFixed(1)}%
        </p>
      </div>
      <div className="w-24">
        <Sparkline values={values} color={color} />
      </div>
    </motion.div>
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
  
  const healthScore = useMemo(() => {
    let score = 70;
    if (plan.metrics.debtPaymentRatio > 0.3) score -= 20;
    if (plan.metrics.emergencyGap > 0) score -= 15;
    if (!plan.metrics.goalFeasible) score -= 10;
    return Math.max(0, Math.min(100, score));
  }, [plan]);

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
    <PageShell className="bg-surface-muted">
      <SectionHeader 
        title={uiTextKo.planner.title} 
        subtitle={uiTextKo.planner.subtitle} 
        icon="/icons/ic-planner.png"
        className="mb-8"
      />

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="md:w-72 flex-shrink-0">
           <div className="sticky top-24 space-y-3">
              {STEPS.map((stepItem, idx) => {
                const isActive = step === idx;
                const isCompleted = step > idx;
                return (
                  <motion.button
                    key={stepItem.label}
                    type="button"
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "w-full group flex items-center gap-4 px-5 py-4 rounded-[1.5rem] text-sm font-bold transition-all duration-300",
                      isActive 
                        ? "bg-primary text-white shadow-xl shadow-primary/20 scale-[1.03]" 
                        : "bg-surface text-slate-500 hover:bg-slate-50 hover:text-slate-900 shadow-sm border border-border/50"
                    )}
                    onClick={() => setStep(idx)}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center text-base transition-all",
                      isActive ? "bg-white/20" : cn("bg-surface-muted group-hover:bg-white", stepItem.color)
                    )}>
                      {isCompleted ? "✓" : stepItem.icon}
                    </div>
                    <span className="flex-1 text-left tracking-tight">{stepItem.label}</span>
                    {isActive && <motion.div layoutId="active-step-dot" className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />}
                  </motion.button>
                );
              })}

              <Card className="mt-8 p-6 bg-hero-navy text-white border-none shadow-2xl relative overflow-hidden">
                <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-white/5 rounded-full blur-2xl" />
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest">UI Prefs</p>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold mb-3 text-slate-300">상품 상세 열기</p>
                    <div className="grid grid-cols-2 gap-2 bg-black/20 p-1 rounded-xl">
                      <button 
                        onClick={() => { setLinkOpenModeState("quickview"); setLinkOpenMode("quickview"); }}
                        className={cn("py-1.5 rounded-lg text-[10px] font-bold transition-all", linkOpenMode === "quickview" ? "bg-white text-primary" : "text-slate-400")}
                      >
                        빠른 보기
                      </button>
                      <button 
                        onClick={() => { setLinkOpenModeState("newtab"); setLinkOpenMode("newtab"); }}
                        className={cn("py-1.5 rounded-lg text-[10px] font-bold transition-all", linkOpenMode === "newtab" ? "bg-white text-primary" : "text-slate-400")}
                      >
                        새 탭
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
           </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 space-y-6">
          <MascotGuide step={step} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {step === 0 && (
                <Card className="p-10 space-y-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Step 1. 목표 설정</h2>
                      <p className="text-sm font-medium text-slate-500 mt-1">당신의 꿈을 현실로 바꾸기 위한 첫 걸음입니다.</p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center text-2xl shadow-sm ring-1 ring-rose-100">🎯</div>
                  </div>
                  
                  <div className="grid gap-8 sm:grid-cols-2 bg-slate-50/50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">목표 명칭</label>
                      <input className="w-full h-14 rounded-2xl border border-border bg-white px-5 text-base font-bold text-slate-900 shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none" value={input.goalName} onChange={(e) => setText("goalName", e.target.value)} placeholder="예: 결혼 자금, 내 집 마련" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">금액 단위</label>
                      <select className="w-full h-14 rounded-2xl border border-border bg-white px-5 text-base font-bold text-slate-900 shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none appearance-none cursor-pointer" value={input.unit} onChange={(e) => setText("unit", e.target.value as PlannerInput["unit"])}>
                        <option value="MANWON">만원 (Default)</option>
                        <option value="KRW">원 (Won)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">목표 금액</label>
                      <div className="relative">
                        <input className="w-full h-14 rounded-2xl border border-border bg-white px-5 pr-24 text-base font-black text-slate-900 shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none tabular-nums" value={input.goalAmount} onChange={(e) => setNumber("goalAmount", e.target.value)} />
                        <InputHint value={input.goalAmount} unit={input.unit} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">목표 기한 (개월)</label>
                      <input className="w-full h-14 rounded-2xl border border-border bg-white px-5 text-base font-black text-slate-900 shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none tabular-nums" value={input.goalDeadlineMonths} onChange={(e) => setNumber("goalDeadlineMonths", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">우선 순위</label>
                      <div className="grid grid-cols-3 gap-2 p-1.5 bg-white rounded-2xl border border-border shadow-sm">
                        {["low", "medium", "high"].map((p) => (
                          <button 
                            key={p} 
                            onClick={() => setText("goalPriority", p)}
                            className={cn(
                              "py-2 rounded-xl text-[11px] font-black uppercase tracking-tighter transition-all",
                              input.goalPriority === p ? "bg-primary text-white shadow-md" : "text-slate-400 hover:bg-slate-50"
                            )}
                          >
                            {p === "high" ? "필수" : p === "medium" ? "보통" : "여유"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">위험 성향</label>
                      <select className="w-full h-14 rounded-2xl border border-border bg-white px-5 text-base font-bold text-slate-900 shadow-sm focus:ring-4 focus:ring-primary/10 transition-all outline-none appearance-none cursor-pointer" value={input.riskProfile} onChange={(e) => setText("riskProfile", e.target.value as PlannerInput["riskProfile"])}>
                        <option value="conservative">안정형 (원금 보전)</option>
                        <option value="balanced">중립형 (적정 수익)</option>
                        <option value="aggressive">공격형 (높은 수익)</option>
                      </select>
                    </div>
                  </div>
                </Card>
              )}

              {step === 1 && (
                <Card className="p-10 space-y-10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Step 2. 자산 현황 분석</h2>
                      <p className="text-sm font-medium text-slate-500 mt-1">정확한 진단을 위해 수입과 지출 정보를 입력해주세요.</p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl shadow-sm ring-1 ring-blue-100">📊</div>
                  </div>
                  
                  <div className="space-y-10">
                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                      {[
                        { key: "monthlyIncome", label: "월 소득 (세후)", color: "emerald" },
                        { key: "monthlyFixedExpense", label: "월 고정 지출", color: "rose" },
                        { key: "monthlyVariableExpense", label: "월 변동 지출", color: "rose" },
                        { key: "cashAssets", label: "현금성 자산", color: "primary" },
                        { key: "debtBalance", label: "부채 총액", color: "slate" },
                        { key: "monthlyDebtPayment", label: "월 부채 상환", color: "slate" },
                      ].map((field) => (
                        <div key={field.key} className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] ml-1">{field.label}</label>
                          <div className="relative">
                            <input 
                              className={cn(
                                "w-full h-12 rounded-2xl border border-border bg-white px-4 pr-24 text-sm font-black transition-all outline-none focus:ring-4 shadow-sm",
                                field.color === "emerald" ? "text-emerald-600 focus:ring-emerald-500/10" :
                                field.color === "rose" ? "text-rose-600 focus:ring-rose-500/10" :
                                "text-slate-900 focus:ring-primary/10"
                              )}
                              value={input[field.key as keyof PlannerInput] as string} 
                              onChange={(e) => setNumber(field.key as keyof PlannerInput, e.target.value)} 
                            />
                            <InputHint value={input[field.key as keyof PlannerInput] as number} unit={input.unit} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick Calculator View */}
                    <div className="p-6 rounded-[2.5rem] bg-emerald-900 text-white shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                       <div className="absolute inset-0 bg-gradient-to-r from-emerald-800 to-transparent pointer-events-none" />
                       <div className="relative z-10">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-2">Estimated Monthly Saving</p>
                          <p className="text-3xl font-black tabular-nums tracking-tight">
                            {formatMoney(plan.metrics.monthlySaving, input.unit)}
                          </p>
                       </div>
                       <div className="relative z-10 text-right">
                          <div className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-full font-black text-xs",
                            plan.metrics.goalFeasible ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                          )}>
                            {plan.metrics.goalFeasible ? "✓ 목표 달성 가능" : "⚠ 재원 부족 예상"}
                          </div>
                       </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2 border-t border-slate-100 pt-10">
                      <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 shadow-sm space-y-6">
                        <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 보험 점검
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">월 보험료</label>
                            <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-sm" value={input.monthlyInsurancePremium} onChange={(e) => setNumber("monthlyInsurancePremium", e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">실손 가입 여부</label>
                            <select className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold outline-none shadow-sm cursor-pointer" value={input.indemnityStatus} onChange={(e) => setText("indemnityStatus", e.target.value as PlannerInput["indemnityStatus"])}>
                              <option value="unknown">모름</option>
                              <option value="yes">가입됨</option>
                              <option value="no">미가입</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: "insurancePurposeHealth", label: "건강" },
                            { key: "insurancePurposeAccident", label: "상해" },
                            { key: "insurancePurposeLife", label: "사망" },
                            { key: "insurancePurposeIncome", label: "소득" },
                          ].map((item) => (
                            <motion.label 
                              key={item.key} 
                              whileTap={{ scale: 0.95 }}
                              className={cn(
                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer",
                                input[item.key as keyof PlannerInput] ? "bg-primary text-white border-primary shadow-sm" : "bg-white text-slate-500 border-border hover:bg-slate-100"
                              )}
                            >
                              <input type="checkbox" checked={input[item.key as keyof PlannerInput] as boolean} onChange={(e) => setBoolean(item.key as keyof PlannerInput, e.target.checked)} className="hidden" />
                              {item.label}
                            </motion.label>
                          ))}
                        </div>
                        <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 shadow-inner">
                          <p className="text-xs text-slate-700 leading-relaxed">
                            보험료 부담률: <span className="font-black text-emerald-600">{insuranceMetrics.premiumRatioPct.toFixed(1)}%</span> (권장 10% 내외)
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500 font-medium">{insuranceMetrics.explain}</p>
                        </div>
                      </div>

                      <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 shadow-sm space-y-6">
                        <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-amber-500" /> 노후 준비
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">연금 자산 합계</label>
                            <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm" value={input.retirementAssets} onChange={(e) => setNumber("retirementAssets", e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">월 연금 납입</label>
                            <input className="h-11 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold shadow-sm" value={input.retirementMonthlyContribution} onChange={(e) => setNumber("retirementMonthlyContribution", e.target.value)} />
                          </div>
                        </div>
                        <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 shadow-inner">
                          <p className="text-xs text-slate-700 font-bold">
                            필요 생활비(월): {formatMoney(retirementMetrics.retirementNeedMonthlyWon, input.unit)}
                          </p>
                          <p className="mt-1 text-xs text-slate-700">
                            준비 격차: <span className="font-black text-rose-600">{formatMoney(retirementMetrics.gapWon, input.unit)}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <PlannerExternalModules />
                  
                  <Card className="p-0 overflow-hidden border-none shadow-card">
                     <div className="bg-hero-navy p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                           <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/><path d="m5 7 3 5-3 5"/><path d="m19 7-3 5 3 5"/></svg>
                        </div>
                        <div className="relative z-10">
                          <Badge variant="success" className="mb-4 bg-emerald-500 text-white border-none px-4 py-1.5 text-xs font-black shadow-lg shadow-emerald-900/40">진단 레포트 완료</Badge>
                          <h3 className="text-2xl md:text-4xl font-black tracking-tight leading-[1.1]">{plan.summaryLine}</h3>
                        </div>
                        <div className="relative z-10 shrink-0 bg-white/10 p-6 rounded-[2.5rem] backdrop-blur-xl border border-white/10 flex items-center gap-6 shadow-2xl">
                           <FinancialHealthGauge score={healthScore} />
                           <div className="text-left">
                              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">월 가용 자금</p>
                              <p className="text-3xl font-black text-emerald-400 tabular-nums tracking-tighter">{formatMoney(plan.metrics.freeCashflow, input.unit)}</p>
                           </div>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border bg-surface">
                        {[
                          { label: "월 저축 가능", value: formatMoney(plan.metrics.monthlySaving, input.unit), trend: "저축 성향" },
                          { label: "비상금 지수", value: `${plan.metrics.emergencyMonths.toFixed(1)}개월분`, trend: plan.metrics.emergencyGap <= 0 ? "안전" : "부족" },
                          { label: "부채 상환 비중", value: `${(plan.metrics.debtPaymentRatio * 100).toFixed(1)}%`, trend: (plan.metrics.debtPaymentRatio * 100) > 30 ? "주의" : "양호" },
                          { label: "목표 달성", value: plan.metrics.goalFeasible ? "가능성 높음" : "추가 재원 필요", trend: "예측 결과" },
                        ].map((m) => (
                          <div key={m.label} className="p-6 transition-colors hover:bg-slate-50">
                            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{m.label}</p>
                            <p className={cn("text-xl font-black tracking-tight text-slate-900 tabular-nums", m.trend === "주의" || m.trend === "부족" ? "text-rose-600" : "")}>{m.value}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1">{m.trend}</p>
                          </div>
                        ))}
                     </div>
                  </Card>

                  <div className="space-y-6">
                     <div className="flex items-center justify-between px-2 mt-10">
                        <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-primary" /> 단계별 맞춤 제언
                        </h3>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none font-bold text-[10px]">총 {plan.recommendations.length}개의 분석 항목</Badge>
                     </div>
                     
                     {plan.recommendations.map((rec) => (
                      <Card key={rec.id} className="p-0 overflow-hidden border-none shadow-card hover:shadow-card-hover transition-all duration-500">
                        <div className="flex flex-col md:flex-row min-h-[240px]">
                          <div className={cn(
                            "w-full md:w-3 shrink-0",
                            rec.priority === "P0" ? "bg-rose-500" : rec.priority === "P1" ? "bg-amber-500" : "bg-emerald-500"
                          )} />
                          <div className="flex-1 p-8 lg:p-10">
                            <div className="flex items-center gap-2 mb-6">
                              <Badge variant="outline" className="text-[10px] uppercase font-black tracking-[0.2em] border-slate-200 text-slate-400 px-3 py-1">
                                {rec.category}
                              </Badge>
                              {SHOW_RULE_DEBUG && <span className="font-mono text-[9px] text-slate-300">ID: {rec.id}</span>}
                            </div>
                            
                            <h4 className="text-2xl md:text-3xl font-black text-slate-900 mb-8 tracking-tight">{rec.title}</h4>

                            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12">
                              <div className="space-y-4">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                   <span className="h-1 w-4 bg-slate-200 rounded-full" /> 제안 배경 및 근거
                                 </p>
                                 <ul className="space-y-3.5">
                                  {rec.rationale.map((line, i) => (
                                    <li key={i} className="text-sm font-medium text-slate-600 leading-relaxed flex items-start gap-3">
                                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-2 shrink-0" />
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div className="space-y-4">
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                   <span className="h-1 w-4 bg-slate-200 rounded-full" /> 구체적 실행 방안
                                 </p>
                                 <div className="space-y-3">
                                  {rec.actions.map((action, i) => (
                                    <div key={i} className="group/action flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:border-primary/20">
                                      <span className="text-sm font-bold text-slate-800">{action.label}</span>
                                      {action.href && (
                                        <Button variant="outline" size="sm" className="h-8 px-4 text-[10px] font-black bg-white shadow-sm border-slate-200 group-hover/action:bg-primary group-hover/action:text-white group-hover/action:border-primary transition-all rounded-full" onClick={() => openAction(action)}>
                                          {linkOpenMode === "newtab" ? "NEW TAB" : "OPEN QUICK"}
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            
                            <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                               <p className="text-[11px] text-slate-400 font-bold flex items-center gap-2">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                 {rec.caution || "확정 수익이 아닌 가정 기반 데이터입니다."}
                               </p>
                               <div className="flex gap-1.5">
                                  {rec.triggeredBy.map(tag => (
                                    <span key={tag} className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">#{tag}</span>
                                  ))}
                               </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                     ))}
                  </div>

                  <AssumptionsCallout className="mt-12 bg-white border-emerald-100 shadow-sm">
                    본 재무설계 결과는 사용자가 입력한 데이터와 가정(물가상승률 {input.assumedInflationRate}%, 기대수익률 {input.assumedAnnualReturn}%)을 바탕으로 산출된 참고용 자료이며, 실제 금융 서비스 이용 시 해당 기관의 약관을 반드시 확인하시기 바랍니다.
                  </AssumptionsCallout>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <Card className="p-10 space-y-10">
                    <div className="flex items-center justify-between border-b border-border/50 pb-8">
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">{uiTextKo.planner.sectionExecution}</h2>
                        <p className="text-sm font-medium text-slate-500 mt-1">오늘 바로 시작할 수 있는 작은 실천들이 큰 미래를 만듭니다.</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</p>
                        <Badge variant="secondary" className="px-4 py-1.5 text-xs font-black bg-emerald-50 text-emerald-700 border-none shadow-sm">
                          완료 {Object.values(checkedMap).filter(Boolean).length} / {plan.checklist.length}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-10 lg:grid-cols-2">
                      {["이번 주", "이번 달"].map(bucket => (
                        <div key={bucket} className="space-y-6">
                          <div className="flex items-center gap-3">
                            <span className={cn("h-6 w-1 rounded-full", bucket === "이번 주" ? "bg-rose-500" : "bg-primary")} />
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{bucket}</h3>
                          </div>
                          <div className="space-y-4">
                            {plan.checklist.filter(it => it.bucket === bucket).map(item => {
                              const isChecked = !!checkedMap[item.id];
                              return (
                                <motion.div 
                                  layout
                                  key={item.id} 
                                  className={cn(
                                    "flex items-start gap-5 p-5 rounded-3xl border transition-all duration-300",
                                    isChecked 
                                      ? "bg-slate-50 border-border/50 opacity-60 scale-[0.98]" 
                                      : "bg-white border-border shadow-sm hover:shadow-md hover:border-primary/30"
                                  )}
                                >
                                  <button 
                                    className={cn(
                                      "mt-1.5 flex-shrink-0 h-6 w-6 rounded-xl border-2 flex items-center justify-center transition-all",
                                      isChecked ? "bg-primary border-primary text-white rotate-[360deg]" : "border-slate-200 bg-white hover:border-primary shadow-sm"
                                    )}
                                    onClick={() => toggleChecklist(item.id)}
                                  >
                                    {isChecked && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn("text-base font-black tracking-tight", isChecked ? "text-slate-400 line-through font-bold" : "text-slate-900")}>{item.label}</p>
                                    <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">{item.reason}</p>
                                    {!isChecked && (
                                      <div className="mt-4 flex flex-wrap gap-2">
                                        {item.href && (
                                          <Button variant="outline" size="sm" className="h-8 px-4 text-[10px] font-black bg-white rounded-full shadow-sm" onClick={() => openAction({ label: item.label, href: item.href })}>
                                            바로가기
                                          </Button>
                                        )}
                                        {item.playbookId && (
                                          <Button variant="secondary" size="sm" className="h-8 px-4 text-[10px] font-black rounded-full" onClick={() => openPlaybook(item.playbookId)}>
                                            가이드 보기
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-10 bg-hero-charcoal text-white border-none shadow-2xl overflow-hidden relative">
                     <div className="absolute top-0 right-0 p-12 opacity-[0.03] scale-150 group-hover:rotate-12 transition-transform duration-1000">
                        <Image src="/nb/mascot.png" alt="" width={300} height={300} />
                     </div>
                     <div className="relative z-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md mb-6 border border-white/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">추천 서비스</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-black mb-8 tracking-tight">당신에게 필요한 금융 도구들을 준비했습니다.</h3>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { label: "실시간 환율", href: "/tools/fx", icon: "🌍" },
                          { label: "예금 탐색", href: "/products/deposit", icon: "🏦" },
                          { label: "적금 탐색", href: "/products/saving", icon: "💰" },
                          { label: "AI 맞춤 추천", href: "/recommend", icon: "✨" },
                        ].map(tool => (
                          <Button 
                            key={tool.label}
                            variant="outline" 
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-[11px] font-bold h-12 px-6 rounded-2xl backdrop-blur-sm transition-all shadow-sm" 
                            onClick={() => openAction({ label: tool.label, href: tool.href })}
                          >
                            <span className="mr-2 opacity-70">{tool.icon}</span> {tool.label}
                          </Button>
                        ))}
                        {benefitQueries.map((query) => (
                          <Button
                            key={query}
                            variant="outline"
                            className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-[11px] font-bold h-12 px-6 rounded-2xl backdrop-blur-sm"
                            onClick={() => openAction({ label: `혜택(${query})`, href: `/benefits?query=${encodeURIComponent(query)}` })}
                          >
                            💎 혜택({query})
                          </Button>
                        ))}
                        <Button
                          variant="outline"
                          className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-[11px] font-bold h-12 px-6 rounded-2xl backdrop-blur-sm"
                          onClick={() => openAction({ label: `청약(${subscriptionRegion})`, href: `/housing/subscription?region=${encodeURIComponent(subscriptionRegion)}` })}
                        >
                          🏠 청약({subscriptionRegion})
                        </Button>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div className="grid lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 p-10 space-y-10">
                       <div className="flex items-start justify-between border-b border-border/50 pb-8">
                          <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{uiTextKo.planner.sectionMonitoring}</h2>
                            <p className="text-sm font-medium text-slate-500 mt-1">지속적인 모니터링은 성공적인 재무 관리의 핵심입니다.</p>
                          </div>
                          <Button variant="primary" size="lg" onClick={saveCurrentSnapshot} className="font-black shadow-xl shadow-primary/20 rounded-full px-8 h-12 text-sm uppercase tracking-widest transition-all hover:scale-105 active:scale-95">
                            Save Snapshot
                          </Button>
                       </div>
                       
                       <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 flex items-center justify-between shadow-2xl relative overflow-hidden group">
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent pointer-events-none" />
                          <div className="relative z-10">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Next Review Recommended</p>
                             <p className="text-3xl font-black tabular-nums tracking-tight text-primary">{plan.monitoring.nextReviewDate}</p>
                          </div>
                          <div className="relative z-10 h-16 w-16 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500 shadow-2xl">
                             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                          </div>
                       </div>

                       <div className="space-y-6">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">즉시 점검이 필요한 신호</p>
                          <div className="grid sm:grid-cols-2 gap-4">
                            {plan.monitoring.triggers.map((t) => (
                              <motion.div 
                                key={t} 
                                whileHover={{ scale: 1.02 }}
                                className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-white text-xs font-bold text-slate-700 shadow-sm transition-all hover:border-primary/30"
                              >
                                <div className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
                                {t}
                              </motion.div>
                            ))}
                          </div>
                       </div>
                    </Card>

                    <Card className="p-8 bg-surface border-border/50">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-8 border-b border-border/50 pb-4">Recent History</h3>
                      <div className="space-y-4">
                        {snapshots.length === 0 ? (
                          <div className="py-20 text-center space-y-4">
                            <div className="h-12 w-12 mx-auto bg-slate-50 rounded-full flex items-center justify-center text-slate-200">∅</div>
                            <p className="text-[11px] font-bold text-slate-400">저장된 기록이 없습니다.</p>
                          </div>
                        ) : (
                          snapshots.slice(0, 5).map((snap) => (
                            <motion.div 
                              layout
                              key={snap.id} 
                              className="p-5 rounded-2xl border border-border bg-white group hover:border-primary transition-all duration-300 shadow-sm"
                            >
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{snap.createdAt.slice(0, 10)}</p>
                              <p className="text-sm font-black text-slate-800 line-clamp-1 mb-4">{snap.input.goalName}</p>
                              <div className="flex gap-2">
                                 <Button variant="outline" size="sm" className="h-8 flex-1 text-[10px] font-black bg-slate-50 border-none rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm" onClick={() => applySnapshot(snap.id)}>LOAD</Button>
                                 <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl" onClick={() => { deleteSnapshot(snap.id); setSnapshots(listSnapshots()); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                 </Button>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </Card>
                  </div>

                  <Card className="p-10">
                     <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                          </div>
                          <h3 className="text-xl font-black text-slate-900 tracking-tight">트렌드 분석 및 성과 비교</h3>
                        </div>
                        <Badge variant="outline" className="px-3 py-1 font-black text-[10px] border-slate-200 text-slate-400">LAST 10 SNAPSHOTS</Badge>
                     </div>

                     <div className="grid md:grid-cols-2 gap-8 mb-12">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">기준 스냅샷 (A)</label>
                          <select className="w-full h-12 rounded-2xl border border-border bg-slate-50 px-5 text-sm font-bold outline-none cursor-pointer hover:bg-white transition-all shadow-inner" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                            <option value="">비교 대상을 선택하세요</option>
                            {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">대조 스냅샷 (B)</label>
                          <select className="w-full h-12 rounded-2xl border border-border bg-slate-50 px-5 text-sm font-bold outline-none cursor-pointer hover:bg-white transition-all shadow-inner" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                            <option value="">비교 대상을 선택하세요</option>
                            {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
                          </select>
                        </div>
                     </div>

                     {compareSnapA && compareSnapB && (
                       <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-12 p-8 bg-surface-muted rounded-[2.5rem] border border-border/50 shadow-inner"
                       >
                          <SnapshotDeltaCards prev={compareSnapA} next={compareSnapB} />
                       </motion.div>
                     )}

                     <div className="space-y-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-3">
                           <span className="h-px bg-slate-200 flex-1" />
                           Performance Indicators
                           <span className="h-px bg-slate-200 flex-1" />
                        </p>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <TrendRow label="월 저축액" values={monthlySavingTrend} color="#059669" />
                          <TrendRow label="비상금 부족" values={emergencyGapTrend} color="#dc2626" />
                          <TrendRow label="필요 적립액" values={goalRequiredTrend} color="#059669" />
                          <TrendRow label="부채 상환율" values={debtRatioTrend} color="#6366f1" />
                        </div>
                     </div>
                  </Card>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-12 flex justify-between items-center py-10 border-t border-border/50">
            <Button 
              variant="outline" 
              size="lg"
              className="w-44 h-14 rounded-full font-black text-xs uppercase tracking-widest bg-white shadow-md border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
              disabled={step === 0} 
              onClick={() => {
                setStep((s) => Math.max(0, s - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-3"><path d="m15 18-6-6 6-6"/></svg>
              PREVIOUS
            </Button>
            
            <div className="hidden sm:flex gap-3">
               {STEPS.map((_, i) => (
                 <div key={i} className={cn(
                   "h-1.5 rounded-full transition-all duration-500",
                   i === step ? "bg-primary w-12 shadow-[0_0_8px_var(--color-primary)]" : i < step ? "bg-primary/30 w-6" : "bg-slate-200 w-6"
                 )} />
               ))}
            </div>

            <Button 
              variant="primary" 
              size="lg"
              className="w-44 h-14 shadow-2xl shadow-primary/30 rounded-full font-black text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
              disabled={step === STEPS.length - 1} 
              onClick={() => {
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              CONTINUE
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-3"><path d="m9 18 6-6-6-6"/></svg>
            </Button>
          </div>
        </div>
      </div>

      <QuickViewModal
        open={quickView.open}
        onClose={() => setQuickView((prev) => ({ ...prev, open: false }))}
        kind={quickView.kind}
        title={quickView.title}
        hrefForNewTab={quickView.hrefForNewTab}
      />

      <PlaybookModal open={playbookOpen} onClose={() => setPlaybookOpen(false)} playbookId={playbookId} />
    </PageShell>
  );
}
