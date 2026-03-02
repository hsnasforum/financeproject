"use client";

import { cn } from "@/lib/utils";

type FilterOption = {
  id: string;
  label: string;
};

type FilterChipsProps = {
  options: FilterOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  className?: string;
};

export function FilterChips({ options, selectedIds, onToggle, className }: FilterChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const isSelected = selectedIds.includes(option.id);
        return (
          <button
            key={option.id}
            onClick={() => onToggle(option.id)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold transition-all duration-300 active:scale-95",
              isSelected
                ? "border-emerald-500 bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
            )}
          >
            {option.label}
            {isSelected && (
              <span className="ml-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
