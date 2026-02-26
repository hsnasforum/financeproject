import type { ReactNode, ElementType } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function Card({ children, className = "", as: Component = "article" }: CardProps) {
  return (
    <Component
      className={`rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-900/5 ${className}`.trim()}
    >
      {children}
    </Component>
  );
}
