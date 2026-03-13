"use client";

import Link from "next/link";

export function BrandLogo() {
  return (
    <Link href="/" className="flex items-center gap-3 group" aria-label="MMD 홈">
      <div className="relative flex h-11 w-11 items-center justify-center rounded-[16px] bg-[linear-gradient(145deg,#36b5ff_0%,#1ec8a5_100%)] shadow-[0_12px_24px_rgba(22,163,197,0.22)] transition-transform duration-500 group-hover:scale-105">
        <div className="absolute inset-[7px] rounded-[12px] bg-white/18" />
        <div className="relative flex items-center gap-1">
          <span className="block h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.12)]" />
          <span className="block h-2.5 w-2.5 rounded-full bg-[#083344]/85" />
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-[17px] font-black leading-none tracking-[-0.05em] text-slate-900 transition-colors group-hover:text-emerald-600">
          MMD
        </span>
        <span className="mt-1 text-[9px] font-black tracking-[0.16em] text-slate-400 uppercase">
          My Money Design
        </span>
      </div>
    </Link>
  );
}
