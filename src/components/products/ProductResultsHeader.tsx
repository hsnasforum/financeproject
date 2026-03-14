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
    <div className="flex flex-col gap-4 border-b border-border/50 py-6 md:flex-row md:items-end md:justify-between">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getModeVariant(mode)} className="px-2.5 py-0.5">
            {modeLabel}
          </Badge>
          <span className="text-sm font-semibold text-slate-500">{viewLabel}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="text-base font-bold text-slate-900">검색 결과</h2>
          <span className="text-3xl font-black tabular-nums text-primary">{shownCount.toLocaleString()}</span>
          <span className="pb-1 text-sm font-semibold text-slate-500">개</span>
          <span className="pb-1 text-sm text-slate-400">전체 {totalCount.toLocaleString()}개 중</span>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">{scanLabel}</span>
          {truncatedByMaxPages ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">최대 조회 범위에서 중단됨</span>
          ) : null}
        </div>
      </div>

      {showSortControl ? (
        <label className="flex min-w-[12rem] flex-col gap-2 md:items-end">
          <span className="text-[11px] font-semibold text-slate-500">정렬 기준</span>
          <select
            value={sortKey}
            onChange={(event) => onSortChange(event.target.value as SortKey)}
            className="h-11 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          >
            <option value={ratePreference === "higher" ? "rateDesc" : "rateAsc"}>
              {ratePreference === "higher" ? "최고 금리순" : "최저 금리순"}
            </option>
            <option value="termAsc">기간 짧은 순</option>
            <option value="nameAsc">상품 이름 순</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
