"use client";

import { useState } from "react";
import { type OptionSortKey } from "@/lib/finlife/optionView";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FilterChips } from "@/components/ui/FilterChips";
import { SegmentedTabs as UiSegmentedTabs } from "@/components/ui/SegmentedTabs";
import { SegmentedTabs as ProductKindTabs } from "./SegmentedTabs";
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

const VIEW_MODE_OPTIONS = [
  { id: "product", label: "상품" },
  { id: "option", label: "옵션" },
] as const;

const SCAN_MODE_OPTIONS = [
  { id: "page", label: "조회" },
  { id: "all", label: "스캔" },
] as const;

function AppliedFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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
    <Card className="sticky top-[72px] z-30 mb-8 rounded-[2rem] border border-slate-200/70 p-4 md:p-6">
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="px-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">상품 분류</p>
            <p className="mt-1 text-sm text-slate-600">먼저 상품군을 고른 뒤, 제공자와 조건을 좁혀서 비교하세요.</p>
          </div>
          <ProductKindTabs />
        </section>

        <section className="rounded-[1.5rem] border border-slate-200/70 bg-slate-50/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">제공자 선택</p>
              <p className="mt-1 text-sm text-slate-600">특정 금융사를 고르면 결과를 더 좁게 볼 수 있습니다.</p>
            </div>
            {selectedFinCoNo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onFinCoSelect(null)}
                className="h-8 rounded-full px-3 text-[11px]"
              >
                선택 해제
              </Button>
            ) : null}
          </div>
          <div className="mt-4">
            <ProviderChipCarousel
              providers={bankOptionsWithAll}
              selectedId={selectedFinCoNo || "all"}
              onSelect={(id) => onFinCoSelect(id === "all" ? null : id)}
            />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4 xl:max-w-[52%]">
                <div className="px-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">탐색 필터</p>
                  <p className="mt-1 text-sm text-slate-600">권역을 고르고, 보기 방식과 상세 조건으로 결과를 다듬으세요.</p>
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
                        className="rounded-full px-4"
                      >
                        {group.name}
                      </Button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-2 px-1 text-[11px] font-semibold text-slate-500">
                  <input
                    type="checkbox"
                    checked={showAllProviders}
                    onChange={(event) => onToggleShowAllProviders(event.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  전체 권역 보기
                </label>
              </div>

              <div className="flex w-full flex-col gap-2 xl:max-w-[360px]">
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

                {viewMode === "option" ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                      <span className="shrink-0">정렬</span>
                      <select
                        className="min-w-0 flex-1 bg-transparent text-right outline-none"
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
                    <label className="flex items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={optionGroup}
                        onChange={(event) => onOptionGroupChange(event.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      상품별 그룹
                    </label>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={isFilterOpen ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setIsFilterOpen((prev) => !prev)}
                    className="flex-1 rounded-full"
                  >
                    상세 조건
                    {activeFiltersCount > 0 ? (
                      <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px]">
                        {activeFiltersCount}
                      </span>
                    ) : null}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onReset} className="rounded-full px-4">
                    전체 초기화
                  </Button>
                </div>
              </div>
            </div>

            {hasAnyFilters ? (
              <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">적용됨</span>
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
            ) : null}

            {isFilterOpen ? (
              <div className="grid gap-4 rounded-[1.5rem] border border-slate-200/70 bg-slate-50/80 p-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">납입/예치 기간</p>
                  <FilterChips
                    options={termOptions.map((term) => ({ id: term, label: `${term}개월` }))}
                    selectedIds={selectedTerms}
                    onToggle={onToggleTerm}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">금액</p>
                  <label className="flex items-center gap-3 rounded-[1rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                    <span className="text-slate-400">₩</span>
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      value={amountInput}
                      onChange={(event) => onAmountInputChange(event.target.value)}
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">상품 유형</p>
                  <FilterChips
                    options={productTypeOptions.map((tag) => ({ id: tag, label: tag }))}
                    selectedIds={selectedProductTypes}
                    onToggle={onToggleProductType}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">우대 조건</p>
                  <FilterChips
                    options={benefitOptions.map((tag) => ({ id: tag, label: tag }))}
                    selectedIds={selectedBenefits}
                    onToggle={onToggleBenefit}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {availabilityNotice ? (
          <div className="flex items-center gap-3 rounded-[1.5rem] border border-amber-100 bg-amber-50/70 px-4 py-3 text-[11px] font-semibold text-amber-800 shadow-sm">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
              </svg>
            </div>
            <span className={cn("leading-relaxed", availabilityNotice ? "text-amber-900" : "text-amber-800")}>{availabilityNotice}</span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
