import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ children, className = "", variant = "secondary", size = "md", ...props }: ButtonProps) {
  const byVariant: Record<ButtonVariant, string> = {
    primary: "border-primary bg-primary text-white hover:brightness-95",
    secondary: "border-border bg-surface text-slate-800 hover:bg-surface-muted",
    ghost: "border-transparent bg-transparent text-slate-700 hover:bg-surface-muted",
  };

  const bySize: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-xl border font-medium transition ${byVariant[variant]} ${bySize[size]} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
