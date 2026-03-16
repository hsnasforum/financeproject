"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatGlossaryValue } from "@/lib/finlife/glossary";
import { type FinlifeCardFreshnessMeta, type FinlifeKind, type NormalizedProduct } from "@/lib/finlife/types";
import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { ProductDetailDrawer } from "@/components/products/ProductDetailDrawer";
import { cn } from "@/lib/utils";

type Props = {
  product: NormalizedProduct;
  kind: FinlifeKind;
  amountWonDefault: number;
  freshnessMeta?: FinlifeCardFreshnessMeta;
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

export function ProductRowItem({
  product,
  kind,
  amountWonDefault,
  freshnessMeta,
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
        className="group relative flex flex-col md:flex-row md:items-center gap-6 py-6 px-6 transition-all duration-300 hover:bg-slate-50 rounded-[2rem] cursor-pointer"
        onClick={() => {
          onViewed?.();
          setOpen(true);
        }}
      >
        <div className="flex flex-1 items-center gap-5 min-w-0">
          <ProviderLogo
            providerKey={product.fin_co_no}
            providerName={product.kor_co_nm ?? "-"}
            size={56}
            className="transition-transform duration-500 group-hover:scale-105 shadow-sm rounded-2xl"
          />
          <div className="flex flex-col min-w-0 flex-1 gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{product.kor_co_nm ?? "-"}</span>
              {badges.map((badge) => (
                <Badge key={`${product.fin_prdt_cd}-${badge}`} variant="secondary" className="h-4 px-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border-none">
                  {badge}
                </Badge>
              ))}
            </div>
            <h3 className="truncate text-lg font-black text-slate-900 tracking-tight group-hover:text-emerald-600 transition-colors">
              {product.fin_prdt_nm ?? "-"}
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
            <div className="hidden md:flex items-center gap-3 text-[11px] font-bold text-slate-400 mt-1">
              <span className="text-slate-500">{termLabel} 기준</span>
              <span className="h-1 w-1 rounded-full bg-slate-200" />
              <span className="text-slate-500">기본 {formatRate(basicRate)}</span>
              {reasonLines.length > 0 && (
                <>
                  <span className="h-1 w-1 rounded-full bg-slate-200" />
                  <span className="truncate text-emerald-600 uppercase tracking-widest font-black text-[10px]">{reasonLines[0]}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-8 shrink-0 mt-2 md:mt-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">최고 금리</span>
            <span className="text-3xl font-black text-emerald-600 tabular-nums tracking-tight">
              {formatRate(bestRate ?? basicRate)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-10 w-10 p-0 rounded-xl transition-all", isFavorite ? "text-emerald-600 bg-emerald-50" : "text-slate-300 hover:text-rose-500 hover:bg-rose-50")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewed?.();
                onToggleFavorite?.();
              }}
              title="즐겨찾기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-10 w-10 p-0 rounded-xl transition-all", isCompared ? "text-emerald-600 bg-emerald-50" : "text-slate-300 hover:text-emerald-600 hover:bg-emerald-50")}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onViewed?.();
                onToggleCompare?.();
              }}
              title="비교"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>
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
