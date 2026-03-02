import type { ReactNode, ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
} & HTMLAttributes<HTMLElement>;

export function Card({ children, className, as: Component = "article", ...rest }: CardProps) {
  return (
    <Component
      className={cn(
        "rounded-2xl bg-surface p-6 shadow-card transition-all duration-300 hover:shadow-card-hover",
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
