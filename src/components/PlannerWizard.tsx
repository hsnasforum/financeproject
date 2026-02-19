"use client";

import { useMemo, useState } from "react";
import { QuickViewModal, type QuickViewKind } from "@/components/QuickViewModal";
import { PlaybookModal } from "@/components/PlaybookModal";
import { SnapshotDeltaCards } from "@/components/SnapshotDeltaCards";
import { Sparkline } from "@/components/Sparkline";
import { PlannerExternalModules } from "@/components/PlannerExternalModules";
import { buildBenefitQueries, inferSubscriptionRegion } from "@/lib/planner/executionHints";
import { buildPlan, type PlannerInput } from "@/lib/planner/plan";
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
  retirementAssets: 0,
};

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
  return `${divided.toFixed(1)} ${unit === "MANWON" ? "만원" : "원"}`;
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
    <div className="flex items-center justify-between rounded border p-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-slate-500">최근 변화 {sign}{diff.toFixed(2)}</p>
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
    const num = Number(value);
    setInput((prev) => ({ ...prev, [key]: Number.isFinite(num) ? num : 0 }));
  }

  function setText(key: keyof PlannerInput, value: string) {
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
    setInput(snap.input);
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

  return (
    <main className="py-8 ">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold">{uiTextKo.planner.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{uiTextKo.planner.subtitle}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-sm shadow-card">
        <span className="font-medium">링크 열기 방식</span>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="link-open-mode"
            checked={linkOpenMode === "quickview"}
            onChange={() => {
              setLinkOpenModeState("quickview");
              setLinkOpenMode("quickview");
            }}
          />
          빠른 보기(현재 화면 유지)
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name="link-open-mode"
            checked={linkOpenMode === "newtab"}
            onChange={() => {
              setLinkOpenModeState("newtab");
              setLinkOpenMode("newtab");
            }}
          />
          새 탭 열기
        </label>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {STEPS.map((label, idx) => (
          <button
            key={label}
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm ${step === idx ? "border-primary bg-primary text-white" : "border-border bg-surface text-slate-700"}`}
            onClick={() => setStep(idx)}
          >
            {idx + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <section className="mt-6 grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
          <label className="text-sm">목표 이름
            <input className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.goalName} onChange={(e) => setText("goalName", e.target.value)} />
          </label>
          <label className="text-sm">단위
            <select className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.unit} onChange={(e) => setText("unit", e.target.value as PlannerInput["unit"])}>
              <option value="MANWON">만원</option>
              <option value="KRW">원</option>
            </select>
          </label>
          <label className="text-sm">목표금액
            <input className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.goalAmount} onChange={(e) => setNumber("goalAmount", e.target.value)} />
          </label>
          <label className="text-sm">목표기한(개월)
            <input className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.goalDeadlineMonths} onChange={(e) => setNumber("goalDeadlineMonths", e.target.value)} />
          </label>
          <label className="text-sm">목표 우선순위
            <select className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.goalPriority} onChange={(e) => setText("goalPriority", e.target.value as PlannerInput["goalPriority"])}>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
          </label>
          <label className="text-sm">위험성향
            <select className="mt-1 w-full rounded-xl border border-border px-3 py-2" value={input.riskProfile} onChange={(e) => setText("riskProfile", e.target.value as PlannerInput["riskProfile"])}>
              <option value="conservative">안정형</option>
              <option value="balanced">중립형</option>
              <option value="aggressive">공격형</option>
            </select>
          </label>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="mt-6 grid gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:grid-cols-2">
          <label className="text-sm">월소득(세후)
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.monthlyIncome} onChange={(e) => setNumber("monthlyIncome", e.target.value)} />
          </label>
          <label className="text-sm">월고정지출
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.monthlyFixedExpense} onChange={(e) => setNumber("monthlyFixedExpense", e.target.value)} />
          </label>
          <label className="text-sm">월변동지출
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.monthlyVariableExpense} onChange={(e) => setNumber("monthlyVariableExpense", e.target.value)} />
          </label>
          <label className="text-sm">현금성자산
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.cashAssets} onChange={(e) => setNumber("cashAssets", e.target.value)} />
          </label>
          <label className="text-sm">부채잔액
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.debtBalance} onChange={(e) => setNumber("debtBalance", e.target.value)} />
          </label>
          <label className="text-sm">부채연이율(%)
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.debtRateAnnual} onChange={(e) => setNumber("debtRateAnnual", e.target.value)} />
          </label>
          <label className="text-sm">월부채상환
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.monthlyDebtPayment} onChange={(e) => setNumber("monthlyDebtPayment", e.target.value)} />
          </label>
          <label className="text-sm">비상금 목표개월
            <select className="mt-1 w-full rounded border px-3 py-2" value={input.emergencyTargetMonths} onChange={(e) => setNumber("emergencyTargetMonths", e.target.value)}>
              <option value={3}>3개월</option>
              <option value={4}>4개월</option>
              <option value={6}>6개월</option>
            </select>
          </label>
          <label className="text-sm">가정 연수익률(%)
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.assumedAnnualReturn} onChange={(e) => setNumber("assumedAnnualReturn", e.target.value)} />
          </label>
          <label className="text-sm">가정 물가상승률(%)
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.assumedInflationRate} onChange={(e) => setNumber("assumedInflationRate", e.target.value)} />
          </label>
          <label className="text-sm">보험 상태
            <select className="mt-1 w-full rounded border px-3 py-2" value={input.insuranceStatus} onChange={(e) => setText("insuranceStatus", e.target.value as PlannerInput["insuranceStatus"])}>
              <option value="unknown">모름</option>
              <option value="none">없음</option>
              <option value="basic">기본 있음</option>
              <option value="adequate">충분</option>
            </select>
          </label>
          <label className="text-sm">노후자산(현재)
            <input className="mt-1 w-full rounded border px-3 py-2" value={input.retirementAssets} onChange={(e) => setNumber("retirementAssets", e.target.value)} />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="mt-6 space-y-4">
          <PlannerExternalModules />
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <p className="text-sm font-semibold">{plan.summaryLine}</p>
            <p className="mt-2 text-sm">현금흐름: {formatMoney(plan.metrics.freeCashflow, input.unit)} · 월저축 {formatMoney(plan.metrics.monthlySaving, input.unit)}</p>
            <p className="text-sm">비상금: {plan.metrics.emergencyMonths.toFixed(1)}개월 · 목표부족 {formatMoney(plan.metrics.emergencyGap, input.unit)}</p>
            <p className="text-sm">부채부담: {(plan.metrics.debtPaymentRatio * 100).toFixed(1)}% · 상환가능 {plan.metrics.debtPayoffFeasible ? "가능" : "재조정 필요"}</p>
            <p className="text-sm">목표가능성: {plan.metrics.goalFeasible ? "가능" : "부족"} (필요 월적립 {formatMoney(plan.metrics.goalRequiredMonthly, input.unit)})</p>
          </div>

          {plan.recommendations.map((rec) => (
            <article key={rec.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <p className="text-xs font-medium text-slate-500">{rec.priority} · {rec.category} · {rec.id}</p>
              <h3 className="mt-1 text-lg font-semibold">{rec.title}</h3>

              <p className="mt-2 text-sm font-medium">{uiTextKo.planner.cardWhy}</p>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {rec.rationale.map((line) => <li key={line}>{line}</li>)}
              </ul>

              <p className="mt-2 text-sm font-medium">{uiTextKo.planner.cardActions}</p>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {rec.actions.map((action) => (
                  <li key={action.label} className="mt-1 flex flex-wrap items-center gap-2">
                    <span>{action.label}</span>
                    {action.href ? (
                      <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openAction(action)}>
                        {linkOpenMode === "newtab" ? "새 탭 열기" : "빠른 보기"}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>

              {rec.assumptions?.length ? (
                <>
                  <p className="mt-2 text-sm font-medium">{uiTextKo.planner.cardAssumptions}</p>
                  <ul className="list-disc pl-5 text-sm text-slate-700">
                    {rec.assumptions.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </>
              ) : null}

              <p className="mt-2 text-xs text-slate-500">{uiTextKo.planner.cardCaution}: {rec.caution ?? "확정 수익/확정 결과가 아닌 가정 기반 권고입니다."}</p>
              <p className="mt-1 text-xs text-slate-500">근거 규칙: {rec.triggeredBy.join(" | ")}</p>
            </article>
          ))}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h2 className="text-lg font-semibold">{uiTextKo.planner.sectionExecution}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">이번 주</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {plan.checklist.filter((it) => it.bucket === "이번 주").map((item) => (
                  <li key={item.id}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={Boolean(checkedMap[item.id])} onChange={() => toggleChecklist(item.id)} />
                      <div>
                        <p>{item.label}</p>
                        <p className="text-xs text-slate-500">근거: {item.reason}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {item.href ? (
                            <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openAction({ label: item.label, href: item.href })}>
                              {linkOpenMode === "newtab" ? "새 탭 열기" : "빠른 보기"}
                            </button>
                          ) : null}
                          {item.playbookId ? (
                            <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openPlaybook(item.playbookId)}>
                              방법 보기
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium">이번 달</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {plan.checklist.filter((it) => it.bucket === "이번 달").map((item) => (
                  <li key={item.id}>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={Boolean(checkedMap[item.id])} onChange={() => toggleChecklist(item.id)} />
                      <div>
                        <p>{item.label}</p>
                        <p className="text-xs text-slate-500">근거: {item.reason}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {item.href ? (
                            <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openAction({ label: item.label, href: item.href })}>
                              {linkOpenMode === "newtab" ? "새 탭 열기" : "빠른 보기"}
                            </button>
                          ) : null}
                          {item.playbookId ? (
                            <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-slate-50" onClick={() => openPlaybook(item.playbookId)}>
                              방법 보기
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-surface-muted p-3 text-sm">
            <p className="font-medium">바로 이동</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="rounded border px-3 py-1.5 hover:bg-white" onClick={() => openAction({ label: "환율 도구 열기", href: "/tools/fx" })}>환율 도구 열기</button>
              <button type="button" className="rounded border px-3 py-1.5 hover:bg-white" onClick={() => openAction({ label: "예금 후보 보기", href: "/products/deposit" })}>예금 후보 보기</button>
              <button type="button" className="rounded border px-3 py-1.5 hover:bg-white" onClick={() => openAction({ label: "적금 후보 보기", href: "/products/saving" })}>적금 후보 보기</button>
              <button type="button" className="rounded border px-3 py-1.5 hover:bg-white" onClick={() => openAction({ label: "프로필 기반 추천 보기", href: "/recommend" })}>프로필 기반 추천 보기</button>
              {benefitQueries.map((query) => (
                <button
                  key={query}
                  type="button"
                  className="rounded border px-3 py-1.5 hover:bg-white"
                  onClick={() => openAction({ label: `혜택 후보 보기(${query})`, href: `/benefits?query=${encodeURIComponent(query)}` })}
                >
                  혜택 후보 보기({query})
                </button>
              ))}
              <button
                type="button"
                className="rounded border px-3 py-1.5 hover:bg-white"
                onClick={() => openAction({ label: `청약/분양 일정 보기(${subscriptionRegion})`, href: `/housing/subscription?region=${encodeURIComponent(subscriptionRegion)}` })}
              >
                청약/분양 일정 보기({subscriptionRegion})
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">혜택/청약 일정은 자격 조건과 공고 변경에 따라 달라질 수 있습니다.</p>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <h2 className="text-lg font-semibold">{uiTextKo.planner.sectionMonitoring}</h2>
            <p className="mt-2 text-sm">다음 점검일: <b>{plan.monitoring.nextReviewDate}</b></p>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              {plan.monitoring.triggers.map((t) => <li key={t}>{t}</li>)}
            </ul>

            <button className="mt-3 rounded bg-slate-900 px-3 py-2 text-sm text-white" onClick={saveCurrentSnapshot}>스냅샷 저장</button>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-base font-semibold">저장된 스냅샷</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {snapshots.slice(0, 10).map((snap) => (
                <li key={snap.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <span>{snap.createdAt.slice(0, 16)} · {snap.input.goalName}</span>
                  <button className="rounded border px-2 py-1" onClick={() => applySnapshot(snap.id)}>불러오기</button>
                  <button className="rounded border px-2 py-1" onClick={() => { deleteSnapshot(snap.id); setSnapshots(listSnapshots()); }}>삭제</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-base font-semibold">스냅샷 비교</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <select className="rounded border px-2 py-2" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                <option value="">기준 스냅샷 선택</option>
                {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
              </select>
              <select className="rounded border px-2 py-2" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                <option value="">비교 스냅샷 선택</option>
                {snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.createdAt.slice(0, 16)} - {snap.input.goalName}</option>)}
              </select>
            </div>

            <div className="mt-3">
              <SnapshotDeltaCards prev={compareSnapA} next={compareSnapB} />
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">최근 10개 스냅샷 추세</p>
              <TrendRow label="월저축액" values={monthlySavingTrend} color="#0f766e" />
              <TrendRow label="비상금 부족분" values={emergencyGapTrend} color="#dc2626" />
              <TrendRow label="목표 필요 월적립액" values={goalRequiredTrend} color="#2563eb" />
              <TrendRow label="부채부담률(%p)" values={debtRatioTrend} color="#7c3aed" />
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>이전</button>
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>다음</button>
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
    </main>
  );
}
