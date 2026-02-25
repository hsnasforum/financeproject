"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatGlossaryValue } from "@/lib/finlife/glossary";
import { type FinlifeKind, type NormalizedProduct } from "@/lib/finlife/types";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";

type Props = {
  product: NormalizedProduct;
  kind: FinlifeKind;
  amountWonDefault: number;
  badges?: string[];
};

function formatRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export function ProductRowItem({ product, kind, amountWonDefault, badges = [] }: Props) {
  const [open, setOpen] = useState(false);
  const bestOption = product.best;
  const termLabel = bestOption?.save_trm ? formatGlossaryValue("save_trm", bestOption.save_trm) : "-";

  const basicRate = bestOption?.intr_rate;
  const bestRate = bestOption?.intr_rate2;

  return (
    <>
      <div className="group relative flex items-center gap-5 py-6 px-2 transition-all duration-300 hover:bg-slate-50/50 rounded-2xl">
        <div className="relative shrink-0">
          <div className="absolute -inset-2 rounded-full bg-emerald-100/20 opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
          <ProviderLogo
            providerKey={product.fin_co_no}
            providerName={product.kor_co_nm ?? "-"}
            size={52}
            className="relative transition-transform duration-300 group-hover:scale-110"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{product.kor_co_nm ?? "-"}</span>
            {badges.map((badge) => (
              <Badge key={`${product.fin_prdt_cd}-${badge}`} variant="secondary" className="bg-emerald-50 text-[9px] text-emerald-700 font-bold border border-emerald-200 px-2 h-4.5 rounded-lg">
                {badge}
              </Badge>
            ))}
            {product.options.length > 1 && (
              <Badge variant="secondary" className="bg-slate-100 text-[9px] text-slate-500 font-bold border-none px-2 h-4.5 rounded-lg">
                +{product.options.length - 1} 옵션
              </Badge>
            )}
          </div>
          <h3 className="truncate text-base md:text-lg font-black text-slate-900 tracking-tight leading-none group-hover:text-emerald-700 transition-colors">
            {product.fin_prdt_nm ?? "-"}
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 ring-1 ring-slate-200/50">{termLabel} 기준</span>
            <span className="text-slate-400">·</span>
            <span className="flex items-center gap-1.5">
              기본 <span className="text-slate-700">{formatRate(basicRate)}</span>
              <span className="text-slate-300">/</span>
              최고 <span className="text-emerald-600">{formatRate(bestRate)}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3 text-right">
          <div className="flex flex-col items-end leading-none">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">최고 금리</span>
            <span className="text-2xl md:text-3xl font-black text-emerald-600 tabular-nums tracking-tighter shadow-emerald-100 drop-shadow-sm">
              {formatRate(bestRate ?? basicRate)}
            </span>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setOpen(true)}
            className="h-9 px-5 rounded-xl text-[11px] font-bold border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all shadow-sm active:scale-95"
          >
            상세 보기
          </Button>
        </div>
      </div>

      <ProductDetailDrawer
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        product={product}
        amountWonDefault={amountWonDefault}
      />
    </>
  );
}
