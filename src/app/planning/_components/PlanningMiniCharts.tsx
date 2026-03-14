"use client";

import { Sparkline } from "@/components/Sparkline";
import { type PlanningChartPoint } from "@/lib/planning/v2/chartPoints";
import { formatKrw } from "@/lib/planning/i18n/format";
import { t, type Locale } from "@/lib/planning/i18n";
import { cn } from "@/lib/utils";
import { BodyTableFrame } from "@/components/ui/BodyTone";

type PlanningMiniChartsProps = {
  points: PlanningChartPoint[];
  mode: "full" | "key";
  locale: Locale;
};

type MetricKey = "netWorthKrw" | "cashKrw" | "totalDebtKrw";

function pickTablePoints(points: PlanningChartPoint[]): PlanningChartPoint[] {
  if (points.length <= 12) return points;

  const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const seen = new Set<number>();
  const sampled: PlanningChartPoint[] = [];
  for (const index of indexes) {
    if (index < 0 || index >= points.length || seen.has(index)) continue;
    seen.add(index);
    sampled.push(points[index]);
  }
  return sampled;
}

function summarizeMetric(points: PlanningChartPoint[], key: MetricKey): {
  start: number;
  mid: number;
  end: number;
  min: number;
  max: number;
  deltaPct: number;
} {
  const values = points.map((item) => item[key]);
  const start = values[0] ?? 0;
  const mid = values[Math.floor((values.length - 1) / 2)] ?? start;
  const end = values[values.length - 1] ?? start;
  const deltaPct = start === 0 ? 0 : ((end - start) / Math.abs(start)) * 100;

  return {
    start,
    mid,
    end,
    min: Math.min(...values),
    max: Math.max(...values),
    deltaPct,
  };
}

function RangeVisualization({ min, max, current, color }: { min: number; max: number; current: number; color: string }) {
  const range = max - min || 1;
  const progress = Math.min(100, Math.max(0, ((current - min) / range) * 100));

  return (
    <div className="group/range relative mt-2">
      <div className="h-1.5 w-full rounded-full bg-slate-100" />
      <div
        className="absolute inset-y-0 left-0 h-1.5 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${progress}%`, backgroundColor: color, opacity: 0.3 }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-full shadow-sm transition-all duration-500 ease-out"
        style={{ left: `${progress}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function PlanningMiniCharts({ points, mode, locale }: PlanningMiniChartsProps) {
  const tablePoints = pickTablePoints(points);
  const metrics: Array<{ key: MetricKey; title: string; color: string; tone: string }> = [
    { key: "netWorthKrw", title: t(locale, "CHART_LABEL_NET_WORTH"), color: "#10b981", tone: "emerald" }, // emerald-500
    { key: "cashKrw", title: t(locale, "CHART_LABEL_CASH"), color: "#0ea5e9", tone: "sky" }, // sky-500
    { key: "totalDebtKrw", title: t(locale, "CHART_LABEL_TOTAL_DEBT"), color: "#f59e0b", tone: "amber" }, // amber-500
  ];

  return (
    <div className="space-y-8">
      {mode === "key" ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 leading-relaxed italic">
          💡 {t(locale, "CHART_KEY_MODE_NOTICE")}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {metrics.map((metric) => {
          const summary = summarizeMetric(points, metric.key);
          const values = points.map((item) => item[metric.key]);
          const isPositive = summary.deltaPct >= 0;
          const deltaColor = metric.tone === "amber"
            ? (isPositive ? "text-rose-600 bg-rose-50" : "text-emerald-600 bg-emerald-50")
            : (isPositive ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50");

          return (
            <div className="group flex flex-col rounded-[2.5rem] border border-slate-200/60 bg-white p-7 shadow-sm transition-all hover:shadow-md" key={metric.key}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{metric.title}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums", deltaColor)}>
                  {isPositive ? "+" : ""}{summary.deltaPct.toFixed(1)}%
                </span>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <p className="text-2xl font-black text-slate-900 tracking-tight tabular-nums">{formatKrw(locale, summary.end)}</p>
                <p className="text-[11px] font-bold text-slate-400">말기</p>
              </div>

              <div className="mt-8 flex h-16 items-end">
                <Sparkline
                  color={metric.color}
                  values={values}
                  width={280}
                  height={64}
                  fillOpacity={0.08}
                />
              </div>

              <div className="mt-auto pt-6">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Range (Min/Max)</span>
                </div>
                <RangeVisualization
                  color={metric.color}
                  current={summary.end}
                  max={summary.max}
                  min={summary.min}
                />
                <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-500 tabular-nums">
                  <span>{formatKrw(locale, summary.min)}</span>
                  <span>{formatKrw(locale, summary.max)}</span>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-5">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">시작</p>
                  <p className="text-xs font-bold text-slate-600 tabular-nums">{formatKrw(locale, summary.start)}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">중간</p>
                  <p className="text-xs font-bold text-slate-600 tabular-nums">{formatKrw(locale, summary.mid)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">상세 수치 (Sampled)</p>
        </div>
        <BodyTableFrame>
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4 text-left">월 (Index)</th>
                <th className="px-6 py-4 text-right">순자산</th>
                <th className="px-6 py-4 text-right">현금</th>
                <th className="px-6 py-4 text-right">총부채</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {tablePoints.map((point) => (
                <tr className="group/row hover:bg-slate-50/50 transition-colors" key={point.monthIndex}>
                  <td className="px-6 py-4 text-xs font-black text-slate-400 tabular-nums">M{point.monthIndex + 1}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums group-hover/row:text-emerald-600 transition-colors">{formatKrw(locale, point.netWorthKrw)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums group-hover/row:text-sky-600 transition-colors">{formatKrw(locale, point.cashKrw)}</td>
                  <td className="px-6 py-4 text-right text-xs font-bold text-slate-700 tabular-nums group-hover/row:text-amber-600 transition-colors">{formatKrw(locale, point.totalDebtKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </BodyTableFrame>
      </div>
    </div>
  );
}

export default PlanningMiniCharts;
