"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { deriveSummary } from "@/app/planning/_lib/profileFormModel";
import {
  buildPlanningWizardOutput,
  type PlanningWizardDraft,
  type PlanningWizardOutput,
} from "@/app/planning/_lib/planningOnboardingWizard";
import { PLANNING_DEFAULTS } from "@/app/planning/_lib/planningDefaults";

type PlanningOnboardingWizardProps = {
  disabled?: boolean;
  onApply: (output: PlanningWizardOutput) => void;
};

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "1) 수입/지출",
  2: "2) 부채",
  3: "3) 목표",
  4: "4) 검토",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatGroupedIntegerInput(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return new Intl.NumberFormat("ko-KR").format(Math.round(numeric));
}

function toNumber(value: string): number | undefined {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

export default function PlanningOnboardingWizard({ disabled = false, onApply }: PlanningOnboardingWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<PlanningWizardDraft>({
    debts: [],
    goals: [],
  });

  const preview = useMemo(
    () => buildPlanningWizardOutput(draft),
    [draft],
  );
  const previewSummary = useMemo(
    () => deriveSummary(preview.profile),
    [preview.profile],
  );

  function updateDraft<K extends keyof PlanningWizardDraft>(key: K, value: PlanningWizardDraft[K]): void {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function upsertDebt(index: number, patch: Partial<NonNullable<PlanningWizardDraft["debts"]>[number]>): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.debts) ? [...prev.debts] : [];
      const before = current[index] ?? {};
      current[index] = { ...before, ...patch };
      return { ...prev, debts: current };
    });
  }

  function removeDebt(index: number): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.debts) ? [...prev.debts] : [];
      current.splice(index, 1);
      return { ...prev, debts: current };
    });
  }

  function addDebt(): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.debts) ? [...prev.debts] : [];
      current.push({});
      return { ...prev, debts: current };
    });
  }

  function upsertGoal(index: number, patch: Partial<NonNullable<PlanningWizardDraft["goals"]>[number]>): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.goals) ? [...prev.goals] : [];
      const before = current[index] ?? {};
      current[index] = { ...before, ...patch };
      return { ...prev, goals: current };
    });
  }

  function removeGoal(index: number): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.goals) ? [...prev.goals] : [];
      current.splice(index, 1);
      return { ...prev, goals: current };
    });
  }

  function addGoal(): void {
    setDraft((prev) => {
      const current = Array.isArray(prev.goals) ? [...prev.goals] : [];
      current.push({});
      return { ...prev, goals: current };
    });
  }

  function goNext(): void {
    setStep((prev) => (prev >= 4 ? 4 : ((prev + 1) as WizardStep)));
  }

  function goBack(): void {
    setStep((prev) => (prev <= 1 ? 1 : ((prev - 1) as WizardStep)));
  }

  function applyWizard(): void {
    const output = buildPlanningWizardOutput(draft, { appliedAt: new Date().toISOString() });
    onApply(output);
  }

  const debts = Array.isArray(draft.debts) ? draft.debts : [];
  const goals = Array.isArray(draft.goals) ? draft.goals : [];

  return (
    <Card className="mb-6 space-y-4" data-testid="planning-onboarding-wizard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">온보딩 위저드</h2>
          <p className="text-xs text-slate-600">초기 프로필을 4단계로 빠르게 만듭니다. 기본값 적용 내역을 함께 저장합니다.</p>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px] text-slate-600">
          {(Object.keys(STEP_LABELS) as unknown as WizardStep[]).map((id) => (
            <span
              className={`rounded-full border px-2 py-0.5 ${id === step ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50"}`}
              key={id}
            >
              {STEP_LABELS[id]}
            </span>
          ))}
        </div>
      </div>

      {step === 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            월 실수령(원)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.monthlyIncomeNet)}
              onChange={(event) => updateDraft("monthlyIncomeNet", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            필수지출(원)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.monthlyEssentialExpenses)}
              onChange={(event) => updateDraft("monthlyEssentialExpenses", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            선택지출(원)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.monthlyDiscretionaryExpenses)}
              onChange={(event) => updateDraft("monthlyDiscretionaryExpenses", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            현금성 자산(원)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.liquidAssets)}
              onChange={(event) => updateDraft("liquidAssets", toNumber(event.target.value))}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            투자자산(원)
            <input
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
              inputMode="numeric"
              type="text"
              value={formatGroupedIntegerInput(draft.investmentAssets)}
              onChange={(event) => updateDraft("investmentAssets", toNumber(event.target.value))}
            />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">부채 입력(최소 필드)</p>
            <Button onClick={addDebt} size="sm" variant="outline">부채 추가</Button>
          </div>
          {debts.length < 1 ? (
            <p className="text-xs text-slate-500">부채가 없으면 비워두세요.</p>
          ) : (
            debts.map((debt, index) => (
              <div className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[0.9fr_1fr_1fr_0.8fr_0.9fr_auto]" key={`debt-row-${index}`}>
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="id(선택)"
                  value={debt.id ?? ""}
                  onChange={(event) => upsertDebt(index, { id: event.target.value })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="이름"
                  value={debt.name ?? ""}
                  onChange={(event) => upsertDebt(index, { name: event.target.value })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="잔액(원)"
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(debt.balance)}
                  onChange={(event) => upsertDebt(index, { balance: toNumber(event.target.value) })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="금리(%)"
                  type="number"
                  value={debt.aprPct ?? ""}
                  onChange={(event) => upsertDebt(index, { aprPct: toNumber(event.target.value) })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="월상환(원)"
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(debt.monthlyPayment)}
                  onChange={(event) => upsertDebt(index, { monthlyPayment: toNumber(event.target.value) })}
                />
                <Button onClick={() => removeDebt(index)} size="sm" variant="ghost">삭제</Button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">목표(선택)</p>
            <Button onClick={addGoal} size="sm" variant="outline">목표 추가</Button>
          </div>
          {goals.length < 1 ? (
            <p className="text-xs text-slate-500">입력하지 않으면 비상금 목표가 기본 생성됩니다.</p>
          ) : (
            goals.map((goal, index) => (
              <div className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_0.9fr_0.8fr_0.7fr_auto]" key={`goal-row-${index}`}>
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="목표명"
                  value={goal.name ?? ""}
                  onChange={(event) => upsertGoal(index, { name: event.target.value })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="목표액(원)"
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(goal.targetAmount)}
                  onChange={(event) => upsertGoal(index, { targetAmount: toNumber(event.target.value) })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="현재액(원)"
                  inputMode="numeric"
                  type="text"
                  value={formatGroupedIntegerInput(goal.currentAmount)}
                  onChange={(event) => upsertGoal(index, { currentAmount: toNumber(event.target.value) })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="목표월"
                  type="number"
                  value={goal.targetMonth ?? ""}
                  onChange={(event) => upsertGoal(index, { targetMonth: toNumber(event.target.value) })}
                />
                <input
                  className="h-9 rounded-lg border border-slate-300 px-2 text-xs"
                  placeholder="우선순위"
                  type="number"
                  value={goal.priority ?? ""}
                  onChange={(event) => upsertGoal(index, { priority: toNumber(event.target.value) })}
                />
                <Button onClick={() => removeGoal(index)} size="sm" variant="ghost">삭제</Button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">검토</p>
          <p>월 잉여금: {formatNumber(previewSummary.monthlySurplusKrw)}원</p>
          <p>DSR: {previewSummary.dsrPct.toFixed(1)}%</p>
          <p>비상금 목표: {formatNumber(previewSummary.emergencyTargetKrw)}원 ({previewSummary.emergencyMonths}개월)</p>
          <p>총 부채 월상환: {formatNumber(previewSummary.totalDebtPayment)}원</p>
          <p>적용 기본 정책: emergencyMonths={PLANNING_DEFAULTS.emergencyMonths}, goalPriority={PLANNING_DEFAULTS.goalPriority}</p>
          <div>
            <p className="font-semibold text-slate-900">defaultsApplied</p>
            {preview.defaultsApplied.items.length < 1 ? (
              <p>-</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {preview.defaultsApplied.items.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button disabled={step <= 1} onClick={goBack} size="sm" variant="ghost">이전</Button>
        <div className="flex gap-2">
          <Button disabled={step >= 4} onClick={goNext} size="sm" variant="outline">다음</Button>
          <Button
            disabled={disabled}
            onClick={applyWizard}
            size="sm"
            variant="primary"
          >
            위저드 결과 적용
          </Button>
        </div>
      </div>
    </Card>
  );
}
