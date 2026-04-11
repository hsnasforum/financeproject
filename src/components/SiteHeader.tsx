"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Container } from "@/components/ui/Container";
import { devPlanningPrefetch } from "@/lib/navigation/prefetch";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  excludePrefixes?: string[];
  includePrefixes?: string[];
};

const publicNavItems: NavItem[] = [
  { href: "/dashboard", label: "홈", match: "prefix" },
  { href: "/planning", label: "재무진단", match: "prefix" },
  { href: "/recommend", label: "상품추천", match: "prefix" },
  {
    href: "/products",
    label: "금융탐색",
    match: "prefix",
    includePrefixes: ["/benefits", "/public", "/housing", "/tools", "/invest", "/compare", "/gov24"],
  },
  { href: "/settings", label: "내 설정", match: "prefix" },
];

const adminNavItems: NavItem[] = [
  { href: "/ops", label: "Ops", match: "prefix" },
];

const mobileNavItems = publicNavItems;

function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.includePrefixes?.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  if (item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname.startsWith(item.href);
}

function isOpsLikePath(pathname: string): boolean {
  return pathname.startsWith("/ops") || pathname.startsWith("/dev") || pathname.startsWith("/debug");
}

export function SiteHeader() {
  const pathname = usePathname();
  const isAdminMenuActive = adminNavItems.some((item) => isNavActive(pathname, item));
  const showAdminStrip = isOpsLikePath(pathname);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
      <Container className="px-4 sm:px-6 lg:px-8">
        <div className="hidden h-[88px] items-center justify-between gap-8 lg:flex">
          <BrandLogo />
          <div className="flex flex-1 items-center justify-end gap-6">
            <nav className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-[#f5f7fa]/80 p-2">
              {publicNavItems.map((item) => {
                const isActive = isNavActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={devPlanningPrefetch(item.href)}
                    className={cn(
                      "rounded-full px-4 py-2 text-[14px] font-extrabold tracking-[-0.02em] text-slate-700 transition-colors hover:text-primary",
                      isActive ? "bg-white text-primary shadow-sm ring-1 ring-primary/10" : "",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <Link
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-extrabold text-white shadow-[0_14px_28px_-10px_rgba(30,58,138,0.55)] transition-all hover:-translate-y-0.5 hover:bg-primary-hover"
              href="/planning"
              prefetch={devPlanningPrefetch("/planning")}
            >
              재무진단 시작
            </Link>
          </div>
        </div>

        <div className="flex h-16 items-center justify-between gap-4 lg:hidden">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex h-10 items-center rounded-full border border-slate-200 px-4 text-sm font-bold text-slate-700 transition-colors hover:border-primary/10 hover:text-primary"
              href="/products"
              prefetch={devPlanningPrefetch("/products")}
            >
              금융탐색
            </Link>
            <Link
              className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-bold text-white shadow-[0_10px_20px_-8px_rgba(30,58,138,0.5)]"
              href="/planning"
              prefetch={devPlanningPrefetch("/planning")}
            >
              재무진단
            </Link>
          </div>
        </div>
      </Container>

      <div className="border-t border-slate-100 bg-white lg:hidden">
        <Container className="overflow-x-auto py-3 no-scrollbar">
          <nav className="flex min-w-max items-center gap-4">
            {mobileNavItems.map((item) => (
              <Link
                key={`${item.href}:${item.label}`}
                href={item.href}
                prefetch={devPlanningPrefetch(item.href)}
                className={cn(
                  "rounded-full px-3 py-1.5 whitespace-nowrap text-sm font-bold text-slate-700 transition-colors hover:bg-surface-muted hover:text-primary",
                  isNavActive(pathname, item) ? "bg-primary/10 text-primary" : "",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </Container>
      </div>

      {showAdminStrip ? (
        <div className="border-t border-amber-100 bg-amber-50">
          <Container className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6 lg:px-8">
            <p className="font-semibold text-amber-900">운영 화면</p>
            <nav className="flex items-center gap-2">
              {adminNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3 py-1 font-bold text-amber-900/80 transition-colors hover:bg-white/70",
                    isNavActive(pathname, item) ? "bg-white text-amber-900 shadow-sm" : "",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {isAdminMenuActive ? <span className="text-amber-700">현재 운영 경로</span> : null}
            </nav>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
