"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  LineChart,
  Sparkles,
  Compass,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { cn } from "@/lib/utils";

function shouldHideMobileBottomNav(pathname: string): boolean {
  return pathname.startsWith("/ops") || pathname.startsWith("/dev") || pathname.startsWith("/debug");
}

type NavItem = {
  href: string;
  label: string;
  match: "prefix" | "exact";
  excludePrefixes: string[];
  includePrefixes: string[];
  Icon: LucideIcon;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "홈",
    match: "prefix",
    excludePrefixes: [],
    includePrefixes: [],
    Icon: Home,
  },
  {
    href: "/planning",
    label: "진단",
    match: "prefix",
    excludePrefixes: [],
    includePrefixes: [],
    Icon: LineChart,
  },
  {
    href: "/recommend",
    label: "추천",
    match: "prefix",
    excludePrefixes: [],
    includePrefixes: [],
    Icon: Sparkles,
  },
  {
    href: "/products",
    label: "탐색",
    match: "prefix",
    excludePrefixes: [],
    includePrefixes: ["/benefits", "/public", "/housing", "/tools", "/invest", "/compare", "/gov24"],
    Icon: Compass,
  },
  {
    href: "/settings",
    label: "설정",
    match: "prefix",
    excludePrefixes: [],
    includePrefixes: [],
    Icon: Settings,
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  if (shouldHideMobileBottomNav(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/70 bg-surface/90 pb-safe backdrop-blur-xl shadow-[0_-8px_30px_-15px_rgba(10,31,68,0.12)] md:hidden">
      <div className="flex items-center justify-around px-2 py-3">
        {navItems.map(({ Icon, ...item }) => {
          const isActive = item.includePrefixes.some((prefix) => pathname.startsWith(prefix))
            ? true
            : item.excludePrefixes.some((prefix) => pathname.startsWith(prefix))
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
                <Icon
                  size={20}
                  strokeWidth={2}
                  className={cn(isActive ? "text-primary" : "text-current")}
                />
                {isActive ? (
                  <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
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
