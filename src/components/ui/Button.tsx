import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ children, className = "", variant = "secondary", size = "md", ...props }: ButtonProps) {
  const byVariant: Record<ButtonVariant, string> = {
    primary: "bg-primary text-primary-foreground border-transparent hover:brightness-110 active:scale-[0.97] shadow-lg shadow-emerald-200/40",
    secondary: "bg-surface-muted text-slate-800 border-transparent hover:bg-slate-200 active:scale-[0.97]",
    ghost: "bg-transparent text-slate-700 border-transparent hover:bg-slate-100 hover:text-primary active:scale-[0.97]",
    outline: "bg-transparent text-slate-700 border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.97]",
  };

  const bySize: Record<ButtonSize, string> = {
    sm: "h-9 px-4 text-xs gap-1.5 rounded-xl",
    md: "h-11 px-5 text-sm gap-2 rounded-2xl",
    lg: "h-14 px-8 text-base gap-3 font-black rounded-3xl",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center border font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:pointer-events-none disabled:opacity-50 ${byVariant[variant]} ${bySize[size]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
