"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CLIENT_STORAGE_WHITELIST } from "@/lib/backup/backupBundle";
import { DoctorSummaryCard } from "@/components/DoctorSummaryCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

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
        title="Recovery"
        description="안전 초기화와 오프라인 복구 작업을 수행합니다. (Dev only)"
        action={
          <Link href="/settings">
            <Button variant="outline" size="sm">설정 홈</Button>
          </Link>
        }
      />

      <DoctorSummaryCard />

      <Card>
        <h2 className="text-base font-black text-slate-900">Dev 잠금 해제</h2>
        <p className="mt-2 text-sm text-slate-600">위험 작업 실행 전에 잠금 해제가 필요합니다.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="password"
            placeholder="DEV_ACTION_TOKEN"
            value={unlockToken}
            onChange={(event) => setUnlockToken(event.target.value)}
            className="h-9 min-w-[220px] rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
          />
          <Button type="button" size="sm" onClick={() => void handleUnlock()} disabled={unlock.loading}>
            {unlock.loading ? "해제 중..." : "잠금 해제"}
          </Button>
          <span className="text-xs text-slate-600">
            상태: {unlock.unlocked ? "해제됨" : "잠김"}
          </span>
        </div>
        {unlock.error ? <p className="mt-2 text-xs font-semibold text-rose-700">{unlock.error}</p> : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">안전 확인 입력</h2>
        <p className="mt-2 text-sm text-slate-600">모든 위험 작업은 `RESET` 입력 후 2단계 확인이 필요합니다.</p>
        <input
          type="text"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="RESET"
          className="mt-3 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
        />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <h3 className="text-sm font-black text-slate-900">A) localStorage 초기화</h3>
          <p className="mt-2 text-xs text-slate-600">
            whitelist 키만 초기화합니다. ({CLIENT_STORAGE_WHITELIST.length}개)
          </p>
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant={armLocalReset ? "primary" : "outline"}
              onClick={() => void handleLocalReset()}
            >
              {armLocalReset ? "2차 확인: 실행" : "1차 확인: localStorage 초기화"}
            </Button>
          </div>
          {localResetResult ? (
            <p className="mt-3 text-xs text-slate-600">
              제거된 키: {localResetResult.removed.length}
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-sm font-black text-slate-900">B) 서버 tmp 초기화</h3>
          <p className="mt-2 text-xs text-slate-600">
            피드백/다트/리프레시 대상 파일을 선택 초기화합니다.
          </p>
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {(["feedback", "dart", "refresh"] as const).map((target) => (
              <label key={target} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={serverTargets[target]}
                  onChange={(event) => {
                    setServerTargets((prev) => ({ ...prev, [target]: event.target.checked }));
                  }}
                />
                {target}
              </label>
            ))}
          </div>
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant={armServerReset ? "primary" : "outline"}
              disabled={loadingServerReset}
              onClick={() => void handleServerReset()}
            >
              {loadingServerReset ? "실행 중..." : armServerReset ? "2차 확인: 실행" : "1차 확인: 서버 tmp 초기화"}
            </Button>
          </div>
          {serverResetResult ? (
            <p className="mt-3 text-xs text-slate-600">
              removed {serverResetResult.removed.length} / recreated {serverResetResult.recreated.length}
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-sm font-black text-slate-900">C) 오프라인 복구 실행</h3>
          <p className="mt-2 text-xs text-slate-600">
            `prisma db push` → `seed:debug` → `data:doctor` → `dart:watch` 순서로 실행합니다.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant={armOfflineRepair ? "primary" : "outline"}
              disabled={loadingOfflineRepair}
              onClick={() => void handleOfflineRepair()}
            >
              {loadingOfflineRepair ? "실행 중..." : armOfflineRepair ? "2차 확인: 실행" : "1차 확인: 오프라인 복구"}
            </Button>
          </div>
          {offlineRepairResult ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-700">
                결과: {offlineRepairResult.ok ? "성공" : "실패"}
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                {offlineRepairResult.steps.map((step) => (
                  <li key={`${step.name}:${step.status}`}>
                    {step.name} - {step.status} ({step.tookMs}ms)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      {notice ? <p className="mt-6 text-sm font-semibold text-emerald-700">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
    </PageShell>
  );
}
