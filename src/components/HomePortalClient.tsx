"use client";

import Link from "next/link";
import { useMemo } from "react";
import { listSnapshots } from "@/lib/planner/storage";
import { Card } from "@/components/ui/Card";

export function HomePortalClient() {
  const recent = useMemo(() => listSnapshots().slice(0, 3), []);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">최근 스냅샷</h3>
        <Link href="/planner" className="text-sm text-primary underline underline-offset-4">
          재무설계로 이동
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">아직 저장된 스냅샷이 없습니다. 재무설계에서 첫 스냅샷을 저장해 보세요.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {recent.map((snap) => (
            <li key={snap.id} className="rounded-xl border border-border bg-surface-muted p-3">
              <p className="font-medium text-slate-800">{snap.input.goalName}</p>
              <p className="text-xs text-slate-600">{snap.createdAt.slice(0, 16)} · 월저축 {Math.round(snap.metrics.monthlySaving).toLocaleString()}원</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
