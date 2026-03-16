"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterWrapperProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * FilterWrapper provides a consistent flex container for filter inputs.
 * It ensures proper spacing (gap-4) and alignment for filters across screens.
 */
export function FilterWrapper({ className, children, ...props }: FilterWrapperProps) {
  return (
    <div 
      className={cn("flex flex-wrap items-center gap-4", className)} 
      {...props}
    >
      {children}
    </div>
  );
}
