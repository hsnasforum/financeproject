"use client";

import { useState } from "react";
import { type OptionSortKey } from "@/lib/finlife/optionView";
import { SegmentedTabs } from "./SegmentedTabs";
import { type ProviderChip, ProviderChipCarousel } from "./ProviderChipCarousel";
import { cn } from "@/lib/utils";

type Props = {
  selectedProviderId: string;
  onProviderSelect: (id: string) => void;
  selectedFinCoNo: string | null;
  onFinCoSelect: (id: string | null) => void;
  onReset: () => void;
  groups: ProviderChip[];
  banks: ProviderChip[];
  showAllProviders: boolean;
  onToggleShowAllProviders: (next: boolean) => void;
  availabilityNotice?: string;
  termOptions: string[];
  selectedTerms: string[];
  onToggleTerm: (term: string) => void;
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  productTypeOptions: string[];
  selectedProductTypes: string[];
  onToggleProductType: (tag: string) => void;
  benefitOptions: string[];
  selectedBenefits: string[];
  onToggleBenefit: (tag: string) => void;
  scanMode: "page" | "all";
  onScanModeChange: (mode: "page" | "all") => void;
  viewMode: "product" | "option";
  onViewModeChange: (mode: "product" | "option") => void;
  optionSortKey: OptionSortKey;
  onOptionSortChange: (key: OptionSortKey) => void;
  optionGroup: boolean;
  onOptionGroupChange: (next: boolean) => void;
};

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all duration-300 active:scale-95",
        active 
          ? "bg-primary text-white shadow-sm" 
          : "bg-surface-muted text-slate-500 hover:bg-slate-200 hover:text-slate-900"
      )}
    >
      {label}
    </button>
  );
}

function AppliedFilterChip({ label, onRemove }: { label: string, onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-200 border border-slate-200">
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-slate-300 text-slate-400 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </span>
  );
}

