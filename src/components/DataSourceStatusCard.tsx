"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { DataSourcePingButton } from "@/components/DataSourcePingButton";
import {
  DATA_SOURCE_PING_UPDATED_EVENT,
  getDataSourcePingStorageKey,
  parseDataSourcePingSnapshot,
  stringifyDataSourcePingSnapshot,
  type DataSourcePingSnapshot,
  type PingSourceName,
} from "@/lib/dataSources/pingState";
import { cn } from "@/lib/utils";

type SourceCardProps = {
  source: {
    id: string;
    label: string;
    env: { key: string; optional?: boolean }[];
    status: { state: "configured" | "missing" | "error"; message?: string };
  };
  pingSource?: PingSourceName;
  autoEndpointHint?: string;
  canPing: boolean;
};

function badgeClass(state: "configured" | "missing" | "error") {
  if (state === "configured") return "bg-primary text-white border-none shadow-sm";
  if (state === "missing") return "bg-amber-100 text-amber-800 border-none font-bold";
  return "bg-rose-100 text-rose-800 border-none font-bold";
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

function readStoredSnapshot(sourceId: string): DataSourcePingSnapshot | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return parseDataSourcePingSnapshot(window.localStorage.getItem(getDataSourcePingStorageKey(sourceId)));
}

export function DataSourceStatusCard({ source, pingSource, autoEndpointHint, canPing }: SourceCardProps) {
  const [snapshot, setSnapshot] = useState<DataSourcePingSnapshot | null>(() => readStoredSnapshot(source.id));

  function handlePingResult(nextSnapshot: DataSourcePingSnapshot) {
    setSnapshot(nextSnapshot);
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(
        getDataSourcePingStorageKey(source.id),
        stringifyDataSourcePingSnapshot(nextSnapshot),
      );
      window.dispatchEvent(new CustomEvent(DATA_SOURCE_PING_UPDATED_EVENT, {
        detail: { sourceId: source.id },
      }));
    } catch {
      // 저장 실패는 운영 진단 흐름을 막지 않는다.
    }
  }

  return (
    <Card className="p-0 overflow-hidden flex flex-col justify-between group" data-testid={`data-source-card-${source.id}`}>
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{source.label}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{source.id}</p>
          </div>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", badgeClass(source.status.state))}>
            {source.status.state}
          </span>
        </div>

        <div className="text-[11px] text-slate-600 font-medium space-y-1.5">
          <p className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="font-bold text-slate-400 mr-1">필요 ENV:</span>
            {source.env.map((entry) => `${entry.key}${entry.optional ? "(선택)" : ""}`).join(", ")}
          </p>
          {autoEndpointHint ? (
            <p className="flex items-start gap-1.5">
              <span className="h-1 w-1 rounded-full bg-slate-300 mt-1.5" />
              <span><span className="font-bold text-slate-400 mr-1">경로:</span> {autoEndpointHint}</span>
            </p>
          ) : null}
          {source.status.message ? (
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-2 font-bold text-amber-700">
              {source.status.message}
            </div>
          ) : null}
          {snapshot ? (
            <div
              className={cn(
                "mt-3 rounded-lg border p-3",
                snapshot.tone === "ok" ? "border-emerald-100 bg-emerald-50/80 text-emerald-800" : "border-rose-100 bg-rose-50/80 text-rose-800",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide">최근 연결 확인</p>
                <span className="text-[11px] font-semibold">{snapshot.statusLabel ?? (snapshot.tone === "ok" ? "정상" : "주의")}</span>
              </div>
              <p className="mt-1 text-[11px] opacity-80">{formatDateTime(snapshot.fetchedAt)}</p>
              <p className="mt-1 text-xs leading-5">{snapshot.summaryText ?? snapshot.text}</p>
              {snapshot.details && snapshot.details.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {snapshot.details.map((detail) => (
                    <span
                      key={`${detail.label}:${detail.value}`}
                      className="rounded-full border border-white/70 bg-white/80 px-2 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {detail.label} {detail.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {canPing && pingSource ? (
        <div className="bg-surface border-t border-border/50 p-3 flex justify-end">
          <DataSourcePingButton source={pingSource} onResult={handlePingResult} showInlineState={false} />
        </div>
      ) : null}
    </Card>
  );
}
