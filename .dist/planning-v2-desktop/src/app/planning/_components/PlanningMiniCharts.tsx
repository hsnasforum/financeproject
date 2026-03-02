"use client";

import { Sparkline } from "@/components/Sparkline";
import { type PlanningChartPoint } from "@/lib/planning/v2/chartPoints";
import { formatKrw } from "@/lib/planning/i18n/format";
import { t, type Locale } from "@/lib/planning/i18n";

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
} {
  const values = points.map((item) => item[key]);
  const start = values[0] ?? 0;
  const mid = values[Math.floor((values.length - 1) / 2)] ?? start;
  const end = values[values.length - 1] ?? start;
  return {
    start,
    mid,
    end,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function PlanningMiniCharts({ points, mode, locale }: PlanningMiniChartsProps) {
  const tablePoints = pickTablePoints(points);
  const metrics: Array<{ key: MetricKey; title: string; color: string }> = [
    { key: "netWorthKrw", title: t(locale, "CHART_LABEL_NET_WORTH"), color: "#0f766e" },
    { key: "cashKrw", title: t(locale, "CHART_LABEL_CASH"), color: "#1d4ed8" },
    { key: "totalDebtKrw", title: t(locale, "CHART_LABEL_TOTAL_DEBT"), color: "#b45309" },
  ];

  return (
    <div className="space-y-3">
      {mode === "key" ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {t(locale, "CHART_KEY_MODE_NOTICE")}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map((metric) => {
          const summary = summarizeMetric(points, metric.key);
          const values = points.map((item) => item[metric.key]);
          return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" key={metric.key}>
              <p className="font-semibold text-slate-900">{metric.title}</p>
              <div className="mt-2">
                <Sparkline color={metric.color} values={values} width={220} />
              </div>
              <p className="mt-2">
                {t(locale, "CHART_SUMMARY_POINTS")}: {formatKrw(locale, summary.start)} / {formatKrw(locale, summary.mid)} / {formatKrw(locale, summary.end)}
              </p>
              <p>
                {t(locale, "CHART_SUMMARY_MIN_MAX")}: {formatKrw(locale, summary.min)} / {formatKrw(locale, summary.max)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-xs text-slate-700">
          <caption className="sr-only">
            월별 순자산, 현금, 총부채 수치 표
          </caption>
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2">월</th>
              <th className="px-2 py-2">순자산</th>
              <th className="px-2 py-2">현금</th>
              <th className="px-2 py-2">총부채</th>
            </tr>
          </thead>
          <tbody>
            {tablePoints.map((point) => (
              <tr className="border-t border-slate-200" key={point.monthIndex}>
                <td className="px-2 py-2">{point.monthIndex}</td>
                <td className="px-2 py-2">{formatKrw(locale, point.netWorthKrw)}</td>
                <td className="px-2 py-2">{formatKrw(locale, point.cashKrw)}</td>
                <td className="px-2 py-2">{formatKrw(locale, point.totalDebtKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PlanningMiniCharts;
