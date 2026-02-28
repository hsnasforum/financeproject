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
    <div className="relative group/carousel">
      <div className="flex w-full gap-3 overflow-x-auto pb-3 scrollbar-hide snap-x">
        {providers.map((provider) => {
          const isActive = selectedId === provider.id;
          const isInstitution = /^\d{7}$/.test(provider.id);

          return (
            <button
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              className={cn(
                "flex min-w-[84px] snap-start flex-col items-center gap-2.5 rounded-2xl border bg-white p-4 transition-all duration-300 active:scale-95",
                isActive
                  ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-500 shadow-sm"
                  : "border-slate-100 hover:border-emerald-200 hover:bg-slate-50"
              )}
            >
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-100 transition-all duration-300",
                isActive ? "bg-white ring-emerald-200" : "group-hover:bg-white"
              )}>
                {isInstitution ? (
                  <ProviderLogo
                    providerKey={provider.id}
                    providerName={provider.name}
                    size={32}
                    className={cn("transition-transform duration-500", isActive && "scale-110")}
                  />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isActive ? "text-emerald-600" : "text-slate-400"}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
                )}
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className={cn(
                  "text-[11px] font-bold tracking-tight text-center leading-tight transition-colors",
                  isActive ? "text-emerald-700" : "text-slate-500"
                )}>
                  {provider.name}
                </span>
                {typeof provider.totalCount === "number" && (
                  <span className="text-[9px] font-bold text-slate-400 tabular-nums">{provider.totalCount}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent opacity-0 group-hover/carousel:opacity-100 transition-opacity" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
    </div>
  );
}
