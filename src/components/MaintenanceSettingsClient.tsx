"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuditLogCard } from "@/components/AuditLogCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { SubSectionHeader } from "@/components/ui/SubSectionHeader";
import { cn } from "@/lib/utils";

const DEV_UNLOCKED_SESSION_KEY = "dev_action_unlocked_v1";
const DEV_CSRF_SESSION_KEY = "dev_action_csrf_v1";

type RetentionPolicy = {
  version: number;
  feedbackMaxItems: number;
  fixHistoryMaxItems: number;
  refreshLogMaxBytes: number;
  refreshLogKeepTailBytes: number;
  keepBackupRestorePoint: boolean;
};

type UnlockState = {
  loading: boolean;
  unlocked: boolean;
  csrf: string | null;
  error: string | null;
};

type RetentionGetPayload = {
  ok?: boolean;
  data?: Partial<RetentionPolicy>;
  error?: {
    message?: string;
  };
};

type RetentionPostPayload = {
  ok?: boolean;
  data?: Partial<RetentionPolicy>;
  error?: {
    code?: string;
    message?: string;
  };
  errors?: string[];
};

type CleanupPayload = {
  ok?: boolean;
  report?: {
    summary?: {
      removed?: number;
      truncated?: number;
      kept?: number;
      skipped?: number;
      errors?: number;
    };
  };
  error?: {
    message?: string;
  };
};

const FALLBACK_POLICY: RetentionPolicy = {
  version: 1,
  feedbackMaxItems: 500,
  fixHistoryMaxItems: 200,
  refreshLogMaxBytes: 1024 * 1024,
  refreshLogKeepTailBytes: 200 * 1024,
  keepBackupRestorePoint: true,
};

