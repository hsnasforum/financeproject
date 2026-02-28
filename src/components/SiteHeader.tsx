"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HelpDialog } from "@/components/HelpDialog";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { uiTextKo } from "@/lib/uiText.ko";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import { buildTodoSummary } from "@/lib/feedback/todoSummary";

const navItems = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/products/catalog", label: "통합탐색" },
  { href: "/recommend", label: uiTextKo.nav.recommend },
  { href: "/planner", label: uiTextKo.nav.planner },
  { href: "/benefits", label: "혜택" },
];

type HeaderFeedbackItem = {
  id: string;
  status: "OPEN" | "DOING" | "DONE";
  priority: "P0" | "P1" | "P2" | "P3";
  dueDate: string | null;
  createdAt: string;
  message: string;
};

type FeedbackListPayload = {
  ok?: boolean;
  data?: HeaderFeedbackItem[];
};

export function SiteHeader() {
  const pathname = usePathname();
  const isDevEnv = process.env.NODE_ENV !== "production";
  const [todoCounts, setTodoCounts] = useState<{ overdue: number; todayHigh: number } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTodoCounts() {
      try {
        const response = await fetch("/api/feedback/list?limit=200", { cache: "no-store" });
        const payload = (await response.json()) as FeedbackListPayload;
        if (!active) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.data)) {
          setTodoCounts(null);
          return;
        }
        const summary = buildTodoSummary(payload.data);
        setTodoCounts({
          overdue: summary.overdueCount,
          todayHigh: summary.todayHighCount,
        });
      } catch {
        if (active) {
          setTodoCounts(null);
        }
      }
    }
    void loadTodoCounts();
    return () => {
      active = false;
    };
  }, []);

  const badges = useMemo(() => {
    if (!todoCounts) return [];
    const next: Array<{ key: string; label: string; tone: "overdue" | "today" }> = [];
    if (todoCounts.overdue > 0) {
      next.push({ key: "overdue", label: `마감 ${todoCounts.overdue}`, tone: "overdue" });
    }
    if (todoCounts.todayHigh > 0) {
      next.push({ key: "today", label: `오늘 ${todoCounts.todayHigh}`, tone: "today" });
    }
    return next;
  }, [todoCounts]);

  const navItemsWithOps = useMemo(
    () => (isDevEnv ? [...navItems, { href: "/ops", label: "Ops" }] : navItems),
    [isDevEnv],
  );

  return (
    <header className="sticky top-0 z-50 w-full bg-surface/80 backdrop-blur-xl transition-all duration-300">
      <Container>
        <div className="flex h-16 items-center justify-between gap-8">
          <div className="flex items-center gap-10">
            <BrandLogo />

            <nav className="hidden md:flex items-center gap-1 bg-surface-muted/50 p-1 rounded-full">
              {navItemsWithOps.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-5 py-2 text-sm font-bold transition-all duration-300",
                      isActive 
                        ? "bg-surface text-primary shadow-sm" 
                        : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center">
              <form action="/products/catalog" method="GET" className="relative group">
                <input
                  name="q"
                  className="h-10 w-64 rounded-full border-none bg-surface-muted pl-4 pr-10 text-xs font-semibold text-slate-900 outline-none transition-all duration-300 focus:w-80 focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:shadow-sm"
                  placeholder="금융상품, 기업, 혜택 검색"
                />
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
              </form>
            </div>
            
            <div className="flex items-center gap-2">
              {badges.length > 0 ? (
                <Link
                  href="/feedback/list?status=OPEN"
                  className="hidden md:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 hover:border-slate-300"
                >
                  {badges.map((badge) => (
                    <span
                      key={badge.key}
                      className={cn(
                        "rounded-full px-2 py-0.5",
                        badge.tone === "overdue"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {badge.label}
                    </span>
                  ))}
                </Link>
              ) : null}
              <HelpDialog />
              <div className="h-4 w-px bg-border mx-1 hidden md:block" />
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full h-10 w-10 p-0 text-slate-400 hover:text-primary hover:bg-surface-muted"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </header>
  );
}
