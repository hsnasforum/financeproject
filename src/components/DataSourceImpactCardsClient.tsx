"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DataSourceImpactReadOnlyHealth } from "@/lib/dataSources/impactHealth";
import type { DataSourceUserImpactCard } from "@/lib/dataSources/userImpact";
import { Card } from "@/components/ui/Card";
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
  if (state === "ready") return "bg-emerald-100 text-emerald-700";
  if (state === "partial") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
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
  return parsed.toLocaleString("ko-KR");
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
    <Card className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">사용자 도움 연결</p>
          <p className="mt-1 text-sm text-slate-600">
            `.env.local`에 있는 API 키를 기준으로, 지금 어떤 사용자 질문을 더 잘 풀 수 있는지 정리했습니다.
          </p>
        </div>
        <p className="text-xs font-semibold text-slate-500">
          키 값은 숨기고 활용 방향만 표시합니다.
        </p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {cards.map((card) => {
          const recentPing = buildImpactPingSummary(card, sourceLabels, snapshotsBySourceId);
          const readOnlyHealth = readOnlyHealthByCardId[card.id];
          return (
            <div key={card.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" data-testid={`data-source-impact-${card.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{card.question}</p>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", impactBadgeClass(card.state))}>
                  {impactBadgeLabel(card.state)}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-700">{card.description}</p>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">활용 기준</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{card.basis}</p>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">기준 시점</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{card.freshness}</p>
              </div>
              {readOnlyHealth ? (
                <div
                  className={cn(
                    "mt-3 rounded-2xl border px-3 py-2",
                    readOnlyHealth.tone === "warning"
                      ? "border-amber-200 bg-amber-50/80"
                      : "border-slate-200 bg-white/80",
                  )}
                  data-testid={`data-source-impact-health-${card.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{readOnlyHealth.title}</p>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      readOnlyHealth.tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700",
                    )}>
                      {readOnlyHealth.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{readOnlyHealth.description}</p>
                  {readOnlyHealth.checkedAt ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      {(readOnlyHealth.checkedAtLabel ?? "기준 확인")} {formatDateTime(readOnlyHealth.checkedAt)}
                    </p>
                  ) : null}
                  {readOnlyHealth.details.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {readOnlyHealth.details.map((detail) => (
                        <span
                          key={`${card.id}-${detail.label}-${detail.value}`}
                          className="rounded-full border border-white/70 bg-white/90 px-2 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {detail.label} {formatDateTime(detail.value)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showRecentPing && recentPing ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2" data-testid={`data-source-impact-ping-${card.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">최근 연결 확인</p>
                    <p className="text-[11px] font-semibold text-slate-500">{formatDateTime(recentPing.latestFetchedAt)}</p>
                  </div>
                  {recentPing.items.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {recentPing.items.map((item) => (
                        <div key={`${card.id}-${item.sourceId}`} className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">{item.sourceLabel}</p>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              item.tone === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                            )}>
                              {item.statusLabel}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{item.summaryText}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      아직 최근 연결 확인이 없습니다. 아래 소스 카드에서 연결 테스트를 실행하면 여기에 반영됩니다.
                    </p>
                  )}
                  {recentPing.pendingSourceLabels.length > 0 ? (
                    <p className="mt-2 text-[11px] font-medium text-slate-500">
                      아직 확인 안 된 소스: {recentPing.pendingSourceLabels.join(" · ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {card.routes.map((route) => (
                  <Link
                    key={`${card.id}-${route.href}`}
                    href={route.href}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
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