function normalizeNumberInput(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

function toPolicy(input: Partial<RetentionPolicy> | undefined): RetentionPolicy {
  return {
    version: typeof input?.version === "number" ? input.version : FALLBACK_POLICY.version,
    feedbackMaxItems: typeof input?.feedbackMaxItems === "number" ? input.feedbackMaxItems : FALLBACK_POLICY.feedbackMaxItems,
    fixHistoryMaxItems: typeof input?.fixHistoryMaxItems === "number" ? input.fixHistoryMaxItems : FALLBACK_POLICY.fixHistoryMaxItems,
    refreshLogMaxBytes: typeof input?.refreshLogMaxBytes === "number" ? input.refreshLogMaxBytes : FALLBACK_POLICY.refreshLogMaxBytes,
    refreshLogKeepTailBytes: typeof input?.refreshLogKeepTailBytes === "number"
      ? input.refreshLogKeepTailBytes
      : FALLBACK_POLICY.refreshLogKeepTailBytes,
    keepBackupRestorePoint: typeof input?.keepBackupRestorePoint === "boolean"
      ? input.keepBackupRestorePoint
      : FALLBACK_POLICY.keepBackupRestorePoint,
  };
}

export function MaintenanceSettingsClient() {
  const [unlockToken, setUnlockToken] = useState("");
  const [unlock, setUnlock] = useState<UnlockState>({
    loading: false,
    unlocked: false,
    csrf: null,
    error: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cleanupSummary, setCleanupSummary] = useState("");

  const [version, setVersion] = useState(String(FALLBACK_POLICY.version));
  const [feedbackMaxItems, setFeedbackMaxItems] = useState(String(FALLBACK_POLICY.feedbackMaxItems));
  const [fixHistoryMaxItems, setFixHistoryMaxItems] = useState(String(FALLBACK_POLICY.fixHistoryMaxItems));
  const [refreshLogMaxBytes, setRefreshLogMaxBytes] = useState(String(FALLBACK_POLICY.refreshLogMaxBytes));
  const [refreshLogKeepTailBytes, setRefreshLogKeepTailBytes] = useState(String(FALLBACK_POLICY.refreshLogKeepTailBytes));
  const [keepBackupRestorePoint, setKeepBackupRestorePoint] = useState(FALLBACK_POLICY.keepBackupRestorePoint);

  const previewPolicy = useMemo<RetentionPolicy>(() => ({
    version: normalizeNumberInput(version, FALLBACK_POLICY.version),
    feedbackMaxItems: normalizeNumberInput(feedbackMaxItems, FALLBACK_POLICY.feedbackMaxItems),
    fixHistoryMaxItems: normalizeNumberInput(fixHistoryMaxItems, FALLBACK_POLICY.fixHistoryMaxItems),
    refreshLogMaxBytes: normalizeNumberInput(refreshLogMaxBytes, FALLBACK_POLICY.refreshLogMaxBytes),
    refreshLogKeepTailBytes: normalizeNumberInput(refreshLogKeepTailBytes, FALLBACK_POLICY.refreshLogKeepTailBytes),
    keepBackupRestorePoint,
  }), [
    version,
    feedbackMaxItems,
    fixHistoryMaxItems,
    refreshLogMaxBytes,
    refreshLogKeepTailBytes,
    keepBackupRestorePoint,
  ]);

  useEffect(() => {
    const unlocked = window.sessionStorage.getItem(DEV_UNLOCKED_SESSION_KEY) === "1";
    const csrf = window.sessionStorage.getItem(DEV_CSRF_SESSION_KEY);
    if (unlocked && csrf) {
      setUnlock((prev) => ({ ...prev, unlocked: true, csrf }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/dev/maintenance/retention", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as RetentionGetPayload | null;
        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "정책 조회에 실패했습니다.");
        }
        const policy = toPolicy(payload.data);
        if (!active) return;
        setVersion(String(policy.version));
        setFeedbackMaxItems(String(policy.feedbackMaxItems));
        setFixHistoryMaxItems(String(policy.fixHistoryMaxItems));
        setRefreshLogMaxBytes(String(policy.refreshLogMaxBytes));
        setRefreshLogKeepTailBytes(String(policy.refreshLogKeepTailBytes));
        setKeepBackupRestorePoint(policy.keepBackupRestorePoint);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "정책 조회 중 오류가 발생했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

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
        setNotice("Dev 잠금 해제가 완료되었습니다.");
        setError("");
        return;
      }
      setUnlock((prev) => ({
        ...prev,
        loading: false,
        error: payload?.error?.message ?? "잠금 해제에 실패했습니다.",
      }));
    } catch {
      setUnlock((prev) => ({ ...prev, loading: false, error: "잠금 해제 요청 중 오류가 발생했습니다." }));
    }
  }

  async function handleSavePolicy() {
    setNotice("");
    setError("");
    setCleanupSummary("");

    if (!unlock.unlocked || !unlock.csrf) {
      setError("정책 저장 전 Dev 잠금 해제를 완료해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/dev/maintenance/retention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf: unlock.csrf,
          policy: previewPolicy,
        }),
      });
      const payload = (await response.json().catch(() => null)) as RetentionPostPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        const detail = payload?.errors && payload.errors.length > 0
          ? ` (${payload.errors[0]})`
          : "";
        throw new Error((payload?.error?.message ?? "정책 저장에 실패했습니다.") + detail);
      }

      const saved = toPolicy(payload.data);
      setVersion(String(saved.version));
      setFeedbackMaxItems(String(saved.feedbackMaxItems));
      setFixHistoryMaxItems(String(saved.fixHistoryMaxItems));
      setRefreshLogMaxBytes(String(saved.refreshLogMaxBytes));
      setRefreshLogKeepTailBytes(String(saved.refreshLogKeepTailBytes));
      setKeepBackupRestorePoint(saved.keepBackupRestorePoint);
      setNotice("리텐션 정책을 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "정책 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunCleanupNow() {
    setNotice("");
    setError("");
    setCleanupSummary("");

    if (!unlock.unlocked || !unlock.csrf) {
      setError("정리 실행 전 Dev 잠금 해제를 완료해 주세요.");
      return;
    }

    setRunningCleanup(true);
    try {
      const response = await fetch("/api/dev/maintenance/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf: unlock.csrf }),
      });
      const payload = (await response.json().catch(() => null)) as CleanupPayload | null;
      if (!response.ok || !payload?.ok || !payload.report?.summary) {
        throw new Error(payload?.error?.message ?? "정리 실행에 실패했습니다.");
      }

      const summary = payload.report.summary;
      setCleanupSummary(
        `removed=${Number(summary.removed ?? 0)}, truncated=${Number(summary.truncated ?? 0)}, kept=${Number(summary.kept ?? 0)}, skipped=${Number(summary.skipped ?? 0)}, errors=${Number(summary.errors ?? 0)}`,
      );
      setNotice("정리 실행이 완료되었습니다.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "정리 실행 중 오류가 발생했습니다.");
    } finally {
      setRunningCleanup(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="유지 관리 (Maintenance)"
        description="임시 데이터 보관 정책을 관리하고 시스템 정리(Cleanup)를 수행합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" className="rounded-xl font-black">설정 홈으로</Button>
          </Link>
        }
      />

      <div className="space-y-8">
        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="Dev 잠금 해제" description="정책 저장 및 정리 실행을 위해 인증이 필요합니다." />
          <div className="mt-6 flex flex-col gap-3 sm:grid sm:grid-cols-[1fr_auto] sm:items-center">
            <input
              className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-5 text-sm font-bold text-slate-900 outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
              type="password"
              placeholder="인증 토큰 입력"
              value={unlockToken}
              onChange={(event) => setUnlockToken(event.target.value)}
            />
            <Button 
              type="button" 
              className="h-11 px-8 rounded-2xl font-black shadow-md" 
              onClick={handleUnlock} 
              disabled={unlock.loading}
            >
              {unlock.loading ? "인증 중..." : unlock.unlocked ? "인증 완료" : "잠금 해제"}
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2 px-1">
            <span className={cn("w-2 h-2 rounded-full", unlock.unlocked ? "bg-emerald-500" : "bg-slate-300")} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              인증 상태: {unlock.unlocked ? "UNLOCKED" : "LOCKED"}
            </span>
          </div>
          {unlock.error ? <p className="mt-3 text-xs font-black text-rose-600 bg-rose-50 p-3 rounded-xl">{unlock.error}</p> : null}
        </Card>

        <Card className="rounded-[2rem] p-8 shadow-sm border-slate-100">
          <SubSectionHeader title="리텐션 정책 (Retention Policy)" description="항목별 최대 보관 개수 및 로그 용량을 설정합니다." />
          <p className="mt-1 text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">저장 시 config/retention-policy.json이 갱신됩니다.</p>

          {loading ? (
            <div className="py-12 text-center text-xs font-bold text-slate-400 animate-pulse">정책 로딩 중...</div>
          ) : (
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Policy Version</label>
                <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 tabular-nums outline-none focus:ring-1 focus:ring-emerald-500" value={version} onChange={(event) => setVersion(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Feedback Max Items</label>
                <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 tabular-nums outline-none focus:ring-1 focus:ring-emerald-500" value={feedbackMaxItems} onChange={(event) => setFeedbackMaxItems(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Fix History Max Items</label>
                <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 tabular-nums outline-none focus:ring-1 focus:ring-emerald-500" value={fixHistoryMaxItems} onChange={(event) => setFixHistoryMaxItems(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Log Max Bytes</label>
                <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 tabular-nums outline-none focus:ring-1 focus:ring-emerald-500" value={refreshLogMaxBytes} onChange={(event) => setRefreshLogMaxBytes(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Log Keep Tail Bytes</label>
                <input className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 tabular-nums outline-none focus:ring-1 focus:ring-emerald-500" value={refreshLogKeepTailBytes} onChange={(event) => setRefreshLogKeepTailBytes(event.target.value)} />
              </div>
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={keepBackupRestorePoint}
                    onChange={(event) => setKeepBackupRestorePoint(event.target.checked)}
                  />
                  <span className="text-sm font-black text-slate-700 group-hover:text-emerald-600 transition-colors">Keep Backup Restore Point</span>
                </label>
              </div>
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-slate-50 pt-8">
            <Button type="button" className="h-12 px-10 rounded-2xl font-black shadow-md" onClick={handleSavePolicy} disabled={saving || loading}>
              {saving ? "저장 중..." : "리텐션 정책 저장"}
            </Button>
            <Button type="button" variant="outline" className="h-12 px-8 rounded-2xl font-black shadow-sm" onClick={handleRunCleanupNow} disabled={runningCleanup}>
              {runningCleanup ? "정리 수행 중..." : "지금 즉시 정리 실행"}
            </Button>
          </div>

          {(notice || error || cleanupSummary) && (
            <div className={cn(
              "mt-8 rounded-2xl p-5 text-sm font-black animate-in fade-in slide-in-from-bottom-2",
              error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
            )}>
              <p>{error || notice}</p>
              {cleanupSummary && <p className="mt-2 text-xs font-bold opacity-80 font-mono">{cleanupSummary}</p>}
            </div>
          )}

          <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Policy Preview (JSON)</p>
            <pre className="overflow-x-auto text-[10px] font-bold text-slate-500 scrollbar-none">{JSON.stringify(previewPolicy, null, 2)}</pre>
          </div>
        </Card>

        <AuditLogCard limit={50} />
      </div>
    </PageShell>
  );
}
