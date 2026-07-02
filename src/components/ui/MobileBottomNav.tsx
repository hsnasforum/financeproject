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
import {
  getPublicBottomNavItems,
  isNavigationItemActive,
  isOpsOrDevRoute,
  type NavIconKey,
} from "@/lib/navigation/routeRegistry";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { cn } from "@/lib/utils";

const iconByKey: Record<NavIconKey, LucideIcon> = {
  home: Home,
  planning: LineChart,
  recommend: Sparkles,
  explore: Compass,
  settings: Settings,
};

export function MobileBottomNav() {
  const pathname = usePathname();
  if (isOpsOrDevRoute(pathname)) return null;
  const navItems = getPublicBottomNavItems();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/70 bg-surface/90 pb-safe backdrop-blur-xl shadow-[0_-8px_30px_-15px_rgba(10,31,68,0.12)] md:hidden">
      <div className="flex items-center justify-around px-2 py-3">
        {navItems.map((item) => {
          const Icon = item.icon ? iconByKey[item.icon] : Compass;
          const isActive = isNavigationItemActive(pathname, item);
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
                {item.mobileLabel ?? item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
