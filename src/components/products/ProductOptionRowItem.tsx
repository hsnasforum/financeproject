"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { type FinlifeKind } from "@/lib/finlife/types";
import { formatOptionBonus, formatOptionRate, getOptionRates, type OptionRow } from "@/lib/finlife/optionView";

type Props = {
  row: OptionRow;
  kind: FinlifeKind;
  amountWonDefault: number;
};

export function ProductOptionRowItem({ row, kind, amountWonDefault }: Props) {
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
              <Badge variant="secondary" className="bg-slate-900 text-[9px] font-black uppercase tracking-wider text-white border-none px-1.5 h-4">
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
