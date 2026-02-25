"use client";

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
    <div className="flex flex-col md:flex-row md:items-center justify-between py-6 gap-4 border-b border-slate-50">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          검색 결과 <span className="text-emerald-600 font-black">{viewMode === "product" ? shownProducts : shownOptions}</span>개
          <span className="h-3 w-[1px] bg-slate-200 mx-1" />
          <span className="text-[11px] text-slate-400 font-medium">
            전체 {viewMode === "product" ? totalProducts : totalOptions}개 중
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
          <Badge text={mode ?? "LIVE"} />
          <span>·</span>
          <span>{viewMode === "product" ? "상품 중심" : "옵션 중심"}</span>
          <span>·</span>
          {scanMode === "page" ? (
            <span>PAGE {nowPage ?? "-"}/{maxPage ?? "-"}</span>
          ) : (
            <span>SCANNED {pagesFetched ?? "-"} PAGES</span>
          )}
          {truncatedByMaxPages && <span className="text-amber-500">· MAX REACHED</span>}
        </div>
      </div>

      {showSortControl ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">SORT BY</span>
          <select
            value={sortKey}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="h-9 rounded-xl bg-slate-50 px-4 text-[11px] font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 hover:text-emerald-600 transition-all border border-slate-100"
          >
            <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
              {ratePreference === "higher" ? "금리 높은 순" : "금리 낮은 순"}
            </option>
            <option value="termAsc">기간 짧은 순</option>
            <option value="nameAsc">상품 이름 순</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter ring-1 ring-slate-200/50">
      {text.toUpperCase()}
    </span>
  );
}
