"use client";

import Link from "next/link";
import Image from "next/image";
import { uiTextKo } from "@/lib/uiText.ko";

export function BrandLogo() {
  return (
    <Link href="/" className="flex items-center gap-3 group" aria-label="핀라이프 홈">
      <div className="relative">
        <div className="absolute inset-0 bg-emerald-100 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <Image
          src="/brand/logo-icon.png"
          alt=""
          aria-hidden="true"
          width={36}
          height={36}
          className="relative h-9 w-9 object-contain transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[10deg]"
        />
      </div>
      <div className="flex flex-col">
        <span className="text-base font-black leading-none tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">
          {uiTextKo.app.brand}
        </span>
        <span className="text-[9px] text-slate-400 font-black tracking-[0.2em] mt-1 uppercase">AI Navigator</span>
      </div>
    </Link>
  );
}
