"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { cn } from "@/lib/utils";

function shouldHideMobileBottomNav(pathname: string): boolean {
  return pathname.startsWith("/ops") || pathname.startsWith("/dev") || pathname.startsWith("/debug");
}

const navItems = [
  {
    href: "/dashboard",
    label: "브리핑",
    match: "prefix" as const,
    excludePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M8 14v3"/><path d="M12 10v7"/><path d="M16 7v10"/></svg>
    ),
  },
  {
    href: "/planning",
    label: "플래닝",
    match: "prefix" as const,
    excludePrefixes: ["/planning/reports", "/planning/runs"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    ),
  },
  {
    href: "/planning/reports",
    label: "리포트",
    match: "prefix" as const,
    excludePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18h10"/><path d="M7 12h10"/><path d="M7 6h10"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
    ),
  },
  {
    href: "/benefits",
    label: "혜택",
    match: "prefix" as const,
    excludePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11Z"/><path d="m9.5 12 1.7 1.7 3.3-3.4"/></svg>
    ),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  if (shouldHideMobileBottomNav(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/90 pb-safe backdrop-blur-xl shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.1)] md:hidden">
      <div className="flex items-center justify-around px-2 py-3">
        {navItems.map((item) => {
          const isActive = item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix))
            ? false
            : item.match === "prefix"
              ? pathname === item.href || pathname.startsWith(item.href)
              : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={devPlanningPrefetch(item.href)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 transition-all active:scale-90",
                isActive ? "text-primary" : "text-slate-400 hover:text-slate-600",
              )}
            >
              <div
                className={cn(
                  "relative transition-transform duration-300",
                  isActive && "scale-110",
                )}
              >
                {item.icon}
                {isActive ? (
                  <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                ) : null}
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold tracking-tight",
                  isActive ? "text-primary" : "text-slate-500",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
