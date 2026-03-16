"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CLIENT_STORAGE_WHITELIST } from "@/lib/backup/backupBundle";
import { DoctorSummaryCard } from "@/components/DoctorSummaryCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type UnlockState = {
  loading: boolean;
  unlocked: boolean;
  csrf: string | null;
  error: string | null;
};

type ResetApiPayload = {
  ok?: boolean;
  removed?: string[];
  recreated?: string[];
  error?: {
    code?: string;
    message?: string;
  };
};

type RepairStep = {
  name: string;
  status: "ok" | "failed" | "skipped";
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
};

type OfflineRepairPayload = {
  ok?: boolean;
  steps?: RepairStep[];
  error?: {
    code?: string;
    message?: string;
  };
};

export function RecoveryClient() {
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<UnlockState>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });

  const [confirmText, setConfirmText] = useState("");
  const [armLocalReset, setArmLocalReset] = useState(false);
  const [armServerReset, setArmServerReset] = useState(false);
  const [armOfflineRepair, setArmOfflineRepair] = useState(false);

  const [serverTargets, setServerTargets] = useState<Record<"feedback" | "dart" | "refresh", boolean>>({
    feedback: true,
    dart: false,
    refresh: false,
  });

  const [loadingServerReset, setLoadingServerReset] = useState(false);
  const [loadingOfflineRepair, setLoadingOfflineRepair] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [localResetResult, setLocalResetResult] = useState<{ removed: string[] } | null>(null);
  const [serverResetResult, setServerResetResult] = useState<{ removed: string[]; recreated: string[] } | null>(null);
  const [offlineRepairResult, setOfflineRepairResult] = useState<{ ok: boolean; steps: RepairStep[] } | null>(null);

  const selectedServerTargets = useMemo(
    () =>
      (Object.keys(serverTargets) as Array<"feedback" | "dart" | "refresh">)
        .filter((key) => serverTargets[key]),
    [serverTargets],
  );

  useEffect(() => {
    const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (unlocked && csrf) {
      setUnlock((prev) => ({ ...prev, unlocked: true, csrf }));
    }
  }, []);

  useEffect(() => {
    if (confirmText === "RESET") return;
    setArmLocalReset(false);
    setArmServerReset(false);
    setArmOfflineRepair(false);
  }, [confirmText]);

  async function handleUnlock() {
    const token = unlockToken.trim();
    if (!token) return;
    setUnlock((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch("/api/dev/unlock", {
        method: "POST",
        headers: { "x-dev-token": token },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; csrf?: string; error?: { message?: string } } | null;
      if (response.ok && payload?.ok && payload.csrf) {
        window.sessionStorage.setItem(DEV_UNLOCKED_SESSION_KEY, "1");
        window.sessionStorage.setItem(DEV_CSRF_SESSION_KEY, payload.csrf);
        setUnlock({ loading: false, unlocked: true, csrf: payload.csrf, error: null });
        setNotice("Dev 잠금이 해제되었습니다.");
        setError("");
        return;
      }
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: payload?.error?.message ?? "잠금 해제에 실패했습니다.",
      }));
    } catch {
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: "잠금 해제 요청 중 오류가 발생했습니다.",
      }));
    }
  }

  function ensureConfirmReady(): boolean {
    if (confirmText !== "RESET") {
      setError("확인 입력란에 RESET을 정확히 입력해 주세요.");
      setNotice("");
      return false;
    }
    return true;
  }

  function ensureDevReady(): boolean {
    if (!unlock.unlocked || !unlock.csrf) {
      setError("먼저 Dev 잠금 해제를 완료해 주세요.");
      setNotice("");
      return false;
    }
    return true;
  }

  function clearMessages() {
    setNotice("");
    setError("");
  }

  function runLocalReset() {
    const removed: string[] = [];
    for (const key of CLIENT_STORAGE_WHITELIST) {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        removed.push(key);
      }
      window.localStorage.removeItem(key);
    }
    setLocalResetResult({ removed });
    setNotice(`localStorage whitelist 키 ${removed.length}개를 초기화했습니다.`);
  }

  async function handleLocalReset() {
    clearMessages();
    setServerResetResult(null);
    setOfflineRepairResult(null);
    if (!ensureConfirmReady()) return;
    if (!armLocalReset) {
      setArmLocalReset(true);
      setNotice("1차 확인 완료. 다시 한 번 눌러 localStorage 초기화를 실행하세요.");
      return;
    }
    setArmLocalReset(false);
    runLocalReset();
  }

  async function handleServerReset() {
    clearMessages();
    setLocalResetResult(null);
    setOfflineRepairResult(null);
    if (!ensureConfirmReady()) return;
    if (!ensureDevReady()) return;
    if (selectedServerTargets.length < 1) {
      setError("초기화할 서버 tmp 대상을 1개 이상 선택해 주세요.");
      return;
    }
    if (!armServerReset) {
      setArmServerReset(true);
      setNotice("1차 확인 완료. 다시 한 번 눌러 서버 tmp 초기화를 실행하세요.");
      return;
    }

    setArmServerReset(false);
    setLoadingServerReset(true);
    try {
      const response = await fetch("/api/dev/recovery/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targets: selectedServerTargets,
          confirm: "RESET",
          csrf: unlock.csrf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ResetApiPayload | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error?.message ?? "서버 tmp 초기화에 실패했습니다.");
        return;
      }
      const removed = Array.isArray(payload.removed) ? payload.removed : [];
      const recreated = Array.isArray(payload.recreated) ? payload.recreated : [];
      setServerResetResult({ removed, recreated });
      setNotice(`서버 tmp 초기화 완료: removed ${removed.length} / recreated ${recreated.length}`);
    } catch {
      setError("서버 tmp 초기화 요청 중 오류가 발생했습니다.");
    } finally {
      setLoadingServerReset(false);
    }
  }

  async function handleOfflineRepair() {
    clearMessages();
    setLocalResetResult(null);
    setServerResetResult(null);
    if (!ensureConfirmReady()) return;
    if (!ensureDevReady()) return;
    if (!armOfflineRepair) {
      setArmOfflineRepair(true);
      setNotice("1차 확인 완료. 다시 한 번 눌러 오프라인 복구를 실행하세요.");
      return;
    }

    setArmOfflineRepair(false);
    setLoadingOfflineRepair(true);
    try {
      const response = await fetch("/api/dev/recovery/offline-repair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: "RESET",
          csrf: unlock.csrf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as OfflineRepairPayload | null;
      if (!response.ok || !payload) {
        setError(payload?.error?.message ?? "오프라인 복구 실행에 실패했습니다.");
        return;
      }
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      setOfflineRepairResult({ ok: payload.ok === true, steps });
      if (payload.ok) {
        setNotice("오프라인 복구 실행이 완료되었습니다.");
      } else {
        setError(payload.error?.message ?? "오프라인 복구 중 일부 단계가 실패했습니다.");
      }
    } catch {
      setError("오프라인 복구 요청 중 오류가 발생했습니다.");
    } finally {
      setLoadingOfflineRepair(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="시스템 복구 (Recovery)"
        description="강제 초기화, 오프라인 복구 및 데이터 정합성 수동 수정을 수행합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" className="rounded-xl font-black">설정 홈으로</Button>
          </Link>
        }
      />

      <div className="space-y-8">
        <DoctorSummaryCard />

        <div className="grid gap-8 lg:grid-cols-2">
          <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
            <SubSectionHeader title="Dev 잠금 해제" description="위험 작업(POST)을 수행하기 위해 인증 토큰을 입력하세요." />
            <div className="mt-6 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="password"
                  placeholder="DEV_ACTION_TOKEN"
                  value={unlockToken}
                  onChange={(event) => setUnlockToken(event.target.value)}
                  className="h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50/50 px-5 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
                />
                <Button 
                  type="button" 
                  className="h-11 px-8 rounded-2xl font-black shadow-md" 
                  onClick={() => void handleUnlock()} 
                  disabled={unlock.loading}
                >
                  {unlock.loading ? "인증 중..." : "잠금 해제"}
                </Button>
              </div>
              <div className="flex items-center gap-2 px-1">
                <span className={cn("w-2 h-2 rounded-full", unlock.unlocked ? "bg-emerald-500" : "bg-slate-300")} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  인증 상태: {unlock.unlocked ? "UNLOCKED" : "LOCKED"}
                </span>
              </div>
              {unlock.error ? <p className="text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">{unlock.error}</p> : null}
            </div>
          </Card>

          <Card className="rounded-[2rem] p-8 shadow-sm border-rose-100 bg-rose-50/20">
            <SubSectionHeader title="안전 확인 입력" description="모든 위험 작업은 'RESET' 입력이 필수입니다." />
            <div className="mt-6">
              <input
                type="text"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="RESET"
                className="h-12 w-full rounded-2xl border border-rose-200 bg-white px-6 text-xl font-black text-rose-700 tracking-[0.2em] shadow-sm focus:ring-1 focus:ring-rose-500 transition-all outline-none placeholder:text-rose-100 placeholder:tracking-normal"
              />
              <p className="mt-3 text-[10px] font-bold text-rose-400 leading-relaxed px-1">
                ※ 대문자로 RESET을 정확히 입력해야 아래 실행 버튼이 활성화됩니다.
              </p>
            </div>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100 flex flex-col">
            <SubSectionHeader title="A) Local 상태 초기화" description="브라우저 localStorage를 초기화합니다." />
            <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed">
              화이트리스트에 등록된 앱 설정 키 {CLIENT_STORAGE_WHITELIST.length}개를 즉시 삭제합니다.
            </p>
            
            <div className="mt-auto pt-8">
              <Button
                type="button"
                variant={armLocalReset ? "primary" : "outline"}
                className={cn("w-full h-12 rounded-2xl font-black shadow-sm transition-all", armLocalReset ? "bg-rose-600 hover:bg-rose-700 border-none shadow-rose-100" : "")}
                onClick={() => void handleLocalReset()}
              >
                {armLocalReset ? "2단계 확인: 초기화 실행" : "1단계 확인: Local 초기화"}
              </Button>
              {localResetResult ? (
                <p className="mt-3 text-[10px] font-black text-emerald-600 text-center">
                  제거된 키: {localResetResult.removed.length}개
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100 flex flex-col">
            <SubSectionHeader title="B) 서버 tmp 초기화" description="서버측 캐시 및 임시 파일을 삭제합니다." />
            <div className="mt-4 space-y-2">
              {(["feedback", "dart", "refresh"] as const).map((target) => (
                <label key={target} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 cursor-pointer hover:bg-white transition-all">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    checked={serverTargets[target]}
                    onChange={(event) => {
                      setServerTargets((prev) => ({ ...prev, [target]: event.target.checked }));
                    }}
                  />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{target}</span>
                </label>
              ))}
            </div>
            
            <div className="mt-auto pt-8">
              <Button
                type="button"
                variant={armServerReset ? "primary" : "outline"}
                disabled={loadingServerReset}
                className={cn("w-full h-12 rounded-2xl font-black shadow-sm transition-all", armServerReset ? "bg-rose-600 hover:bg-rose-700 border-none shadow-rose-100" : "")}
                onClick={() => void handleServerReset()}
              >
                {loadingServerReset ? "처리 중..." : armServerReset ? "2단계 확인: 실행" : "1단계 확인: 서버 초기화"}
              </Button>
              {serverResetResult ? (
                <p className="mt-3 text-[10px] font-black text-emerald-600 text-center">
                  Removed {serverResetResult.removed.length} / Recreated {serverResetResult.recreated.length}
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100 flex flex-col">
            <SubSectionHeader title="C) 오프라인 복구" description="데이터베이스 및 로컬 에이전트를 재구동합니다." />
            <div className="mt-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">실행 순서</p>
              <ul className="space-y-1 text-[10px] font-bold text-slate-500">
                <li>1. Prisma DB Push</li>
                <li>2. Seed Debug Data</li>
                <li>3. Data Doctor Summary</li>
                <li>4. DART Watcher</li>
              </ul>
            </div>
            
            <div className="mt-auto pt-8">
              <Button
                type="button"
                variant={armOfflineRepair ? "primary" : "outline"}
                disabled={loadingOfflineRepair}
                className={cn("w-full h-12 rounded-2xl font-black shadow-sm transition-all", armOfflineRepair ? "bg-rose-600 hover:bg-rose-700 border-none shadow-rose-100" : "")}
                onClick={() => void handleOfflineRepair()}
              >
                {loadingOfflineRepair ? "수행 중..." : armOfflineRepair ? "2단계 확인: 실행" : "1단계 확인: 복구 실행"}
              </Button>
              {offlineRepairResult ? (
                <div className="mt-3 text-[10px] font-bold text-center">
                  <span className={offlineRepairResult.ok ? "text-emerald-600" : "text-rose-600"}>
                    {offlineRepairResult.ok ? "복구 완료" : "일부 실패"}
                  </span>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        {(notice || error) && (
          <div className={cn(
            "rounded-[1.5rem] p-5 text-sm font-black animate-in fade-in slide-in-from-bottom-2",
            error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          )}>
            {error || notice}
          </div>
        )}
      </div>
    </PageShell>
  );
}
