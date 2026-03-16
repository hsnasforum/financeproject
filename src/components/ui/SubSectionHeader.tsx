"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SubSectionHeaderProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

/**
 * SubSectionHeader is used for headers inside cards or smaller sections.
 * It follows the black font and tight tracking of the main UI language
 * but at a smaller scale (text-lg or text-base).
 */
export function SubSectionHeader({ 
  title, 
  description, 
  action, 
  className,
  titleClassName,
  descriptionClassName
}: SubSectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 mb-4", className)}>
      <div>
        <h3 className={cn("text-lg font-black text-slate-900 tracking-tight", titleClassName)}>
          {title}
        </h3>
        {description && (
          <div className={cn("mt-1 text-sm text-slate-500 font-medium leading-relaxed", descriptionClassName)}>
            {description}
          </div>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}
