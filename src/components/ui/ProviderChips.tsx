"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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

export function getProviderChipScrollOffset(key: string, viewportWidth: number): number | null {
  const distance = Math.max(160, Math.round(viewportWidth * 0.7));
  if (key === "ArrowRight") return distance;
  if (key === "ArrowLeft") return -distance;
  return null;
}

export function ProviderChips({ providers, selectedId, onSelect, className }: ProviderChipsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [scrollState, setScrollState] = useState({
    hasLeft: false,
    hasRight: providers.length > 4,
  });

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      setScrollState({
        hasLeft: scroller.scrollLeft > 2,
        hasRight: scroller.scrollLeft < maxScrollLeft - 2,
      });
    };

    updateScrollState();
    scroller.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [providers.length]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const offset = getProviderChipScrollOffset(event.key, scroller.clientWidth);
    if (offset === null) return;
    event.preventDefault();
    scroller.scrollBy({ left: offset, behavior: "smooth" });
  }

  const hasOverflow = scrollState.hasLeft || scrollState.hasRight;

  return (
    <div className={cn("group relative min-w-0 max-w-full overflow-hidden", className)}>
      <div
        ref={scrollerRef}
        className="flex max-w-full gap-3 overflow-x-auto pb-2 pr-8 scrollbar-hide snap-x"
        role="group"
        aria-label="금융기관 선택"
        aria-describedby={hasOverflow ? hintId : undefined}
        onKeyDown={handleKeyDown}
      >
        {providers.map((provider) => {
          const isSelected = selectedId === provider.id;
          return (
            <button
              type="button"
              key={provider.id}
              onClick={() => onSelect(provider.id)}
              aria-pressed={isSelected}
              aria-label={`${provider.name}${isSelected ? ", 선택됨" : " 선택"}`}
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
      {scrollState.hasLeft ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#F8FAFC] to-transparent" />
      ) : null}
      {scrollState.hasRight ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#F8FAFC] to-transparent" />
      ) : null}
      {hasOverflow ? (
        <p id={hintId} className="mt-1 text-right text-[10px] font-bold text-slate-500 sm:hidden" aria-live="polite">
          {scrollState.hasRight ? "옆으로 밀거나 좌우 화살표 키로 기관 더 보기 →" : "← 왼쪽에도 기관이 있습니다"}
        </p>
      ) : null}
    </div>
  );
}
