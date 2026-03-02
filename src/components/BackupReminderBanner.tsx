"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type BackupReminderBannerProps = {
  scope: "planning" | "ops";
  appVersion?: string;
  className?: string;
};

const STORAGE_KEY_PREFIX = "planning:update-backup-reminder:dismissed:";

export function BackupReminderBanner({ scope, appVersion, className = "" }: BackupReminderBannerProps) {
  const storageKey = useMemo(() => `${STORAGE_KEY_PREFIX}${scope}`, [scope]);
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(storageKey) === "1";
  });

  if (hidden) return null;

  return (
    <div className={`mx-auto mt-3 w-full max-w-6xl rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <p>
          업데이트 전 백업 권장.{" "}
          <Link className="font-semibold underline" href="/ops/backup">
            /ops/backup
          </Link>
          {appVersion ? <span className="ml-2 text-xs text-amber-800">v{appVersion}</span> : null}
        </p>
        <button
          type="button"
          className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem(storageKey, "1");
            }
            setHidden(true);
          }}
          data-testid={`backup-reminder-dismiss-${scope}`}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
