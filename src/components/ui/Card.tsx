import type { ReactNode, ElementType } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function Card({ children, className = "", as: Component = "article" }: CardProps) {
  return (
    <Component
      className={`rounded-3xl border border-border bg-surface p-6 shadow-card transition-all duration-300 hover:shadow-md ${className}`.trim()}
    >
      {children}
    </Component>
  );
}
