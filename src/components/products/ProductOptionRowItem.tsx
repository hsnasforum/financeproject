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
        className="group relative flex flex-col md:flex-row md:items-center gap-4 py-5 px-4 transition-all duration-300 hover:bg-slate-50 rounded-[1.5rem] cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <ProviderLogo
            providerKey={row.product.fin_co_no}
            providerName={row.product.kor_co_nm ?? "-"}
            size={48}
            className="transition-transform duration-500 group-hover:scale-105"
          />

          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">{row.product.kor_co_nm ?? "-"}</span>
              <Badge variant="secondary" className="bg-primary/10 text-[10px] text-primary border-none px-1.5 h-4">
                옵션 기준
              </Badge>
              {row.option.save_trm ? (
                <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                  {row.option.save_trm}개월
                </Badge>
              ) : null}
            </div>
            <h3 className="truncate text-base font-black text-slate-900 tracking-tight group-hover:text-primary transition-colors">
              {row.product.fin_prdt_nm ?? "-"}
            </h3>
            <div className="hidden md:flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
              <span className="font-medium text-slate-700">
                기본 {formatOptionRate(rates.base)}
              </span>
              {hasBonusBadge ? (
                <>
                  <span className="opacity-30">|</span>
                  <span className="text-primary font-medium">우대 {formatOptionBonus(rates.bonus)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 mt-2 md:mt-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold text-slate-400 md:hidden">최고</span>
            <span className="text-2xl font-black text-primary tabular-nums tracking-tight">{formatOptionRate(rates.best)}</span>
          </div>

          <div className="hidden md:flex items-center">
            <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}>
              상세 보기
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
