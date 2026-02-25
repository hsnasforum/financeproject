import type { ReactNode } from "react";

type BadgeVariant = "default" | "outline" | "secondary" | "success" | "warning" | "destructive";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const byVariant: Record<BadgeVariant, string> = {
    default: "bg-primary text-primary-foreground border-transparent",
    outline: "text-slate-500 border-slate-200 bg-transparent font-bold uppercase",
    secondary: "bg-slate-100 text-slate-600 border-transparent font-bold uppercase",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/50 font-black",
    warning: "bg-amber-50 text-amber-700 border-amber-200/50 font-black",
    destructive: "bg-red-50 text-red-700 border-red-200/50 font-black",
  };

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-3 py-1 text-[9px] tracking-widest transition-all ${byVariant[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
