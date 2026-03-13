"use client";

import { Badge } from "@/components/ui/Badge";

type SortKey = "rateDesc" | "rateAsc" | "nameAsc" | "termAsc";
type RatePreference = "higher" | "lower";
type ViewMode = "product" | "option";
type ScanMode = "page" | "all";

type Props = {
  viewMode: ViewMode;
  shownProducts: number;
  shownOptions: number;
  totalProducts: number;
  totalOptions: number;
  scanMode: ScanMode;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  ratePreference: RatePreference;
  nowPage?: number;
  maxPage?: number;
  pagesFetched?: number;
  truncatedByMaxPages?: boolean;
  mode?: "live" | "mock" | "fixture";
  showSortControl?: boolean;
};

export function ProductResultsHeader({
  viewMode,
  shownProducts,
  shownOptions,
  totalProducts,
  totalOptions,
  scanMode,
  sortKey,
  onSortChange,
  ratePreference,
  nowPage,
  maxPage,
  pagesFetched,
  truncatedByMaxPages,
  mode,
  showSortControl = true,
}: Props) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4 border-b border-border/50">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 tracking-tight">
          검색 결과 <span className="text-primary font-black tabular-nums">{(viewMode === "product" ? shownProducts : shownOptions).toLocaleString()}</span>개
          <span className="h-3 w-px bg-slate-200 mx-1" />
          <span className="text-[11px] text-slate-400 font-bold uppercase tracking-tight">
            Total {(viewMode === "product" ? totalProducts : totalOptions).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Badge variant="secondary" className="px-1.5 py-0 h-4 bg-surface-muted text-slate-400 text-[9px] font-black">{mode ?? "LIVE"}</Badge>
          <span className="opacity-40">/</span>
          <span>{viewMode === "product" ? "Product Focused" : "Option Focused"}</span>
          <span className="opacity-40">/</span>
          {scanMode === "page" ? (
            <span className="tabular-nums">PAGE {nowPage ?? "-"}/{maxPage ?? "-"}</span>
          ) : (
            <span className="tabular-nums">SCANNED {pagesFetched ?? "-"} PAGES</span>
          )}
          {truncatedByMaxPages && <span className="text-amber-500 font-black">· LIMIT REACHED</span>}
        </div>
      </div>

      {showSortControl && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="h-10 rounded-full bg-surface-muted border-none px-5 text-[11px] font-bold text-slate-700 outline-none cursor-pointer hover:bg-surface hover:ring-2 hover:ring-primary/20 transition-all focus:ring-4 focus:ring-primary/10"
          >
            <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
              {ratePreference === "higher" ? "최고 금리순" : "최저 금리순"}
            </option>
            <option value="termAsc">기간 짧은 순</option>
            <option value="nameAsc">상품 이름 순</option>
          </select>
        </div>
      )}
    </div>
  );
}
