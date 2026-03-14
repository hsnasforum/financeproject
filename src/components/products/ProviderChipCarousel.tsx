"use client";

import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { cn } from "@/lib/utils";

export type ProviderChip = {
  id: string;
  name: string;
  short?: string;
  totalCount?: number | null;
  status?: "ok" | "missing" | "error";
};

type Props = {
  providers: ProviderChip[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function ProviderChipCarousel({ providers, selectedId, onSelect }: Props) {
  return (
    <div className="relative">
      <div className="flex w-full gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {providers.map((provider) => {
          const isActive = selectedId === provider.id;
          const isInstitution = /^\d{7}$/.test(provider.id);
          const countLabel = typeof provider.totalCount === "number" ? `${provider.totalCount.toLocaleString()}개` : null;

          return (
            <button
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-left transition-all duration-300 active:scale-95",
                isActive
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-500/10"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200 transition-all duration-300",
                  isActive ? "bg-white ring-emerald-200" : "bg-slate-50"
                )}
              >
                {isInstitution ? (
                  <ProviderLogo
                    providerKey={provider.id}
                    providerName={provider.name}
                    size={20}
                    className={cn("transition-transform duration-300", isActive && "scale-105")}
                  />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isActive ? "text-emerald-600" : "text-slate-400"}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                )}
              </div>
              <div className="min-w-0">
                <span
                  className={cn(
                    "block max-w-[8rem] truncate text-[11px] font-bold leading-tight transition-colors",
                    isActive ? "text-emerald-700" : "text-slate-700"
                  )}
                >
                  {provider.name}
                </span>
                {countLabel ? (
                  <span className={cn("mt-0.5 block text-[10px] font-semibold tabular-nums", isActive ? "text-emerald-600" : "text-slate-400")}>
                    {countLabel}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
