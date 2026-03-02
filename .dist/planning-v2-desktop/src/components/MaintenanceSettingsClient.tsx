"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AuditLogCard } from "@/components/AuditLogCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

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
        title="Maintenance"
        description="tmp 산출물 보관 정책을 관리하고 cleanup을 즉시 실행합니다."
        action={
          <Link href="/settings">
            <Button variant="outline" size="sm">설정 홈</Button>
          </Link>
        }
      />

      <Card>
        <h2 className="text-base font-black text-slate-900">Dev Unlock</h2>
        <p className="mt-2 text-sm text-slate-600">저장/실행(POST) 작업 전 unlock이 필요합니다.</p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-400 focus:ring"
            type="password"
            placeholder="DEV_TOKEN"
            value={unlockToken}
            onChange={(event) => setUnlockToken(event.target.value)}
          />
          <Button type="button" variant="outline" size="md" onClick={handleUnlock} disabled={unlock.loading}>
            {unlock.loading ? "해제 중..." : unlock.unlocked ? "해제됨" : "잠금 해제"}
          </Button>
        </div>
        {unlock.error ? <p className="mt-2 text-sm font-semibold text-rose-600">{unlock.error}</p> : null}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Retention Policy</h2>
        <p className="mt-2 text-sm text-slate-600">저장 시 `config/retention-policy.json`이 갱신됩니다.</p>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">정책 로딩 중...</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">version</span>
              <input className="h-11 w-full rounded-xl border border-slate-300 px-3" value={version} onChange={(event) => setVersion(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">feedbackMaxItems</span>
              <input className="h-11 w-full rounded-xl border border-slate-300 px-3" value={feedbackMaxItems} onChange={(event) => setFeedbackMaxItems(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">fixHistoryMaxItems</span>
              <input className="h-11 w-full rounded-xl border border-slate-300 px-3" value={fixHistoryMaxItems} onChange={(event) => setFixHistoryMaxItems(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">refreshLogMaxBytes</span>
              <input className="h-11 w-full rounded-xl border border-slate-300 px-3" value={refreshLogMaxBytes} onChange={(event) => setRefreshLogMaxBytes(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-semibold text-slate-700">refreshLogKeepTailBytes</span>
              <input className="h-11 w-full rounded-xl border border-slate-300 px-3" value={refreshLogKeepTailBytes} onChange={(event) => setRefreshLogKeepTailBytes(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={keepBackupRestorePoint}
                onChange={(event) => setKeepBackupRestorePoint(event.target.checked)}
              />
              keepBackupRestorePoint
            </label>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="primary" size="md" onClick={handleSavePolicy} disabled={saving || loading}>
            {saving ? "저장 중..." : "정책 저장"}
          </Button>
          <Button type="button" variant="outline" size="md" onClick={handleRunCleanupNow} disabled={runningCleanup}>
            {runningCleanup ? "정리 실행 중..." : "지금 정리 실행"}
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">미리보기</p>
          <pre className="mt-2 overflow-x-auto text-xs text-slate-700">{JSON.stringify(previewPolicy, null, 2)}</pre>
        </div>

        {cleanupSummary ? <p className="mt-3 text-sm text-slate-700">Cleanup summary: {cleanupSummary}</p> : null}
        {notice ? <p className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
      </Card>

      <AuditLogCard limit={50} />
    </PageShell>
  );
}
