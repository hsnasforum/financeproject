"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DataSourceImpactReadOnlyHealth } from "@/lib/dataSources/impactHealth";
import type { DataSourceUserImpactCard } from "@/lib/dataSources/userImpact";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { buildImpactPingSummary, DATA_SOURCE_PING_SOURCE_BY_ID } from "@/lib/dataSources/impactPing";
import {
  DATA_SOURCE_PING_UPDATED_EVENT,
  getDataSourcePingStorageKey,
  parseDataSourcePingSnapshot,
  type DataSourcePingSnapshot,
} from "@/lib/dataSources/pingState";
import { cn } from "@/lib/utils";

type Props = {
  cards: DataSourceUserImpactCard[];
  readOnlyHealthByCardId: Partial<Record<string, DataSourceImpactReadOnlyHealth>>;
  sourceLabels: Record<string, string>;
  showRecentPing: boolean;
};

function impactBadgeClass(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (state === "partial") return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function impactBadgeLabel(state: "ready" | "partial" | "missing") {
  if (state === "ready") return "바로 활용";
  if (state === "partial") return "일부 준비";
  return "준비 필요";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

function readSnapshots(cards: DataSourceUserImpactCard[]): Partial<Record<string, DataSourcePingSnapshot>> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  const sourceIds = [...new Set(cards.flatMap((card) => Object.keys(DATA_SOURCE_PING_SOURCE_BY_ID).filter((sourceId) => {
    const merged = new Set([...card.primarySourceIds, ...(card.supportSourceIds ?? [])]);
    return merged.has(sourceId);
  })))];

  return sourceIds.reduce<Partial<Record<string, DataSourcePingSnapshot>>>((acc, sourceId) => {
    const parsed = parseDataSourcePingSnapshot(window.localStorage.getItem(getDataSourcePingStorageKey(sourceId)));
    if (parsed) acc[sourceId] = parsed;
    return acc;
  }, {});
}

export function DataSourceImpactCardsClient({ cards, readOnlyHealthByCardId, sourceLabels, showRecentPing }: Props) {
  const [snapshotsBySourceId, setSnapshotsBySourceId] = useState<Partial<Record<string, DataSourcePingSnapshot>>>(() => readSnapshots(cards));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => {
      setSnapshotsBySourceId(readSnapshots(cards));
    };
    const handleCustomUpdate = () => {
      refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith("data-source-ping:v1:")) return;
      refresh();
    };
    window.addEventListener(DATA_SOURCE_PING_UPDATED_EVENT, handleCustomUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DATA_SOURCE_PING_UPDATED_EVENT, handleCustomUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [cards]);

  return (
    <Card className="mb-12 rounded-[2rem] p-8 shadow-sm">
      <SubSectionHeader 
        title="사용자 도움 연결" 
        description="지금 연결된 데이터를 기준으로, 어떤 사용자 질문과 화면에 도움이 되는지 정리했습니다."
      />
      
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {cards.map((card) => {
          const recentPing = buildImpactPingSummary(card, sourceLabels, snapshotsBySourceId);
          const readOnlyHealth = readOnlyHealthByCardId[card.id];
          return (
            <div key={card.id} className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex flex-col" data-testid={`data-source-impact-${card.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">{card.title}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{card.question}</p>
                </div>
                <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", impactBadgeClass(card.state))}>
                  {impactBadgeLabel(card.state)}
                </span>
              </div>
              
              <p className="text-sm font-medium leading-relaxed text-slate-600 mb-6">{card.description}</p>
              
              <div className="grid gap-3 sm:grid-cols-2 mb-6">
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">활용 기준</p>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">{card.basis}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">기준 시점</p>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">{card.freshness}</p>
                </div>
              </div>

              {readOnlyHealth ? (
                <div
                  className={cn(
                    "mb-6 rounded-2xl border p-4 shadow-sm",
                    readOnlyHealth.tone === "warning"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-slate-100 bg-white",
                  )}
                  data-testid={`data-source-impact-health-${card.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{readOnlyHealth.title}</p>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest",
                      readOnlyHealth.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500",
                    )}>
                      {readOnlyHealth.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">{readOnlyHealth.description}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2">
                    <p className="text-[10px] font-bold text-slate-400 tabular-nums">
                      {(readOnlyHealth.checkedAtLabel ?? "기준 확인")} {formatDateTime(readOnlyHealth.checkedAt)}
                    </p>
                    {readOnlyHealth.details.length > 0 ? (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {readOnlyHealth.details.map((detail) => (
                          <span
                            key={`${card.id}-${detail.label}-${detail.value}`}
                            className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest"
                          >
                            {detail.label} {formatDateTime(detail.value)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showRecentPing && recentPing ? (
                <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm" data-testid={`data-source-impact-ping-${card.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">최근 연결 확인</p>
                    <p className="text-[10px] font-bold text-slate-400 tabular-nums">{formatDateTime(recentPing.latestFetchedAt)}</p>
                  </div>
                  {recentPing.items.length > 0 ? (
                    <div className="space-y-2">
                      {recentPing.items.map((item) => (
                        <div key={`${card.id}-${item.sourceId}`} className="rounded-xl border border-slate-50 bg-slate-50/50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-700">{item.sourceLabel}</p>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest",
                              item.tone === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                            )}>
                              {item.statusLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] font-medium text-slate-500 leading-relaxed">{item.summaryText}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-slate-400 italic">
                      아직 최근 연결 확인이 없습니다.
                    </p>
                  )}
                  {recentPing.pendingSourceLabels.length > 0 ? (
                    <p className="mt-3 text-[10px] font-bold text-slate-400">
                      대기 중: {recentPing.pendingSourceLabels.join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2 pt-4 border-t border-slate-100">
                {card.routes.map((route) => (
                  <Link
                    key={`${card.id}-${route.href}`}
                    href={route.href}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition-all hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
                  >
                    {route.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
