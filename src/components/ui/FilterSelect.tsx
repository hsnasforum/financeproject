"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldError } from "@/components/forms/FieldError";

export interface FilterSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  wrapperClassName?: string;
  selectClassName?: string;
  size?: "sm" | "md";
  labelPosition?: "horizontal" | "vertical";
  error?: React.ReactNode;
}

const FilterSelect = React.forwardRef<HTMLSelectElement, FilterSelectProps>(
  ({ className, label, wrapperClassName, selectClassName, size = "sm", labelPosition = "horizontal", error, children, ...props }, ref) => {
    const isSm = size === "sm";
    const isVertical = labelPosition === "vertical";

    return (
      <div className={cn("flex gap-2", isVertical ? "flex-col items-start" : "items-center", wrapperClassName)}>
        {label && (
          <label 
            htmlFor={props.id}
            className={cn(
              "font-bold uppercase tracking-widest text-slate-400 shrink-0",
              isSm ? "text-[10px]" : "text-[10px] ml-1"
            )}
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          <select
            ref={ref}
            className={cn(
              "w-full border border-slate-200 bg-slate-50 font-bold outline-none transition-all duration-300",
              "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 focus:bg-white",
              "appearance-none pr-8 cursor-pointer",
              isSm ? "h-9 rounded-full px-4 text-xs" : "h-12 rounded-2xl px-4 text-sm shadow-sm",
              error && "border-rose-300 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30",
              selectClassName,
              className
            )}
            aria-invalid={!!error}
            {...props}
          >
            {children}
          </select>
          <div className={cn(
            "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-colors",
            error ? "text-rose-400" : "text-slate-400"
          )}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </div>
          {error && (
            <FieldError message={error} />
          )}
        </div>
      </div>
    );
  }
);

FilterSelect.displayName = "FilterSelect";

export { FilterSelect };
