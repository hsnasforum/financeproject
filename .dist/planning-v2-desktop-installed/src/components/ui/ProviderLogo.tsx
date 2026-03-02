"use client";

import { useState } from "react";
import { resolveProviderKey } from "@/lib/providerLogoKey";
import { pickLogoSrc } from "@/lib/providersManifest";

type Props = {
  providerKey?: string;
  providerName: string;
  size?: number;
  className?: string;
};

export function ProviderLogo({
  providerKey,
  providerName,
  size = 40,
  className = "",
}: Props) {
  const key = resolveProviderKey({ providerKey, providerName });
  const initialSrc = pickLogoSrc(key);
  const [imgStatus, setImgStatus] = useState<"src" | "fallback">(initialSrc ? "src" : "fallback");

  if (imgStatus === "fallback" || !key || !initialSrc) {
    // Fallback Initial Badge (for missing logos or groups/categories)
    const normalizedName = providerName
      .replace(/(주식회사|\(주\)|주\)|㈜)/g, "")
      .trim();
    const initial = normalizedName.charAt(0) || "?";

    return (
      <div
        key={key || "fallback"}
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 font-bold border border-slate-200/70 shadow-sm ${className}`}
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      key={key}
      style={{ width: size, height: size }}
      className={`relative shrink-0 overflow-hidden rounded-full bg-white border border-slate-200/70 shadow-sm flex items-center justify-center ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={initialSrc}
        alt={`${providerName} 로고`}
        className="h-full w-full object-contain p-1"
        onError={() => setImgStatus("fallback")}
      />
    </div>
  );
}