export function ProductExplorerHeaderCard({
  selectedProviderId,
  onProviderSelect,
  selectedFinCoNo,
  onFinCoSelect,
  onReset,
  groups,
  banks,
  showAllProviders,
  onToggleShowAllProviders,
  availabilityNotice,
  termOptions,
  selectedTerms,
  onToggleTerm,
  amountInput,
  onAmountInputChange,
  productTypeOptions,
  selectedProductTypes,
  onToggleProductType,
  benefitOptions,
  selectedBenefits,
  onToggleBenefit,
  scanMode,
  onScanModeChange,
  viewMode,
  onViewModeChange,
  optionSortKey,
  onOptionSortChange,
  optionGroup,
  onOptionGroupChange,
}: Props) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const bankOptionsWithAll: ProviderChip[] = [
    { id: "all", name: "전체" },
    ...banks
  ];

  const activeFiltersCount = 
    selectedTerms.length + 
    selectedProductTypes.length + 
    selectedBenefits.length + 
    (amountInput !== "10000000" ? 1 : 0);

  const hasAnyFilters = activeFiltersCount > 0 || selectedFinCoNo !== null;

  return (
    <div className="sticky top-[72px] z-30 mb-8 rounded-2xl bg-surface p-6 shadow-card transition-shadow">
      <div className="flex flex-col gap-6">
        {/* 1) Segmented Tabs */}
        <SegmentedTabs />

        {/* 2) Provider Selection (Carousel) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">금융사 선택</span>
            <button 
              onClick={() => onFinCoSelect(null)}
              className={cn(
                "text-[10px] font-bold text-slate-400 hover:text-primary transition-colors",
                !selectedFinCoNo && "opacity-0 pointer-events-none"
              )}
            >
              선택 해제
            </button>
          </div>
          <ProviderChipCarousel 
            providers={bankOptionsWithAll} 
            selectedId={selectedFinCoNo || "all"} 
            onSelect={(id) => onFinCoSelect(id === "all" ? null : id)} 
          />
        </div>

        {/* 3) Financial Region Filter (Groups) */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => onProviderSelect(group.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[11px] font-bold transition-all duration-300 active:scale-95",
                selectedProviderId === group.id
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-muted text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              )}
            >
              {group.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter cursor-pointer group">
              <input
                type="checkbox"
                checked={showAllProviders}
                onChange={(e) => onToggleShowAllProviders(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary transition-colors group-hover:border-primary/50"
              />
              전체 권역 보기
            </label>
          </div>
        </div>

        {/* 4) Filter Chips Row & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => onViewModeChange("product")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[11px] font-bold transition-all active:scale-95",
                  viewMode === "product" ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                상품
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange("option")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[11px] font-bold transition-all active:scale-95",
                  viewMode === "option" ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                옵션
              </button>
            </div>
            
            <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1 hidden sm:flex">
              <button
                type="button"
                onClick={() => onScanModeChange("page")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[11px] font-bold transition-all active:scale-95",
                  scanMode === "page" ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                조회
              </button>
              <button
                type="button"
                onClick={() => onScanModeChange("all")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[11px] font-bold transition-all active:scale-95",
                  scanMode === "all" ? "bg-surface text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                스캔
              </button>
            </div>

            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-[11px] font-bold transition-all duration-300 active:scale-95",
                isFilterOpen
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-muted text-slate-600 hover:bg-slate-200 hover:text-slate-800"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              상세 조건
              {activeFiltersCount > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white shadow-sm">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {viewMode === "option" && (
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-full border-none bg-surface-muted px-4 text-[11px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                  value={optionSortKey}
                  onChange={(e) => onOptionSortChange(e.target.value as OptionSortKey)}
                >
                  <option value="best_desc">최고 금리순</option>
                  <option value="base_desc">기본 금리순</option>
                  <option value="bonus_desc">우대폭 큰 순</option>
                  <option value="term_asc">기간 짧은 순</option>
                  <option value="term_desc">기간 긴 순</option>
                </select>
                <label className="flex h-9 items-center gap-2 rounded-full border-none bg-surface-muted px-4 text-[11px] font-bold text-slate-600 cursor-pointer hover:bg-slate-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={optionGroup}
                    onChange={(e) => onOptionGroupChange(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                  />
                  상품별 그룹
                </label>
              </div>
            )}
            
            <button
              onClick={onReset}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none bg-surface-muted text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-300 active:scale-90"
              title="필터 초기화"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
          </div>
        </div>

        {/* 5) Applied Filter Chips Row */}
        {hasAnyFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-5 px-1">
            <span className="text-[10px] font-bold text-slate-400 mr-2 uppercase tracking-widest">Active</span>
            {selectedFinCoNo && (
              <AppliedFilterChip 
                label={banks.find(b => b.id === selectedFinCoNo)?.name || "특정 금융사"} 
                onRemove={() => onFinCoSelect(null)} 
              />
            )}
            {selectedTerms.map(term => (
              <AppliedFilterChip key={term} label={`${term}개월`} onRemove={() => onToggleTerm(term)} />
            ))}
            {selectedProductTypes.map(tag => (
              <AppliedFilterChip key={tag} label={tag} onRemove={() => onToggleProductType(tag)} />
            ))}
            {selectedBenefits.map(tag => (
              <AppliedFilterChip key={tag} label={tag} onRemove={() => onToggleBenefit(tag)} />
            ))}
            {amountInput !== "10000000" && (
              <AppliedFilterChip 
                label={`${(Number(amountInput) / 10000).toLocaleString()}만원`} 
                onRemove={() => onAmountInputChange("10000000")} 
              />
            )}
            <button 
              onClick={onReset}
              className="ml-2 text-[10px] font-bold text-slate-400 hover:text-primary transition-colors"
            >
              초기화
            </button>
          </div>
        )}

        {isFilterOpen && (
          <div className="animate-in fade-in slide-in-from-top-2 rounded-2xl bg-surface-muted p-6 duration-300 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">납입/예치 기간</p>
              <div className="flex flex-wrap gap-2">
                {termOptions.map((term) => (
                  <Chip key={term} active={selectedTerms.includes(term)} label={`${term}개월`} onClick={() => onToggleTerm(term)} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">금액 (원)</p>
              <div className="relative">
                <input
                  className="h-10 w-full rounded-xl border-none bg-surface pl-4 pr-10 text-[11px] font-bold text-slate-900 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  value={amountInput}
                  onChange={(e) => onAmountInputChange(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">₩</span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">상품 유형</p>
              <div className="flex flex-wrap gap-2">
                {productTypeOptions.map((tag) => (
                  <Chip key={tag} active={selectedProductTypes.includes(tag)} label={tag} onClick={() => onToggleProductType(tag)} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">우대 조건</p>
              <div className="flex flex-wrap gap-2">
                {benefitOptions.map((tag) => (
                  <Chip key={tag} active={selectedBenefits.includes(tag)} label={tag} onClick={() => onToggleBenefit(tag)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {availabilityNotice && (
          <div className="flex items-center gap-3 rounded-xl bg-amber-50/50 px-4 py-3 text-[11px] font-bold text-amber-800 border border-amber-100/50 shadow-sm animate-in slide-in-from-left-2">
             <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
             </div>
             {availabilityNotice}
          </div>
        )}
      </div>
    </div>
  );
}
