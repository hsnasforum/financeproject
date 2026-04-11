"use client";

import { cn } from "@/lib/utils";
import { ProviderLogo } from "@/components/ui/ProviderLogo";

type ProviderOption = {
  id: string;
  name: string;
  code?: string;
};

type ProviderChipsProps = {
  providers: ProviderOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
};

export function ProviderChips({ providers, selectedId, onSelect, className }: ProviderChipsProps) {
  return (
    <div className={cn("relative group", className)}>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
        {providers.map((provider) => {
          const isSelected = selectedId === provider.id;
          return (
            <button
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              className={cn(
                "flex min-w-[80px] snap-start flex-col items-center gap-2 rounded-2xl border p-3 transition-all duration-300 active:scale-95",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-slate-100 bg-white hover:border-primary/20 hover:bg-surface-muted"
              )}
            >
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted ring-1 ring-slate-100 transition-colors",
                  isSelected && "bg-white ring-primary/20"
                )}
              >
                <ProviderLogo
                  providerName={provider.name}
                  providerKey={provider.code}
                  className="h-8 w-8"
                />
              </div>
              <span
                className={cn(
                  "text-[11px] font-bold tracking-tight text-slate-500 transition-colors",
                  isSelected && "text-navy"
                )}
              >
                {provider.name}
              </span>
            </button>
          );
        })}
      </div>
      {/* Fade effects for horizontal scroll */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#F8FAFC] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#F8FAFC] to-transparent" />
    </div>
  );
}
