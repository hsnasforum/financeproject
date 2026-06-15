"use client";

import { useState } from "react";
import { resolveProviderKey } from "@/lib/providerLogoKey";
import { pickLogoSrc } from "@/lib/providersManifest";
import { cn } from "@/lib/utils";

type Props = {
  providerKey?: string;
  providerName: string;
  size?: number;
  className?: string;
};

const SIZE_CLASS_BY_VALUE: Record<number, { box: string; text: string }> = {
  20: { box: "h-5 w-5", text: "text-[10px]" },
  40: { box: "h-10 w-10", text: "text-sm" },
  48: { box: "h-12 w-12", text: "text-base" },
  56: { box: "h-14 w-14", text: "text-lg" },
};

function resolveSizeClasses(size: number): { box: string; text: string } {
  if (SIZE_CLASS_BY_VALUE[size]) {
    return SIZE_CLASS_BY_VALUE[size];
  }
  if (size <= 20) return SIZE_CLASS_BY_VALUE[20];
  if (size <= 40) return SIZE_CLASS_BY_VALUE[40];
  if (size <= 48) return SIZE_CLASS_BY_VALUE[48];
  return SIZE_CLASS_BY_VALUE[56];
}

export function ProviderLogo({
  providerKey,
  providerName,
  size = 40,
  className = "",
}: Props) {
  const key = resolveProviderKey({ providerKey, providerName });
  const initialSrc = pickLogoSrc(key);
  const [imgStatus, setImgStatus] = useState<"src" | "fallback">(initialSrc ? "src" : "fallback");
  const sizeClasses = resolveSizeClasses(size);

  if (imgStatus === "fallback" || !key || !initialSrc) {
    // Fallback Initial Badge (for missing logos or groups/categories)
    const normalizedName = providerName
      .replace(/(주식회사|\(주\)|주\)|㈜)/g, "")
      .trim();
    const initial = normalizedName.charAt(0) || "?";

    return (
      <div
        key={key || "fallback"}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-slate-200/70 bg-surface-muted font-bold text-slate-400 shadow-sm",
          sizeClasses.box,
          sizeClasses.text,
          className,
        )}
      >
        {initial}
      </div>
    );
  }

  return (
    <div
      key={key}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200/70 bg-white shadow-sm",
        sizeClasses.box,
        className,
      )}
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
