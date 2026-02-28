"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtifactQuickActions } from "@/components/ArtifactQuickActions";
import { Card } from "@/components/ui/Card";
import type { DailyBrief } from "@/lib/dart/dailyBriefBuilder";

type DailyBriefApiPayload = {
  ok?: boolean;
  data?: DailyBrief | null;
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

export function DartDailyBriefCard({ showQuickActions = false }: { showQuickActions?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<DailyBrief | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/dev/dart/brief", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as DailyBriefApiPayload;
        if (!active) return;
        setBrief(payload.data ?? null);
      } catch {
        if (!active) return;
        setBrief(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const lines = Array.isArray(brief?.lines) ? brief.lines.slice(0, 5) : [];

  return (
    <Card className="p-8 border-slate-100 bg-white shadow-lg shadow-slate-200/30 rounded-[2rem] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">일일 브리핑</h3>
          <p className="text-xs text-slate-400 mt-1">DART 신규/업데이트 요약</p>
        </div>
        <Link href="/public/dart" className="text-xs font-bold text-emerald-700 hover:text-emerald-800">
          전체 보기
        </Link>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">generatedAt: {formatDateTime(brief?.generatedAt ?? null)}</p>

      {loading ? (
        <p className="mt-4 text-xs text-slate-500">브리핑 로딩 중...</p>
      ) : lines.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">dart:watch 실행 필요</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
              <p className="text-xs font-bold text-slate-800 leading-relaxed">{line}</p>
              <p className="mt-1 text-[11px] text-slate-500">핵심 라인 {index + 1}</p>
            </li>
          ))}
        </ul>
      )}

      {showQuickActions ? (
        <div className="mt-4">
          <ArtifactQuickActions artifactName="brief_md" label="브리핑 빠른 작업" />
        </div>
      ) : null}
    </Card>
  );
}
