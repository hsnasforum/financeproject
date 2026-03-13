"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type DevUnlockShortcutLinkProps = {
  className?: string;
  label?: string;
};

type DevUnlockShortcutMessageProps = {
  message?: string | null;
  className?: string;
  linkClassName?: string;
  label?: string;
};

export function isDevUnlockCsrfMessage(message?: string): boolean {
  const normalized = typeof message === "string" ? message.trim().toLowerCase() : "";
  if (!normalized) return false;
  if (normalized.includes("vault")) return false;
  return normalized.includes("dev unlock/csrf")
    || normalized.includes("dev unlock 및 csrf")
    || normalized.includes("dev unlock")
    || normalized.includes("csrf")
    || normalized.includes("동일 origin")
    || normalized.includes("origin 요청만 허용")
    || normalized.includes("origin mismatch")
    || normalized.includes("same origin")
    || normalized.includes("로컬 환경")
    || normalized.includes("로컬 호스트")
    || normalized.includes("localhost")
    || normalized.includes("local only");
}

export function DevUnlockShortcutLink({
  className,
  label = "/ops/rules 바로가기",
}: DevUnlockShortcutLinkProps) {
  return (
    <Link
      href="/ops/rules"
      className={cn("underline underline-offset-2", className)}
    >
      {label}
    </Link>
  );
}

export function DevUnlockShortcutMessage({
  message,
  className,
  linkClassName,
  label,
}: DevUnlockShortcutMessageProps) {
  const normalized = typeof message === "string" ? message.trim() : "";
  if (!normalized) return null;

  return (
    <p className={className}>
      {normalized}
      {isDevUnlockCsrfMessage(normalized) ? (
        <>
          {" "}
          <DevUnlockShortcutLink className={linkClassName} label={label} />
        </>
      ) : null}
    </p>
  );
}
