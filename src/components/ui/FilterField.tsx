"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  unit?: string;
  wrapperClassName?: string;
  labelPosition?: "horizontal" | "vertical";
}

const FilterField = React.forwardRef<HTMLInputElement, FilterFieldProps>(
  ({ className, label, unit, wrapperClassName, labelPosition = "horizontal", value, ...props }, ref) => {
    const hasValue = value !== undefined && value !== null && value !== "";
    const isVertical = labelPosition === "vertical";

    return (
      <div className={cn("flex gap-3", isVertical ? "flex-col items-start" : "items-center", wrapperClassName)}>
        {label && (
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            {label}
          </label>
        )}
        <div
          className={cn(
            "flex items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 transition-all duration-300 w-full",
            "focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 focus-within:bg-white",
            hasValue && "border-emerald-200 bg-emerald-50/20"
          )}
        >
          <input
            ref={ref}
            value={value}
            className={cn(
              "h-9 min-w-16 bg-transparent px-3 text-center text-sm font-bold outline-none placeholder:text-slate-300 placeholder:font-normal flex-1",
              className
            )}
            {...props}
          />
          {unit && (
            <span className="bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-500 border-l border-slate-200 whitespace-nowrap">
              {unit}
            </span>
          )}
        </div>
      </div>
    );
  }
);

FilterField.displayName = "FilterField";

export { FilterField };
