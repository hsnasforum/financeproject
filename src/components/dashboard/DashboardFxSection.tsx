import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  formatDashboardDate as formatDate,
  formatDashboardKrw as formatKrw,
  type DashboardExchange,
  type DashboardFx,
} from "@/components/dashboard/dashboardClientModel";

const fxLinkClassName = "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function DashboardFxSection({ fx, exchange, loading }: {
  fx: DashboardFx | null;
  exchange: DashboardExchange | null;
  loading: boolean;
}) {
  const showQuotes = fx !== null && (fx.state === "live" || fx.state === "cache" || fx.state === "mock");
  const needsAttention = fx !== null && fx.state !== "live" && fx.state !== "cache";
  return (
    <section className="space-y-3" aria-labelledby="dashboard-fx-title" data-testid="dashboard-fx" data-fx-state={loading ? "loading" : fx?.state ?? "none"}>
      <h2 id="dashboard-fx-title" className="text-base font-bold text-navy">환율과 생활 도구</h2>
      {loading ? <p className="text-sm text-slate-500">보조 정보를 불러오는 중입니다.</p> : !fx ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={cn("rounded-full px-3 py-1", needsAttention ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700")}>{fx.status.label}</span>
            {showQuotes ? (
              <span className={cn("rounded-full px-3 py-1", fx.status.isStale ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{fx.status.freshnessLabel}</span>
            ) : null}
          </div>
          {showQuotes ? (
            <>
              <p className="break-words text-sm leading-6 text-slate-600">출처 {fx.status.sourceLabel} · 기준일 {fx.status.asOf ?? "미확인"}</p>
              {fx.items.map((item) => (
                <div key={item.currency} className="border-b border-slate-100 pb-3 text-sm leading-6">
                  <p className="font-semibold text-navy">
                    {fx.status.isExample ? <span className="mr-1 text-amber-800">[예시]</span> : null}
                    {item.currency} {item.amount.toLocaleString("ko-KR")} = {formatKrw(item.krw)}
                  </p>
                  <p className="text-slate-500">적용 환율 {typeof item.rate === "number" ? item.rate.toLocaleString("ko-KR") : "-"} · 기준일 {item.asOfDate ? formatDate(item.asOfDate) : "미확인"}</p>
                </div>
              ))}
            </>
          ) : null}
          <p role={needsAttention ? "status" : undefined} className={cn("break-words text-sm leading-6", needsAttention ? "font-medium text-amber-900" : "text-slate-600")}>{fx.status.notice}</p>
        </>
      )}
      {!loading && exchange ? (
        exchange.usdRate !== null ? (
          <>
            <p className="break-words text-sm leading-6 text-slate-600">
              시장 기준 환율: USD 1 = {exchange.usdRate.toLocaleString("ko-KR")}원 · 기준일 {exchange.asOf ?? "미확인"} · 출처 {exchange.sourceLabel} · {exchange.label}
            </p>
            {exchange.state === "degraded-cache" ? (
              <p role="status" className="break-words text-sm font-medium leading-6 text-amber-900">{exchange.notice}</p>
            ) : null}
          </>
        ) : (
          <p className="break-words text-sm leading-6 text-amber-900">시장 기준 환율: {exchange.label}. {exchange.notice}</p>
        )
      ) : null}
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/tools/fx" className={fxLinkClassName}>환율 계산기 →</Link>
        {needsAttention || (exchange !== null && (exchange.usdRate === null || exchange.state === "degraded-cache")) ? (
          <Link href="/settings/data-sources" className={fxLinkClassName}>데이터 연결 설정 확인 →</Link>
        ) : null}
      </div>
    </section>
  );
}
