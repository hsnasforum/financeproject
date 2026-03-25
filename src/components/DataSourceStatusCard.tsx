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
  if (state === "configured") return "bg-emerald-50 text-emerald-700 border-emerald-100 shadow-sm";
  if (state === "missing") return "bg-amber-50 text-amber-700 border-amber-100 font-black";
  return "bg-rose-50 text-rose-700 border-rose-100 font-black";
}

function badgeLabel(state: "configured" | "missing" | "error") {
  if (state === "configured") return "연결 준비됨";
  if (state === "missing") return "설정 필요";
  return "점검 필요";
}

function userSummary(state: "configured" | "missing" | "error") {
  if (state === "configured") {
    return "현재 이 데이터는 관련 화면과 안내에 연결할 준비가 되어 있습니다.";
  }
  if (state === "missing") {
    return "연결 정보가 없어 일부 화면에서는 기본 안내만 보여 주거나 결과 범위가 줄어들 수 있습니다.";
  }
  return "최근 확인 기준에 점검이 필요해 일부 결과가 늦거나 비어 보일 수 있습니다.";
}

function readBasisSummary(state: "configured" | "missing" | "error") {
  if (state === "configured") {
    return "현재는 연결 준비 상태로 읽고 있으며, 아래 최근 연결 확인에서 마지막 점검 시점을 함께 봅니다.";
  }
  if (state === "missing") {
    return "연결 정보가 없어 일부 화면은 기본 안내 중심으로 읽고, 세부 결과 범위는 줄어들 수 있습니다.";
  }
  return "점검이 필요한 상태라 최신 결과보다 보수적인 안내가 먼저 보일 수 있습니다.";
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
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
    <Card className="p-0 overflow-hidden flex flex-col justify-between group rounded-[2rem] shadow-sm border-slate-100 hover:border-emerald-100 transition-all" data-testid={`data-source-card-${source.id}`}>
      <div className="p-6 flex-1">
        <div className="flex items-start justify-between gap-2 mb-6">
          <div>
            <p className="text-lg font-black text-slate-900 tracking-tight leading-tight">{source.label}</p>
            <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
              사용자 영향, 현재 읽는 기준, 최근 연결 확인까지 먼저 보고, 개발용 연결 조건과 점검 액션은 맨 아래에서만 확인합니다.
            </p>
          </div>
          <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", badgeClass(source.status.state))}>
            {badgeLabel(source.status.state)}
          </span>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">사용자에게 보이는 영향</p>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">{userSummary(source.status.state)}</p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">현재 읽는 기준</p>
            <p className="text-xs font-bold text-slate-700 leading-relaxed">{readBasisSummary(source.status.state)}</p>
          </div>

          {snapshot ? (
            <div
              className={cn(
                "rounded-2xl border p-4 shadow-sm",
                snapshot.tone === "ok" ? "border-emerald-100 bg-emerald-50/30 text-emerald-900" : "border-rose-100 bg-rose-50/30 text-rose-900",
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-60">최근 연결 확인 참고</p>
                <span className="text-[10px] font-black uppercase tracking-widest bg-white/50 px-1.5 py-0.5 rounded border border-white/50">{snapshot.statusLabel ?? (snapshot.tone === "ok" ? "정상" : "주의")}</span>
              </div>
              <p className="text-xs font-bold leading-relaxed">{snapshot.summaryText ?? snapshot.text}</p>
              <p className="mt-2 text-[10px] font-bold leading-relaxed opacity-60">
                현재 읽는 기준을 다시 확인할 때만 참고하는 최근 점검 근거입니다. 아래 시각과 칩은 그때 함께 남은 참고 값입니다.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-white/20 pt-2">
                <p className="text-[10px] font-bold opacity-50 tabular-nums">{formatDateTime(snapshot.fetchedAt)}</p>
                {snapshot.details && snapshot.details.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {snapshot.details.map((detail) => (
                      <span
                        key={`${detail.label}:${detail.value}`}
                        className="rounded bg-white/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                      >
                        {detail.label} {detail.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {canPing ? (
            <details className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-400">
                개발용 연결 조건과 내부 메모만 보기
              </summary>
              <div className="mt-4 space-y-4">
                <p className="text-xs font-bold leading-relaxed text-slate-500">
                  아래 정보는 사용자용 현재 상태가 아니라 개발 환경에서만 쓰는 연결 조건과 내부 메모입니다.
                </p>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">내부 식별자</p>
                  <p className="text-xs font-bold text-slate-700">{source.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">개발용 연결 조건</p>
                  <div className="flex flex-wrap gap-1.5">
                    {source.env.map((entry) => (
                      <span key={entry.key} className="rounded-md bg-white border border-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                        {entry.key}{entry.optional ? "(선택)" : ""}
                      </span>
                    ))}
                  </div>
                  {autoEndpointHint ? (
                    <p className="pt-2 text-xs font-bold text-slate-500 font-mono break-all">{autoEndpointHint}</p>
                  ) : null}
                </div>
                {source.status.message ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">운영 메모</p>
                    <p className="text-xs font-bold text-amber-700 leading-relaxed">{source.status.message}</p>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      {canPing && pingSource ? (
        <div className="bg-slate-50 border-t border-slate-100 p-4">
          <p className="mb-2 text-[10px] font-bold leading-relaxed text-slate-400">
            위 카드는 최근 점검 결과이고, 새 점검은 아래 개발 환경 버튼에서만 실행합니다.
          </p>
          <div className="flex justify-end">
            <DataSourcePingButton source={pingSource} onResult={handlePingResult} showInlineState={false} />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
