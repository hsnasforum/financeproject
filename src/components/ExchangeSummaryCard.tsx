"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

type ExchangeResponse = {
  ok: boolean;
  data?: {
    asOf: string;
    rates: Record<string, number>;
  };
  assumptions?: {
    note?: string;
  };
  meta?: {
    fallbackDays?: number;
  };
  error?: {
    code: string;
    message: string;
  };
};

type ExchangeCardFreshnessMeta = {
  sourceId: "exchange";
  kind: "exchange";
  lastSyncedAt: string | null;
  fallbackMode?: string | null;
  assumptionNotes: string[];
};

function renderError(error?: { code: string; message: string }) {
  if (!error) return "환율 데이터를 불러오지 못했습니다.";

  if (error.code === "ENV_MISSING") {
    return "API 설정이 필요합니다.";
  }
  return `환율 API 오류 (${error.code})`;
}

function formatExchangeDateLabel(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 10);
}

function buildExchangeFreshnessMeta(payload: ExchangeResponse | null): ExchangeCardFreshnessMeta | null {
  if (!payload?.ok || !payload.data) return null;

  const lastSyncedAt = typeof payload.data.asOf === "string" && payload.data.asOf ? payload.data.asOf : null;
  const fallbackMode =
    typeof payload.meta?.fallbackDays === "number" && payload.meta.fallbackDays > 0 ? "최근 영업일 기준" : null;
  const note = typeof payload.assumptions?.note === "string" ? payload.assumptions.note.trim() : "";
  const assumptionNotes = note ? [note] : [];

  if (!lastSyncedAt && !fallbackMode && assumptionNotes.length === 0) return null;

  return {
    sourceId: "exchange",
    kind: "exchange",
    lastSyncedAt,
    ...(fallbackMode ? { fallbackMode } : {}),
    assumptionNotes,
  };
}

export function ExchangeSummaryCard() {
  const [state, setState] = useState<{ loading: boolean; payload: ExchangeResponse | null }>({ loading: true, payload: null });
  const freshnessMeta = !state.loading ? buildExchangeFreshnessMeta(state.payload) : null;

  useEffect(() => {
    let aborted = false;
    async function run() {
      try {
        const res = await fetch("/api/public/exchange", { cache: "no-store" });
        const json = (await res.json()) as ExchangeResponse;
        if (!aborted) setState({ loading: false, payload: json });
      } catch {
        if (!aborted) {
          setState({ loading: false, payload: { ok: false, error: { code: "FETCH_FAILED", message: "환율 API 호출 실패" } } });
        }
      }
    }
    void run();
    return () => {
      aborted = true;
    };
  }, []);

  return (
    <Card className="p-8 border border-slate-100 shadow-xl shadow-slate-200/50 bg-white overflow-hidden relative rounded-[2rem] hover:shadow-2xl hover:shadow-emerald-900/5 hover:-translate-y-1 transition-all duration-300">
      <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-emerald-50 blur-2xl" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Market Rates</p>
        </div>

        {state.loading ? (
          <div className="space-y-4">
            <div className="h-8 w-full bg-slate-50 animate-pulse rounded-xl" />
            <div className="h-20 w-full bg-slate-50 animate-pulse rounded-xl" />
          </div>
        ) : null}

        {!state.loading && state.payload?.ok && state.payload.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { code: "USD", name: "달러", val: state.payload.data.rates.USD },
                { code: "JPY", name: "엔화", val: state.payload.data.rates.JPY },
                { code: "EUR", name: "유로", val: state.payload.data.rates.EUR },
              ].map((cur) => (
                <div key={cur.code} className="bg-slate-50 border border-slate-100 rounded-2xl p-3 flex flex-col items-center gap-1 group/rate transition-colors hover:border-emerald-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{cur.code}</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums tracking-tight group-hover/rate:text-emerald-600 transition-colors">{cur.val?.toLocaleString() ?? "-"}</span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200/50">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-700">오늘의 경제 지표</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">환율 정보를 바탕으로 최적의 설계를 진행합니다.</p>
                </div>
              </div>
            </div>

            {freshnessMeta ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/90 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">결과 기준</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {freshnessMeta.lastSyncedAt ? (
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      기준 확인 {formatExchangeDateLabel(freshnessMeta.lastSyncedAt)}
                    </span>
                  ) : null}
                  {freshnessMeta.fallbackMode ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100">
                      {freshnessMeta.fallbackMode}
                    </span>
                  ) : null}
                </div>
                {freshnessMeta.assumptionNotes[0] ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    유의: {freshnessMeta.assumptionNotes[0]}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!state.loading && state.payload && !state.payload.ok ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4 border border-red-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            </div>
            <p className="text-sm font-bold text-slate-900">{renderError(state.payload.error)}</p>
            <Link href="/settings/data-sources" className="mt-4 text-xs font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest transition-colors">
              데이터 신뢰 확인 →
            </Link>
          </div>
        ) : null}
      </div>
    </Card>
  );
}