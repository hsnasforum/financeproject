"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  label: string;
  href: string;
  disabled?: boolean;
};

const TABS: Tab[] = [
  { label: "예금", href: "/products/deposit" },
  { label: "적금", href: "/products/saving" },
  { label: "주담대", href: "/products/mortgage-loan" },
  { label: "전세대출", href: "/products/rent-house-loan" },
  { label: "신용대출", href: "/products/credit-loan" },
];

export function SegmentedTabs() {
  const pathname = usePathname();

  return (
    <div className="flex w-full overflow-hidden rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/50">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        
        if (tab.disabled) {
          return (
            <button
              key={tab.label}
              disabled
              className="flex-1 rounded-full px-4 py-2 text-center text-[11px] font-bold text-slate-400 opacity-50 cursor-not-allowed"
            >
              {tab.label}
            </button>
          );
        }

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={`flex-1 rounded-full px-4 py-2 text-center text-[11px] font-bold transition-all duration-300 ${
              isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
