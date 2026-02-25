"use client";

import { ProviderLogo } from "@/components/ui/ProviderLogo";

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
    <div className="flex w-full gap-3 overflow-x-auto pb-3 scrollbar-hide">
      {providers.map((provider) => {
        const isActive = selectedId === provider.id;
        const isInstitution = /^\d{7}$/.test(provider.id);

        return (
          <button
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            className={`flex min-w-[88px] flex-col items-center gap-2.5 rounded-2xl border bg-white p-4 transition-all duration-300 ${
              isActive
                ? "border-emerald-500 bg-emerald-50/50 ring-4 ring-emerald-50 shadow-sm"
                : "border-slate-100 hover:border-slate-300 hover:bg-slate-50 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]"
            }`}
          >
            {isInstitution ? (
              <ProviderLogo
                providerKey={provider.id}
                providerName={provider.name}
                size={44}
                className={`transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-105"}`}
              />
            ) : (
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-slate-50 transition-all duration-300 ${
                isActive ? "text-emerald-600 border-emerald-200 bg-emerald-100/50 rotate-3" : "text-slate-400 border-slate-100"
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
              </div>
            )}
            <div className="flex flex-col items-center gap-0.5">
              <span className={`text-[11px] font-bold leading-tight ${
                isActive ? "text-emerald-700" : "text-slate-600"
              }`}>
                {provider.name}
              </span>
              {typeof provider.totalCount === "number" ? (
                <span className="text-[9px] font-medium text-slate-400">{provider.totalCount}건</span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
