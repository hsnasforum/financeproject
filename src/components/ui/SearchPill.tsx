"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SearchPillProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  isLoading?: boolean;
}

const SearchPill = React.forwardRef<HTMLInputElement, SearchPillProps>(
  ({ className, onClear, isLoading, value, onChange, ...props }, ref) => {
    const hasValue = value !== undefined && value !== null && value !== "";

    return (
      <div className={cn("relative flex flex-1 items-center", className)}>
        <div className="relative flex-1">
          <input
            ref={ref}
            value={value}
            onChange={onChange}
            className={cn(
              "h-11 w-full rounded-full border border-slate-200 bg-surface-muted pl-11 pr-10 text-sm shadow-sm outline-none transition-all duration-300",
              "placeholder:text-slate-400",
              "focus:border-primary focus:ring-2 focus:ring-primary/10 focus:bg-white",
              hasValue && "border-primary/20 bg-primary/20"
            )}
            {...props}
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            {isLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
          </div>
          {hasValue && !isLoading && (
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-300 hover:bg-surface-muted hover:text-slate-500 transition-colors"
              aria-label="검색어 지우기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
            </button>
          )}
        </div>
      </div>
    );
  }
);

SearchPill.displayName = "SearchPill";

export { SearchPill };
