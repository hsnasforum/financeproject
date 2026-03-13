"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatGlossaryValue } from "@/lib/finlife/glossary";
import { type FinlifeKind, type NormalizedProduct } from "@/lib/finlife/types";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { cn } from "@/lib/utils";

type Props = {
  product: NormalizedProduct;
  kind: FinlifeKind;
  amountWonDefault: number;
  badges?: string[];
  unifiedDetailHref?: string;
  reasonLines?: string[];
  isFavorite?: boolean;
  isCompared?: boolean;
  compareLimit?: number;
  onToggleFavorite?: () => void;
  onToggleCompare?: () => void;
  onViewed?: () => void;
};

function formatRate(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

export function ProductRowItem({
  product,
  kind,
  amountWonDefault,
  badges = [],
  unifiedDetailHref,
  reasonLines = [],
  isFavorite = false,
  isCompared = false,
  compareLimit = 4,
  onToggleFavorite,
  onToggleCompare,
  onViewed,
}: Props) {
  const [open, setOpen] = useState(false);
  void unifiedDetailHref;
  void compareLimit;
  const bestOption = product.best;
  const termLabel = bestOption?.save_trm ? formatGlossaryValue("save_trm", bestOption.save_trm) : "-";

  const basicRate = bestOption?.intr_rate;
  const bestRate = bestOption?.intr_rate2;

  return (
    <>
      <div
        className="group relative flex flex-col md:flex-row md:items-center gap-4 py-5 px-4 transition-all duration-300 hover:bg-surface-muted rounded-2xl cursor-pointer"
        onClick={() => {
          onViewed?.();
          setOpen(true);
        }}
      >
        <div className="flex flex-1 items-center gap-4 min-w-0">
          <ProviderLogo
            providerKey={product.fin_co_no}
            providerName={product.kor_co_nm ?? "-"}
            size={48}
            className="transition-transform duration-500 group-hover:scale-105"
          />
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">{product.kor_co_nm ?? "-"}</span>
              {badges.map((badge) => (
                <Badge key={`${product.fin_prdt_cd}-${badge}`} variant="success" className="h-4 px-1.5 text-[9px]">
                  {badge}
                </Badge>
              ))}
            </div>
            <h3 className="truncate text-base font-black text-slate-900 tracking-tight group-hover:text-primary transition-colors">
              {product.fin_prdt_nm ?? "-"}
            </h3>
            <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-slate-500 mt-0.5">
              <span>{termLabel} 기준</span>
              <span className="opacity-30">|</span>
              <span>기본 {formatRate(basicRate)}</span>
              {reasonLines.length > 0 && (
                <>
                  <span className="opacity-30">|</span>
                  <span className="truncate text-primary">{reasonLines[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 mt-2 md:mt-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold text-slate-400 md:hidden">최고</span>
            <span className="text-2xl font-black text-primary tabular-nums tracking-tight">
              {formatRate(bestRate ?? basicRate)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-8 w-8 p-0 rounded-full", isFavorite ? "text-primary bg-primary/10" : "text-slate-400")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewed?.();
                onToggleFavorite?.();
              }}
              title="즐겨찾기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-8 w-8 p-0 rounded-full", isCompared ? "text-primary bg-primary/10" : "text-slate-400")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewed?.();
                onToggleCompare?.();
              }}
              title="비교"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>
            </Button>
          </div>
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
