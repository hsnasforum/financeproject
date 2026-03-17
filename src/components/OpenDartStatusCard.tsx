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

function configuredLabel(configured: boolean) {
  return configured ? "연결됨" : "설정 필요";
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
          <SubSectionHeader title="공시 데이터 연결 상태" className="mb-0" />
          <p className="mt-1 text-sm font-bold text-slate-500">회사 검색과 공시 상세 화면에 쓰는 OpenDART 기준을 확인합니다.</p>
        </div>
        <span className={cn(
          "rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
          configured ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
        )}>
          API 키 {configuredLabel(configured)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">현재 읽는 기준</p>
            {loading ? (
              <p className="text-xs font-bold text-slate-400 animate-pulse">상태를 불러오는 중...</p>
            ) : status ? (
              <dl className="grid gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">인덱스 준비</dt>
                  <dd className={cn("font-black", exists ? "text-emerald-600" : "text-rose-600")}>{exists ? "준비됨" : "확인 필요"}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">마지막 생성 기준</dt>
                  <dd className="font-bold text-slate-700 tabular-nums">{formatDateTime(status.meta?.generatedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-bold text-slate-500">회사 수</dt>
                  <dd className="font-black text-slate-900 tabular-nums">{typeof status.meta?.count === "number" ? status.meta.count.toLocaleString() : "-"}</dd>
                </div>
                {isDev ? (
                  <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                    <dt className="font-bold text-slate-500">개발용 파일 경로</dt>
                    <dd className="font-mono text-[10px] text-slate-400 break-all">{status.primaryPath ?? "-"}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-xs font-bold text-rose-500">{error || "정보 없음"}</p>
            )}
          </div>
          
          {!exists && status?.message && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                {status.message}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex-1 flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
              {isDev ? "개발용 인덱스 관리" : "연결 안내"}
            </p>
            <p className="text-xs font-medium text-slate-500 leading-relaxed mb-6">
              {isDev
                ? "개발 환경에서는 DART 회사 검색 기준 파일을 다시 만들거나 상태를 새로고침해 연결 기준을 점검할 수 있습니다."
                : "일반 사용자 화면에서는 위 기준만 read-only로 확인하고, 상세 재생성이나 점검은 개발 환경에서만 진행합니다."}
            </p>
            
            {isDev ? (
              <div className="mt-auto space-y-3">
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
                {status?.canAutoBuild === false && status.autoBuildDisabledReason ? (
                  <p className="text-[10px] font-bold text-rose-500 text-center">{status.autoBuildDisabledReason}</p>
                ) : null}
              </div>
            ) : null}
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
