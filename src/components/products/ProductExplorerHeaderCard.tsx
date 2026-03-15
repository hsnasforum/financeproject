"use client";

import { useState } from "react";
import { type OptionSortKey } from "@/lib/finlife/optionView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterChips } from "@/components/ui/FilterChips";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { SegmentedTabs as UiSegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SegmentedTabs as ProductKindTabs } from "./SegmentedTabs";
import { type ProviderChip, ProviderChipCarousel } from "./ProviderChipCarousel";

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

const VIEW_MODE_OPTIONS = [
  { id: "product", label: "상품 기준" },
  { id: "option", label: "옵션 기준" },
] as const;

const SCAN_MODE_OPTIONS = [
  { id: "page", label: "페이지 조회" },
  { id: "all", label: "전체 스캔" },
] as const;

function AppliedFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 shadow-sm transition-all hover:border-rose-200">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
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

  const bankOptionsWithAll: ProviderChip[] = [{ id: "all", name: "전체" }, ...banks];
  const activeFiltersCount =
    selectedTerms.length +
    selectedProductTypes.length +
    selectedBenefits.length +
    (amountInput !== "10000000" ? 1 : 0);
  const hasAnyFilters = activeFiltersCount > 0 || selectedFinCoNo !== null;

  return (
    <Card className="sticky top-[72px] z-30 mb-8 rounded-[2rem] border border-slate-100 p-6 shadow-lg backdrop-blur-md bg-white/95">
      <div className="space-y-8">
        <section className="space-y-4">
          <SubSectionHeader 
            title="상품 분류" 
            description="먼저 탐색할 상품군을 선택하세요." 
            className="mb-0"
          />
          <ProductKindTabs />
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8 min-w-0">
            <section className="rounded-[1.5rem] border border-slate-100 bg-slate-50/50 p-6 shadow-inner">
              <div className="flex items-start justify-between gap-3 mb-4">
                <SubSectionHeader 
                  title="제공자 선택" 
                  description="특정 금융사를 고르면 결과를 더 좁게 볼 수 있습니다." 
                  className="mb-0"
                />
                {selectedFinCoNo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onFinCoSelect(null)}
                    className="h-8 rounded-full px-4 text-[10px] font-black text-rose-600 hover:bg-rose-50"
                  >
                    선택 해제
                  </Button>
                ) : null}
              </div>
              <ProviderChipCarousel
                providers={bankOptionsWithAll}
                selectedId={selectedFinCoNo || "all"}
                onSelect={(id) => onFinCoSelect(id === "all" ? null : id)}
              />
            </section>

            <section className="space-y-6 px-1">
              <div className="space-y-1">
                <SubSectionHeader 
                  title="권역 필터" 
                  description="원하는 금융 권역을 선택하세요." 
                  className="mb-0"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const isSelected = selectedProviderId === group.id;
                  return (
                    <Button
                      key={group.id}
                      type="button"
                      variant={isSelected ? "primary" : "outline"}
                      size="sm"
                      onClick={() => onProviderSelect(group.id)}
                      className="rounded-full px-5 font-black h-9"
                    >
                      {group.name}
                    </Button>
                  );
                })}
              </div>

              <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
                <input
                  type="checkbox"
                  checked={showAllProviders}
                  onChange={(event) => onToggleShowAllProviders(event.target.checked)}
                  className="h-5 w-5 rounded-lg border-slate-200 text-emerald-600 focus:ring-emerald-500 transition-all"
                />
                전체 권역 보기
              </label>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-1">조회 방식</p>
              <UiSegmentedTabs
                activeTab={viewMode}
                className="w-full"
                layoutId="product-view-mode-tabs"
                onChange={(id) => onViewModeChange(id as "product" | "option")}
                options={VIEW_MODE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
              />
              <UiSegmentedTabs
                activeTab={scanMode}
                className="w-full"
                layoutId="product-scan-mode-tabs"
                onChange={(id) => onScanModeChange(id as "page" | "all")}
                options={SCAN_MODE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
              />
            </div>

            {viewMode === "option" ? (
              <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-100 shadow-inner mt-2">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">정렬</span>
                  <select
                    className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-700 outline-none cursor-pointer"
                    value={optionSortKey}
                    onChange={(event) => onOptionSortChange(event.target.value as OptionSortKey)}
                  >
                    <option value="best_desc">최고 금리순</option>
                    <option value="base_desc">기본 금리순</option>
                    <option value="bonus_desc">우대폭 큰 순</option>
                    <option value="term_asc">기간 짧은 순</option>
                    <option value="term_desc">기간 긴 순</option>
                  </select>
                </label>
                <div className="h-px bg-slate-200/50" />
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={optionGroup}
                    onChange={(event) => onOptionGroupChange(event.target.checked)}
                    className="h-5 w-5 rounded-lg border-slate-200 text-emerald-600 focus:ring-emerald-500 transition-all"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-700 transition-colors">상품별 그룹화</span>
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                variant={isFilterOpen ? "primary" : "outline"}
                className="flex-1 rounded-2xl h-12 font-black shadow-md shadow-emerald-900/10"
                onClick={() => setIsFilterOpen((prev) => !prev)}
              >
                상세 필터
                {activeFiltersCount > 0 ? (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-black">
                    {activeFiltersCount}
                  </span>
                ) : null}
              </Button>
              <Button type="button" variant="ghost" onClick={onReset} className="rounded-2xl px-4 text-xs font-bold text-slate-400 hover:text-rose-600">
                초기화
              </Button>
            </div>
          </aside>
        </div>

        {hasAnyFilters && (
          <div className="rounded-2xl bg-slate-50/50 px-5 py-4 border border-slate-100/50">
            <div className="flex flex-wrap items-center gap-3">
              <span className="mr-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected</span>
              {selectedFinCoNo ? (
                <AppliedFilterChip
                  label={banks.find((bank) => bank.id === selectedFinCoNo)?.name || "특정 금융사"}
                  onRemove={() => onFinCoSelect(null)}
                />
              ) : null}
              {selectedTerms.map((term) => (
                <AppliedFilterChip key={term} label={`${term}개월`} onRemove={() => onToggleTerm(term)} />
              ))}
              {selectedProductTypes.map((tag) => (
                <AppliedFilterChip key={tag} label={tag} onRemove={() => onToggleProductType(tag)} />
              ))}
              {selectedBenefits.map((tag) => (
                <AppliedFilterChip key={tag} label={tag} onRemove={() => onToggleBenefit(tag)} />
              ))}
              {amountInput !== "10000000" ? (
                <AppliedFilterChip
                  label={`${(Number(amountInput) / 10000).toLocaleString()}만원`}
                  onRemove={() => onAmountInputChange("10000000")}
                />
              ) : null}
            </div>
          </div>
        )}

        {isFilterOpen && (
          <div className="grid gap-8 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-inner animate-in fade-in slide-in-from-top-4 duration-500 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">납입/예치 기간</p>
              <FilterChips
                options={termOptions.map((term) => ({ id: term, label: `${term}개월` }))}
                selectedIds={selectedTerms}
                onToggle={onToggleTerm}
              />
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">금액 설정</p>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-inner focus-within:bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition-all group">
                <span className="text-slate-300 font-black group-focus-within:text-emerald-500 transition-colors">₩</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-700 outline-none tabular-nums"
                  value={amountInput}
                  onChange={(event) => onAmountInputChange(event.target.value)}
                />
              </label>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">상품 유형</p>
              <FilterChips
                options={productTypeOptions.map((tag) => ({ id: tag, label: tag }))}
                selectedIds={selectedProductTypes}
                onToggle={onToggleProductType}
              />
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">우대 조건</p>
              <FilterChips
                options={benefitOptions.map((tag) => ({ id: tag, label: tag }))}
                selectedIds={selectedBenefits}
                onToggle={onToggleBenefit}
              />
            </div>
          </div>
        )}

        {availabilityNotice && (
          <div className="flex items-center gap-4 rounded-[1.5rem] border border-amber-100 bg-amber-50/50 p-5 text-xs font-bold text-amber-800 shadow-sm animate-in fade-in duration-500">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
            </div>
            <span className="leading-relaxed">{availabilityNotice}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
