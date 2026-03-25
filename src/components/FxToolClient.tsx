"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { formatKrwWithEok } from "@/lib/format/krw";
import { cn } from "@/lib/utils";

type FxRow = {
  currency: string;
  amount: number;
  rate: number | null;
  asOfDate: string | null;
  krw: number | null;
};

export function FxToolClient() {
  const [pairs, setPairs] = useState("USD:1000,JPY:50000");
  const [rows, setRows] = useState<FxRow[]>([]);
  const [totalKrw, setTotalKrw] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/public/fx?pairs=${encodeURIComponent(pairs)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error?.message ?? "환율 데이터를 불러오지 못했습니다.");
        setRows([]);
        setTotalKrw(0);
        return;
      }
      setRows(Array.isArray(json.data?.items) ? (json.data.items as FxRow[]) : []);
      setTotalKrw(typeof json.data?.totalKrw === "number" ? json.data.totalKrw : 0);
    } catch (err) {
      console.error("[fx-tool] fetch failed", err);
      setError("환율 데이터를 불러오지 못했습니다.");
      setRows([]);
      setTotalKrw(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="환율 자동 계산기"
        description="현재 조회 기준 환율로 외화 자산이나 지출 항목을 원화로 비교해 봅니다."
      />

      <div className="grid gap-8 lg:grid-cols-3 items-start">
        <Card className="rounded-[2rem] p-8 shadow-sm lg:col-span-1">
          <SubSectionHeader title="환산 설정" description="비교할 외화 자산이나 지출 항목을 입력하세요." />
          
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                외화 항목 (콤마 구분)
              </label>
              <input
                className="block w-full h-12 rounded-2xl border border-slate-200 bg-slate-50/50 px-5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner placeholder:text-slate-300"
                value={pairs}
                onChange={(e) => setPairs(e.target.value)}
                placeholder="예: USD:1000, JPY:50000"
              />
              <p className="text-[10px] font-medium text-slate-400 leading-relaxed px-1">
                기호:금액 형식으로 입력하며 여러 건은 콤마(,)로 구분합니다.
              </p>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed px-1">
                결과는 비교용 참고값이며 실제 환전·결제 금액은 수수료와 적용 시점에 따라 달라질 수 있습니다.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              className="w-full h-12 rounded-2xl font-black shadow-md"
              onClick={() => void run()}
              disabled={loading}
            >
              {loading ? "환율 조회 중..." : "원화로 환산하기"}
            </Button>

            {error ? (
              <p className="text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">{error}</p>
            ) : null}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className={cn("rounded-[2rem] p-8 shadow-sm transition-all border-2", rows.length > 0 ? "border-emerald-100 bg-white" : "border-dashed border-slate-100 bg-slate-50/30")}>
            <SubSectionHeader title="현재 기준 환산 결과" description={rows.length > 0 ? "현재 조회 기준 환율로 계산한 비교 결과입니다." : "환산 버튼을 누르면 여기에 비교 결과가 표시됩니다."} />
            
            {rows.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-sm font-black text-slate-400 tracking-[0.08em]">비교할 외화 항목을 입력하면 여기에 결과가 표시됩니다.</p>
              </div>
            ) : (
              <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="grid gap-4 sm:grid-cols-2">
                  {rows.map((row) => (
                    <div key={`${row.currency}-${row.amount}`} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 group hover:border-emerald-200 transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.currency} 항목</span>
                        <span className="text-[10px] font-bold text-slate-400 tabular-nums">기준 환율 {row.rate ?? "-"}</span>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <p className="text-sm font-bold text-slate-500 tracking-tight">{row.amount.toLocaleString()} {row.currency}</p>
                        <p className="text-lg font-black text-slate-900 tabular-nums">
                          {typeof row.krw === "number" ? formatKrwWithEok(row.krw) : "-"}
                        </p>
                      </div>
                      <p className="mt-3 text-[10px] font-medium text-slate-400 text-right">기준일: {row.asOfDate ?? "-"}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl bg-emerald-600 p-8 shadow-xl shadow-emerald-900/20 text-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">현재 기준 합계</p>
                      <p className="text-sm font-black text-white">원화 환산 합계</p>
                    </div>
                    <p className="text-3xl font-black tabular-nums tracking-tight">
                      {formatKrwWithEok(totalKrw)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-2">
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                    참고 지표입니다. 실제 환전/결제 시점의 고시 환율이나 수수료에 따라 결과가 다를 수 있습니다.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
