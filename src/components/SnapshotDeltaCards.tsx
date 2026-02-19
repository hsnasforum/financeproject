"use client";

import { type PlannerSnapshot } from "@/lib/planner/storage";
import { type PlannerInput } from "@/lib/planner/plan";

function formatMoney(baseValue: number, unit: PlannerInput["unit"]): string {
  const divided = unit === "MANWON" ? baseValue / 10000 : baseValue;
  return `${divided.toFixed(1)} ${unit === "MANWON" ? "만원" : "원"}`;
}

function progressPct(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(150, (value / target) * 100));
}

function deltaBadge(improved: boolean, changed: boolean): { label: string; className: string } {
  if (!changed) return { label: "변화 없음", className: "bg-slate-100 text-slate-600" };
  if (improved) return { label: "개선", className: "bg-emerald-100 text-emerald-700" };
  return { label: "악화", className: "bg-rose-100 text-rose-700" };
}

type DeltaRow = {
  key: string;
  label: string;
  prev: number;
  next: number;
  unitKind: "money" | "percent" | "months";
  higherIsBetter: boolean;
};

function renderValue(value: number, unitKind: DeltaRow["unitKind"], unit: PlannerInput["unit"]) {
  if (unitKind === "money") return formatMoney(value, unit);
  if (unitKind === "percent") return `${(value * 100).toFixed(1)}%`;
  return `${value.toFixed(1)}개월`;
}

export function SnapshotDeltaCards({ prev, next }: { prev: PlannerSnapshot | null; next: PlannerSnapshot | null }) {
  if (!prev || !next) {
    return <p className="text-sm text-slate-500">스냅샷 2개를 선택하면 델타 카드를 표시합니다.</p>;
  }

  const unit = next.input.unit;
  const rows: DeltaRow[] = [
    {
      key: "monthlySaving",
      label: "월저축액",
      prev: prev.metrics.monthlySaving,
      next: next.metrics.monthlySaving,
      unitKind: "money",
      higherIsBetter: true,
    },
    {
      key: "savingsRate",
      label: "저축률",
      prev: prev.metrics.savingsRate,
      next: next.metrics.savingsRate,
      unitKind: "percent",
      higherIsBetter: true,
    },
    {
      key: "emergencyMonths",
      label: "비상금 커버",
      prev: prev.metrics.emergencyMonths,
      next: next.metrics.emergencyMonths,
      unitKind: "months",
      higherIsBetter: true,
    },
    {
      key: "emergencyGap",
      label: "비상금 부족분",
      prev: prev.metrics.emergencyGap,
      next: next.metrics.emergencyGap,
      unitKind: "money",
      higherIsBetter: false,
    },
    {
      key: "goalRequiredMonthly",
      label: "목표 필요 월적립액",
      prev: prev.metrics.goalRequiredMonthly,
      next: next.metrics.goalRequiredMonthly,
      unitKind: "money",
      higherIsBetter: false,
    },
    {
      key: "debtPaymentRatio",
      label: "부채부담률",
      prev: prev.metrics.debtPaymentRatio,
      next: next.metrics.debtPaymentRatio,
      unitKind: "percent",
      higherIsBetter: false,
    },
  ];

  const emergencyProgress = progressPct(next.metrics.cashAssetsBase, next.metrics.emergencyTargetAmount);
  const goalProgress = progressPct(next.metrics.monthlySaving, next.metrics.goalRequiredMonthly);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const delta = row.next - row.prev;
          const changed = Math.abs(delta) > 1e-9;
          const improved = row.higherIsBetter ? delta > 0 : delta < 0;
          const badge = deltaBadge(improved, changed);
          const sign = delta > 0 ? "+" : "";
          const deltaText =
            row.unitKind === "money"
              ? `${sign}${formatMoney(delta, unit)}`
              : row.unitKind === "percent"
                ? `${sign}${(delta * 100).toFixed(1)}%p`
                : `${sign}${delta.toFixed(1)}개월`;

          return (
            <article key={row.key} className="rounded border bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{row.label}</p>
                <span className={`rounded px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">이전 {renderValue(row.prev, row.unitKind, unit)} → 현재 {renderValue(row.next, row.unitKind, unit)}</p>
              <p className="mt-1 text-sm font-semibold">변화: {deltaText}</p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border bg-white p-3">
          <p className="text-sm font-medium">비상금 목표 달성률</p>
          <div className="mt-2 h-2 w-full rounded bg-slate-200">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.min(100, emergencyProgress)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">{emergencyProgress.toFixed(1)}% (현금성자산/비상금 목표)</p>
        </div>

        <div className="rounded border bg-white p-3">
          <p className="text-sm font-medium">목표 월적립 커버율</p>
          <div className="mt-2 h-2 w-full rounded bg-slate-200">
            <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.min(100, goalProgress)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-600">{goalProgress.toFixed(1)}% (현재 월저축/필요 월적립)</p>
        </div>
      </div>
    </div>
  );
}
