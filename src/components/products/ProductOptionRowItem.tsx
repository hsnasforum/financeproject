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
  const termLabel = row.option.save_trm ? `${row.option.save_trm}개월` : "기간 정보 없음";
  const hasBonusBadge = rates.bonus >= 0.1;

  return (
    <>
      <div className="flex items-center gap-4 py-5">
        <ProviderLogo providerKey={row.product.fin_co_no} providerName={row.product.kor_co_nm ?? "-"} size={48} />

        <div className="flex flex-1 flex-col gap-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">{row.product.kor_co_nm ?? "-"}</span>
            <Badge variant="secondary" className="bg-emerald-50 text-[10px] text-emerald-700 border-none px-1.5 h-4">
              옵션 기준
            </Badge>
            {row.option.save_trm ? (
              <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                {row.option.save_trm}개월
              </Badge>
            ) : null}
          </div>
          <h3 className="truncate text-base font-bold text-slate-900">{row.product.fin_prdt_nm ?? "-"}</h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5">{termLabel}</span>
            <span className="font-semibold text-slate-700">
              기본 {formatOptionRate(rates.base)} · 최고 {formatOptionRate(rates.best)}
            </span>
            {hasBonusBadge ? <Badge variant="outline" className="h-4 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700">우대 {formatOptionBonus(rates.bonus)}</Badge> : null}
            <span className="text-[10px] text-slate-400">최고금리(우대조건 충족 시)</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <div className="flex items-baseline gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">옵션</span>
            <span className="text-xl font-black text-emerald-600 tabular-nums">{formatOptionRate(rates.best)}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>상세 보기</Button>
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
