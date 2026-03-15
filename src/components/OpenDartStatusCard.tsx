"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

type OpenDartStatusPayload = {
  exists?: boolean;
  primaryPath?: string;
  triedPaths?: string[];
  meta?: {
    loadedPath?: string;
    generatedAt?: string;
    count?: number;
  };
  error?: string;
  message?: string;
  canAutoBuild?: boolean;
  autoBuildDisabledReason?: string;
  buildEndpoint?: string;
};

type BuildResponse = {
  ok?: boolean;
  message?: string;
  status?: OpenDartStatusPayload;
};

function formatDateTime(value: string | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", { hour12: false });
}

export function OpenDartStatusCard({ configured }: { configured: boolean }) {
  const isDev = process.env.NODE_ENV !== "production";
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OpenDartStatusPayload | null>(null);
  const [error, setError] = useState("");
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildNotice, setBuildNotice] = useState("");
  const [buildError, setBuildError] = useState("");

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public/disclosure/corpcodes/status", { cache: "no-store" });
      const raw = (await res.json()) as OpenDartStatusPayload;
      if (!res.ok && res.status !== 409) {
        setError(raw.message ?? "상태를 불러오지 못했습니다.");
        setStatus(null);
        return;
      }
      setStatus(raw);
    } catch {
      setError("상태를 불러오지 못했습니다.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function buildIndex() {
    setBuildLoading(true);
    setBuildNotice("");
    setBuildError("");
    const endpoint = status?.buildEndpoint ?? "/api/public/disclosure/corpcodes/build";
    try {
      const res = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const raw = (await res.json()) as BuildResponse;
      if (!res.ok || raw.ok !== true) {
        setBuildError(raw.message ?? "인덱스 생성에 실패했습니다.");
        return;
      }
      setBuildNotice("인덱스 생성이 완료되었습니다.");
      setStatus(raw.status ?? null);
      await fetchStatus();
    } catch {
      setBuildError("인덱스 생성 중 오류가 발생했습니다.");
    } finally {
      setBuildLoading(false);
    }
  }

  useEffect(() => {
    void fetchStatus();
  }, []);

  const exists = status?.exists === true;

  return (
    <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <SubSectionHeader title="OpenDART 연동" className="mb-0" />
          <p className="mt-1 text-sm font-bold text-slate-500">corpCodes 인덱스 및 API 키 연동 상태를 확인합니다.</p>
        </div>
        <span className={cn(
          "rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
          configured ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
        )}>
          Key: {configured ? "CONFIGURED" : "MISSING"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">인덱스 메타데이터</p>
            {loading ? (
              <p className="text-xs font-bold text-slate-400 animate-pulse">상태를 불러오는 중...</p>
            ) : status ? (
              <dl className="grid gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">Index Exists</dt>
                  <dd className={cn("font-black", exists ? "text-emerald-600" : "text-rose-600")}>{exists ? "YES" : "NO"}</dd>
                </div>
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">Primary Path</dt>
                  <dd className="font-mono text-[10px] text-slate-400 break-all">{status.primaryPath ?? "-"}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">Generated At</dt>
                  <dd className="font-bold text-slate-700 tabular-nums">{formatDateTime(status.meta?.generatedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-bold text-slate-500">Company Count</dt>
                  <dd className="font-black text-slate-900 tabular-nums">{typeof status.meta?.count === "number" ? status.meta.count.toLocaleString() : "-"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs font-bold text-rose-500">{error || "정보 없음"}</p>
            )}
          </div>
          
          {!exists && status?.message && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                <span className="mr-2">⚠️</span>
                {status.message}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex-1 flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">인덱스 관리</p>
            <p className="text-xs font-medium text-slate-500 leading-relaxed mb-6">
              DART 기업 검색 성능 향상을 위해 1회성 로컬 인덱스 구축이 필요합니다. 환경 변수(`OPENDART_API_KEY`)가 설정되어 있어야 합니다.
            </p>
            
            <div className="mt-auto space-y-3">
              {isDev && (
                <>
                  <Button 
                    className="w-full h-11 rounded-2xl font-black shadow-md" 
                    onClick={() => void buildIndex()} 
                    disabled={buildLoading || status?.canAutoBuild === false}
                  >
                    {buildLoading ? "인덱스 구축 중..." : "인덱스 자동 생성 실행"}
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full h-11 rounded-2xl font-black" 
                    onClick={() => void fetchStatus()} 
                    disabled={loading}
                  >
                    상태 새로고침
                  </Button>
                </>
              )}
              {status?.canAutoBuild === false && status.autoBuildDisabledReason ? (
                <p className="text-[10px] font-bold text-rose-500 text-center">{status.autoBuildDisabledReason}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {(buildNotice || buildError) && (
        <div className={cn(
          "mt-6 rounded-2xl p-4 text-xs font-black",
          buildNotice ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        )}>
          {buildNotice || buildError}
        </div>
      )}
    </Card>
  );
}
