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

function getModeLabel(mode: Props["mode"]) {
  if (mode === "mock") return "대체 데이터";
  if (mode === "fixture") return "검증 데이터";
  return "실시간";
}

function getModeVariant(mode: Props["mode"]) {
  if (mode === "mock") return "warning" as const;
  if (mode === "fixture") return "secondary" as const;
  return "success" as const;
}

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
  const shownCount = viewMode === "product" ? shownProducts : shownOptions;
  const totalCount = viewMode === "product" ? totalProducts : totalOptions;
  const modeLabel = getModeLabel(mode);
  const viewLabel = viewMode === "product" ? "상품 기준" : "옵션 기준";
  const scanLabel = scanMode === "page"
    ? `페이지 ${nowPage ?? "-"} / ${maxPage ?? "-"}`
    : `스캔 ${pagesFetched ?? "-"}페이지`;

  return (
    <div className="flex flex-col gap-6 border-b border-slate-100 py-8 md:flex-row md:items-end md:justify-between">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={getModeVariant(mode)} className="px-3 py-1 text-[10px] font-black uppercase tracking-widest border-none">
            {modeLabel}
          </Badge>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">{viewLabel}</span>
        </div>
        
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-black text-slate-900 tracking-tight">검색 결과</h2>
          <span className="text-4xl font-black tabular-nums text-emerald-600 tracking-tight">{shownCount.toLocaleString()}</span>
          <span className="text-sm font-black text-slate-400 uppercase tracking-widest">items</span>
          <span className="ml-2 text-xs font-bold text-slate-400">/ Total {totalCount.toLocaleString()} candidates</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-widest shadow-sm">{scanLabel}</span>
          {truncatedByMaxPages ? (
            <span className="rounded-full bg-rose-50 border border-rose-100 px-3 py-1 text-[10px] font-black text-rose-600 uppercase tracking-widest">Scope Truncated</span>
          ) : null}
        </div>
      </div>

      {showSortControl ? (
        <div className="flex min-w-[14rem] flex-col gap-2 md:items-end">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Sort Preference</p>
          <select
            value={sortKey}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100 shadow-sm cursor-pointer"
          >
            <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
              {ratePreference === "higher" ? "최고 금리순" : "최저 금리순"}
            </option>
            <option value="termAsc">기간 짧은 순</option>
            <option value="nameAsc">상품 이름 순</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
