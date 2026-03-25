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

function userSummary(configured: boolean, exists: boolean | null) {
  if (!configured) {
    return "OpenDART API 키가 없어 회사 검색과 공시 상세는 제한된 기준으로만 읽습니다.";
  }
  if (exists === null) {
    return "공시 검색과 상세 화면의 기준을 확인하는 중입니다. 아래 최신 기준과 연결 상태를 함께 봅니다.";
  }
  if (!exists) {
    return "API 키는 준비되어 있지만 공시 검색용 인덱스가 없어 일부 회사 검색과 상세 흐름이 제한될 수 있습니다.";
  }
  return "공시 검색과 상세 화면은 현재 준비된 인덱스와 마지막 생성 기준을 바탕으로 읽습니다.";
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
          <p className="mt-1 text-sm font-bold text-slate-500">상단 상태 표시와 사용자용 요약으로 회사 검색과 공시 상세의 현재 기준을 먼저 읽고, 개발용 인덱스 정보와 점검 액션은 아래 관리 구간에서만 확인합니다.</p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <span className={cn(
            "rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
            configured ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
          )}>
            API 키 {configuredLabel(configured)}
          </span>
          <p className="text-[10px] font-bold leading-relaxed text-slate-400 sm:text-right">
            이 상태 표시는 API 키 설정 여부만 빠르게 보여 줍니다.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6">
            <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">사용자에게 먼저 보이는 기준</p>
              <p className="mb-2 text-[10px] font-bold leading-relaxed text-slate-400">
                위 상태 표시로 설정 여부를 먼저 보고, 아래 문장으로 그 상태가 회사 검색과 공시 상세에 무엇을 뜻하는지 읽습니다.
              </p>
              <p className="text-xs font-bold leading-relaxed text-slate-700">{userSummary(configured, status ? exists : null)}</p>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">지금 읽는 기준</p>
            {loading ? (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 animate-pulse">지금 읽는 기준을 확인하는 중입니다...</p>
                <p className="text-[10px] font-bold leading-relaxed text-slate-400">
                  잠시만 기다리면 아래 인덱스 준비 상태와 마지막 생성 기준을 이어서 보여 줍니다.
                </p>
              </div>
            ) : status ? (
              <>
              <p className="mb-4 text-xs font-bold leading-relaxed text-slate-700">
                아래 세 항목은 순서대로 준비 여부, 마지막 생성 시점, 반영 범위를 읽는 현재 기준입니다.
              </p>
              <dl className="grid gap-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="font-bold text-slate-500">1. 인덱스 준비 상태</dt>
                  <dd className={cn("font-black", exists ? "text-emerald-600" : "text-rose-600")}>{exists ? "준비됨" : "확인 필요"}</dd>
                </div>
                <div className="border-b border-slate-100 pb-2">
                  <div className="flex justify-between gap-3">
                    <dt className="font-bold text-slate-500">2. 마지막 생성 시점</dt>
                    <dd className="font-bold text-slate-700 tabular-nums">{formatDateTime(status.meta?.generatedAt)}</dd>
                  </div>
                  <dd className="mt-1 text-[10px] font-bold leading-relaxed text-slate-400">
                    위 시점은 현재 공시 검색과 상세 화면이 마지막으로 읽는 생성 기준입니다.
                  </dd>
                </div>
                <div>
                  <div className="flex justify-between gap-3">
                    <dt className="font-bold text-slate-500">3. 반영된 회사 수</dt>
                    <dd className="font-black text-slate-900 tabular-nums">{typeof status.meta?.count === "number" ? status.meta.count.toLocaleString() : "-"}</dd>
                  </div>
                  <dd className="mt-1 text-[10px] font-bold leading-relaxed text-slate-400">
                    위 수는 현재 공시 검색과 상세 화면에 반영된 회사 범위를 읽는 기준입니다.
                  </dd>
                </div>
              </dl>
              </>
            ) : (
              <div className="space-y-2">
                {error ? (
                  <>
                    <p className="text-xs font-bold leading-relaxed text-rose-500">지금 읽는 기준을 아직 불러오지 못했습니다.</p>
                    <p className="text-[10px] font-bold leading-relaxed text-rose-400">
                      위 요약과는 별도로, 아래 기준 확인이 잠시 실패한 상태입니다. 잠시 뒤 다시 확인해 주세요.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold leading-relaxed text-slate-500">지금 읽는 기준 정보가 아직 없습니다.</p>
                    <p className="text-[10px] font-bold leading-relaxed text-slate-400">
                      오류 안내가 아니라, 아래 기준에 보여 줄 정보가 아직 비어 있는 상태를 뜻합니다.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          
          {!exists && status?.message && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-amber-600">
                제한 상태를 한 번 더 확인해 주세요
              </p>
              <p className="text-xs font-bold text-amber-700 leading-relaxed">
                위 기준에서 본 것처럼 공시 검색용 준비 파일이 아직 없어 일부 회사 검색과 공시 상세는 제한된 상태로 읽힙니다.
              </p>
              <p className="mt-2 text-[10px] font-bold leading-relaxed text-amber-700/80">
                새로운 운영 경고가 아니라, 위 요약과 읽는 기준에서 본 제한 상태를 다시 짚는 사용자 안내입니다.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 flex-1 flex flex-col">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
              {isDev ? "필요할 때만 여는 개발용 관리" : "개발 환경 전용 연결 안내"}
            </p>
            <p className="text-xs font-medium text-slate-500 leading-relaxed mb-6">
              {isDev
                ? "개발 환경에서는 위 사용자 기준을 먼저 읽은 뒤에만, 아래에서 인덱스 재생성이나 상태 새로고침 같은 점검을 진행합니다. 비활성 이유와 실행 결과도 사용자용 현재 상태가 아니라 이 개발용 점검에 딸린 안내로만 읽습니다."
                : "일반 사용자 화면에서는 위 기준만 read-only로 확인하고, 인덱스 재생성이나 세부 점검은 개발 환경에서만 진행합니다."}
            </p>
            
            {isDev ? (
              <div className="mt-auto space-y-3">
                <p className="text-[10px] font-bold leading-relaxed text-slate-400">
                  아래 버튼은 사용자용 현재 상태 변경이 아니라 개발 환경에서만 쓰는 인덱스 점검 액션입니다. 아래 비활성 안내와 실행 결과도 이 점검에 딸린 보조 메모로만 읽습니다.
                </p>
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
                  <p className="text-[10px] font-bold text-rose-500 text-center leading-relaxed">
                    자동 생성이 지금 막힌 이유를 개발용 버튼 기준으로만 안내합니다. {status.autoBuildDisabledReason}
                  </p>
                ) : null}
              </div>
            ) : null}

            {isDev && status ? (
              <details className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-400">
                  개발용 인덱스 정보만 보기
                </summary>
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-bold leading-relaxed text-slate-500">
                    아래 정보는 사용자에게 먼저 보이는 기준이나 카드 하단 점검 결과와 다른 층위의 개발용 인덱스 추적 메모입니다.
                  </p>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">인덱스 파일 경로</p>
                    <p className="mb-1 text-[10px] font-bold leading-relaxed text-slate-400">
                      사용자용 현재 상태가 아니라 개발 환경에서 어떤 인덱스 파일을 읽었는지 추적할 때만 확인합니다.
                    </p>
                    <p className="font-mono text-[10px] text-slate-500 break-all">{status.primaryPath ?? "-"}</p>
                  </div>
                  {status.message ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">개발용 운영 메모</p>
                      <p className="mb-2 text-[10px] font-bold leading-relaxed text-amber-600/80">
                        아래 문구는 사용자용 경고나 방금 실행한 점검 결과가 아니라 현재 인덱스 상태를 운영 기준으로 확인하는 메모입니다.
                      </p>
                      <p className="text-xs font-bold text-amber-700 leading-relaxed">{status.message}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>

      {(buildNotice || buildError) && (
        <div className={cn(
          "mt-6 rounded-2xl p-4 text-xs font-black",
          buildNotice ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
        )}>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-70">개발용 인덱스 점검 결과</p>
          <p className="mt-2">{buildNotice || buildError}</p>
          <p className="mt-2 text-[10px] font-bold leading-relaxed opacity-80">
            위 안내는 사용자용 현재 상태가 아니라 방금 실행한 인덱스 점검 결과입니다.
          </p>
        </div>
      )}
    </Card>
  );
}
