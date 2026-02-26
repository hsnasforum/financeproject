"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpDialog } from "@/components/HelpDialog";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { uiTextKo } from "@/lib/uiText.ko";

import { BrandLogo } from "@/components/brand/BrandLogo";

const navItems = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/products/catalog", label: "통합탐색" },
  { href: "/recommend", label: uiTextKo.nav.recommend },
  { href: "/planner", label: uiTextKo.nav.planner },
  { href: "/benefits", label: "혜택" },
  { href: "/housing/subscription", label: "청약" },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-100/60 bg-white/70 backdrop-blur-2xl">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-10">
            <BrandLogo />

            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center mr-2">
              <form action="/products/catalog" method="GET" className="relative group">
                <input
                  name="q"
                  className="h-10 w-64 rounded-[2rem] border border-slate-200 bg-slate-50 pl-4 pr-10 text-[11px] font-medium text-slate-900 outline-none transition-all duration-300 focus:w-72 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300"
                  placeholder="금융상품을 검색해보세요"
                />
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </button>
              </form>
            </div>
            
            <HelpDialog />
            
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden rounded-xl h-10 w-10 p-0"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="메뉴 열기"
            >
              {isMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              )}
            </Button>
          </div>
        </div>
      </Container>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-white/95 backdrop-blur-xl md:hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <nav className="flex flex-col p-4 gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between rounded-2xl p-4 text-base font-bold text-slate-900 transition-colors active:bg-slate-50"
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="m9 18 6-6-6-6"/></svg>
              </Link>
            ))}
            <div className="mt-4 border-t border-slate-100 pt-4 px-2">
               <Link
                href="/help"
                className="flex items-center justify-between rounded-2xl p-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                onClick={() => setIsMenuOpen(false)}
              >
                {uiTextKo.nav.help}
              </Link>
              <Link
                href="/public/dart"
                className="flex items-center justify-between rounded-2xl p-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                onClick={() => setIsMenuOpen(false)}
              >
                기업개황
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
