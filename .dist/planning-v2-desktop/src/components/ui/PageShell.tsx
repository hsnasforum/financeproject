import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

export function PageShell({ children, className }: PageShellProps) {
  return (
    <main className={cn("min-h-screen pb-24", className)}>
      <Container className="pt-8 md:pt-12">
        {children}
      </Container>
    </main>
  );
}
