import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return <article className={`rounded-2xl border border-border bg-surface p-4 shadow-card ${className}`.trim()}>{children}</article>;
}
