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
    label: "홈",
    match: "prefix" as const,
    excludePrefixes: [],
    includePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18v18H3z"/><path d="M8 14v3"/><path d="M12 10v7"/><path d="M16 7v10"/></svg>
    ),
  },
  {
    href: "/planning",
    label: "진단",
    match: "prefix" as const,
    excludePrefixes: [],
    includePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    ),
  },
  {
    href: "/recommend",
    label: "추천",
    match: "prefix" as const,
    excludePrefixes: [],
    includePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 4-4 4 4"/><path d="M8 8v9"/><path d="m12 16 4-4 4 4"/><path d="M16 12v5"/></svg>
    ),
  },
  {
    href: "/products",
    label: "탐색",
    match: "prefix" as const,
    excludePrefixes: [],
    includePrefixes: ["/benefits", "/public", "/housing", "/tools", "/invest", "/compare", "/gov24"],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    ),
  },
  {
    href: "/settings",
    label: "설정",
    match: "prefix" as const,
    excludePrefixes: [],
    includePrefixes: [],
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.21 17l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.21 7A2 2 0 0 1 7.04 4.2l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 3.6a1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 19.8 7.04l-.06.06A1.65 1.65 0 0 0 19.4 9c.18.51.68.86 1.22 1H21a2 2 0 1 1 0 4h-.09c-.54.14-1.04.49-1.22 1Z"/></svg>
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
          const isActive = item.includePrefixes?.some((prefix) => pathname.startsWith(prefix))
            ? true
            : item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix))
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
