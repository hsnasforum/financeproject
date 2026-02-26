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
    primary: "bg-emerald-600 text-white border-transparent hover:bg-emerald-700 shadow-md shadow-emerald-500/20",
    secondary: "bg-slate-100 text-slate-800 border-transparent hover:bg-slate-200",
    ghost: "bg-transparent text-slate-700 border-transparent hover:bg-emerald-50 hover:text-emerald-700",
    outline: "bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 shadow-sm",
  };

  const bySize: Record<ButtonSize, string> = {
    sm: "h-9 px-4 text-xs gap-1.5 rounded-xl",
    md: "h-11 px-5 text-sm gap-2 rounded-2xl",
    lg: "h-14 px-8 text-base gap-3 font-black rounded-[2rem]",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center border font-bold transition-all duration-300 hover:scale-[1.02] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 ${byVariant[variant]} ${bySize[size]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
