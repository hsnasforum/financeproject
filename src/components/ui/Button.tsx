import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ children, className = "", variant = "secondary", size = "md", ...props }: ButtonProps) {
  const byVariant: Record<ButtonVariant, string> = {
    primary: "bg-primary text-primary-foreground border-transparent hover:bg-primary/90 shadow-md shadow-primary/20",
    secondary: "bg-slate-100 text-slate-800 border-transparent hover:bg-slate-200",
    ghost: "bg-transparent text-slate-700 border-transparent hover:bg-primary/5 hover:text-primary",
    outline: "bg-white text-slate-700 border-slate-200 hover:border-primary/50 hover:bg-primary/5 hover:text-primary shadow-sm",
  };

  const bySize: Record<ButtonSize, string> = {
    sm: "h-9 px-4 text-xs gap-1.5 rounded-xl",
    md: "h-11 px-5 text-sm gap-2 rounded-2xl",
    lg: "h-14 px-8 text-base gap-3 font-bold rounded-[2rem]",
  };

  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center border font-bold transition-all duration-300 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100",
        byVariant[variant],
        bySize[size],
        className
      )}
    >
      {children}
    </button>
  );
}
