"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { type FinlifeCardFreshnessMeta, type FinlifeKind } from "@/lib/finlife/types";
import { formatOptionBonus, formatOptionRate, getOptionRates, type OptionRow } from "@/lib/finlife/optionView";
import { cn } from "@/lib/utils";

type Props = {
  row: OptionRow;
  kind: FinlifeKind;
  amountWonDefault: number;
  freshnessMeta?: FinlifeCardFreshnessMeta;
};

function formatFreshnessStatusLabel(status: NonNullable<FinlifeCardFreshnessMeta["freshnessStatus"]>): string {
  switch (status) {
    case "ok":
      return "최신";
    case "stale":
      return "기준 지남";
    case "error":
      return "최근 확인 실패";
    case "empty":
      return "기준 정보 없음";
    default:
      return "기준 정보 없음";
  }
}

function formatKoreanDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { hour12: false });
}

export function ProductOptionRowItem({ row, kind, amountWonDefault, freshnessMeta }: Props) {
  const [open, setOpen] = useState(false);
  const rates = getOptionRates(row.option);
  const hasBonusBadge = rates.bonus >= 0.1;

  return (
    <>
      <div
        className="group relative flex flex-col md:flex-row md:items-center gap-6 py-6 px-6 transition-all duration-300 hover:bg-slate-50 rounded-[2rem] cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-1 items-center gap-5 min-w-0">
          <ProviderLogo
            providerKey={row.product.fin_co_no}
            providerName={row.product.kor_co_nm ?? "-"}
            size={56}
            className="transition-transform duration-500 group-hover:scale-105 shadow-sm rounded-2xl"
          />

          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.product.kor_co_nm ?? "-"}</span>
              <Badge variant="secondary" className="bg-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-600 border border-slate-200 px-1.5 h-4 shadow-none">
                옵션 기준
              </Badge>
              {row.option.save_trm ? (
                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider px-1.5 h-4 border-slate-200 text-slate-500">
                  {row.option.save_trm}개월
                </Badge>
              ) : null}
            </div>
            <h3 className="truncate text-lg font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
              {row.product.fin_prdt_nm ?? "-"}
            </h3>
            {freshnessMeta ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black">
                {freshnessMeta.lastSyncedAt ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-500">
                    기준 확인 {formatKoreanDateTime(freshnessMeta.lastSyncedAt)}
                  </span>
                ) : null}
                {freshnessMeta.freshnessStatus ? (
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      freshnessMeta.freshnessStatus === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : freshnessMeta.freshnessStatus === "stale"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : freshnessMeta.freshnessStatus === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-white text-slate-500",
                    )}
                  >
                    상태: {formatFreshnessStatusLabel(freshnessMeta.freshnessStatus)}
                  </span>
                ) : null}
                {freshnessMeta.fallbackMode ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                    {freshnessMeta.fallbackMode}
                  </span>
                ) : null}
                {freshnessMeta.assumptionNotes?.[0] ? (
                  <span className="line-clamp-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                    유의: {freshnessMeta.assumptionNotes[0]}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="hidden md:flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-400 mt-1">
              <span className="text-slate-500">
                기본 {formatOptionRate(rates.base)}
              </span>
              {hasBonusBadge ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-slate-200" />
                  <span className="text-emerald-600 uppercase tracking-widest font-black text-[10px]">우대 {formatOptionBonus(rates.bonus)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-8 shrink-0 mt-2 md:mt-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">최고 금리</span>
            <span className="text-3xl font-black text-emerald-600 tabular-nums tracking-tight">{formatOptionRate(rates.best)}</span>
          </div>

          <div className="hidden md:flex items-center">
            <Button size="sm" variant="outline" className="h-10 rounded-xl px-4 text-xs font-black border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all" onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}>
              Detail View →
            </Button>
          </div>
        </div>
      </div>

      <ProductDetailDrawer
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        product={row.product}
        amountWonDefault={amountWonDefault}
      />
    </>
  );
}
