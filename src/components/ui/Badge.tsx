import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "outline" | "secondary" | "success" | "warning" | "destructive";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const byVariant: Record<BadgeVariant, string> = {
    default: "bg-slate-900 text-white border-transparent",
    outline: "text-slate-500 border-slate-200 bg-transparent font-semibold",
    secondary: "bg-surface-muted text-slate-600 border-transparent font-semibold",
    success: "bg-primary/5 text-navy border-primary/10 font-bold",
    warning: "bg-amber-50 text-amber-700 border-amber-100 font-bold",
    destructive: "bg-red-50 text-red-700 border-red-100 font-bold",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300",
        byVariant[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
