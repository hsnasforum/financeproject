"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type VaultStatus = {
  configured: boolean;
  unlocked: boolean;
  autoLockMinutes: number;
  failedAttempts: number;
  backoffRemainingSeconds?: number;
  lockPolicy: {
    autoLockMinutes: number;
    maxFailedAttempts: number;
    failedWindowSeconds: number;
    backoffBaseSeconds: number;
    maxBackoffSeconds: number;
  };
  unlockedAt?: string;
};

type VaultStatusPayload = {
  ok?: boolean;
  data?: VaultStatus;
  csrfToken?: string;
  meta?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
};

const RESET_CONFIRM_PHRASE = "RESET VAULT DATA";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function OpsSecurityClient() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [csrf, setCsrf] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [oldPassphrase, setOldPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [autoLockMinutes, setAutoLockMinutes] = useState("30");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetKeepAudit, setResetKeepAudit] = useState(true);

  const statusText = useMemo(() => {
    if (!status) return "확인 중";
    if (!status.configured) return "미설정";
    if (status.unlocked) return "해제됨";
    return "잠김";
  }, [status]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ops/security/status", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "vault 상태를 불러오지 못했습니다.");
      }
      setStatus(payload.data);
      setCsrf(asString(payload.csrfToken));
      setAutoLockMinutes(String(payload.data.lockPolicy?.autoLockMinutes ?? payload.data.autoLockMinutes));
    } catch (loadError) {
      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : "vault 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function runAction(path: string, body: Record<string, unknown>): Promise<void> {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, csrf }),
      });
      const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "요청을 처리하지 못했습니다.");
      }
      setStatus(payload.data);
      setNotice("적용되었습니다.");
      if (path.includes("/unlock") || path.includes("/configure")) {
        setPassphrase("");
      }
      if (path.includes("/change-passphrase")) {
        setOldPassphrase("");
        setNewPassphrase("");
      }
      if (path.includes("/reset")) {
        setResetConfirmText("");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "요청을 처리하지 못했습니다.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Vault Security"
        description="저장 데이터 암호화 잠금 상태를 관리합니다."
        action={(
          <div className="flex items-center gap-2">
            <Link href="/ops">
              <Button size="sm" type="button" variant="outline">Ops 허브</Button>
            </Link>
            <Button disabled={loading || working} onClick={() => void loadStatus()} size="sm" type="button" variant="outline">
              새로고침
            </Button>
          </div>
        )}
      />

      {loading ? <LoadingState title="vault 상태를 확인하는 중입니다." /> : null}
      {!loading && error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            void loadStatus();
          }}
          retryLabel="다시 시도"
        />
      ) : null}

      {!loading && !error && status ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-base font-black text-slate-900">상태</h2>
            <p className="mt-2 text-sm text-slate-700">vault: <span className="font-semibold">{statusText}</span></p>
            <p className="mt-1 text-sm text-slate-700">auto-lock: <span className="font-semibold">{status.autoLockMinutes}분</span></p>
            <p className="mt-1 text-sm text-slate-700">failedAttempts: <span className="font-semibold">{status.failedAttempts}</span></p>
            <p className="mt-1 text-sm text-slate-700">backoff: <span className="font-semibold">{status.backoffRemainingSeconds ? `${status.backoffRemainingSeconds}s` : "-"}</span></p>
            <p className="mt-1 text-xs text-slate-600">
              lock policy: maxFailed={status.lockPolicy.maxFailedAttempts}, window={status.lockPolicy.failedWindowSeconds}s, base={status.lockPolicy.backoffBaseSeconds}s
            </p>
            <p className="mt-1 text-xs text-slate-600">unlockedAt: {status.unlockedAt ?? "-"}</p>
            {notice ? <p className="mt-3 text-xs font-semibold text-emerald-700">{notice}</p> : null}
          </Card>

          <Card>
            <h2 className="text-base font-black text-slate-900">{status.configured ? "잠금 제어" : "초기 설정"}</h2>
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="vault-passphrase">암호</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                id="vault-passphrase"
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="암호 입력"
                type="password"
                value={passphrase}
              />
              <label className="block text-xs font-semibold text-slate-700" htmlFor="vault-auto-lock">자동 잠금(분)</label>
              <input
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                id="vault-auto-lock"
                inputMode="numeric"
                onChange={(event) => setAutoLockMinutes(event.target.value)}
                placeholder="30"
                value={autoLockMinutes}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!status.configured ? (
                <Button
                  disabled={working || passphrase.trim().length < 1}
                  onClick={() => void runAction("/api/ops/security/configure", {
                    passphrase,
                    autoLockMinutes: Number(autoLockMinutes),
                  })}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  Vault 설정
                </Button>
              ) : (
                <>
                  <Button
                    disabled={working || passphrase.trim().length < 1 || status.unlocked}
                    onClick={() => void runAction("/api/ops/security/unlock", { passphrase })}
                    size="sm"
                    type="button"
                    variant="primary"
                  >
                    잠금 해제
                  </Button>
                  <Button
                    disabled={working || !status.unlocked}
                    onClick={() => void runAction("/api/ops/security/lock", {})}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    잠금
                  </Button>
                  <Button
                    disabled={working || Number.isNaN(Number(autoLockMinutes))}
                    onClick={() => void runAction("/api/ops/security/auto-lock", { minutes: Number(autoLockMinutes) })}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    자동 잠금 저장
                  </Button>
                </>
              )}
            </div>
          </Card>

          {status.configured ? (
            <Card>
              <h2 className="text-base font-black text-slate-900">암호 변경</h2>
              <div className="mt-3 space-y-2">
                {!status.unlocked ? (
                  <>
                    <label className="block text-xs font-semibold text-slate-700" htmlFor="vault-old-passphrase">기존 암호</label>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      id="vault-old-passphrase"
                      onChange={(event) => setOldPassphrase(event.target.value)}
                      placeholder="기존 암호"
                      type="password"
                      value={oldPassphrase}
                    />
                  </>
                ) : null}
                <label className="block text-xs font-semibold text-slate-700" htmlFor="vault-new-passphrase">새 암호</label>
                <input
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  id="vault-new-passphrase"
                  onChange={(event) => setNewPassphrase(event.target.value)}
                  placeholder="새 암호"
                  type="password"
                  value={newPassphrase}
                />
              </div>
              <div className="mt-4">
                <Button
                  disabled={working || newPassphrase.trim().length < 1 || (!status.unlocked && oldPassphrase.trim().length < 1)}
                  onClick={() => void runAction("/api/ops/security/change-passphrase", {
                    oldPassphrase,
                    newPassphrase,
                  })}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  암호 변경
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="border border-rose-200 bg-rose-50">
            <h2 className="text-base font-black text-rose-900">Vault 초기화 (데이터 전체 삭제)</h2>
            <p className="mt-2 text-sm text-rose-900">
              이 작업은 되돌릴 수 없습니다. Vault 설정, 프로필/실행 기록/가정 스냅샷/인덱스를 모두 삭제하고 vault를 잠금 상태로 초기화합니다.
            </p>
            <label className="mt-3 block text-xs font-semibold text-rose-900" htmlFor="vault-reset-confirm">
              확인 문구를 입력하세요: <span className="font-black">{RESET_CONFIRM_PHRASE}</span>
            </label>
            <input
              className="mt-1 w-full rounded-md border border-rose-300 bg-white px-3 py-2 text-sm"
              id="vault-reset-confirm"
              onChange={(event) => setResetConfirmText(event.target.value)}
              placeholder={RESET_CONFIRM_PHRASE}
              value={resetConfirmText}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-rose-900">
              <input
                checked={resetKeepAudit}
                onChange={(event) => setResetKeepAudit(event.target.checked)}
                type="checkbox"
              />
              감사 로그(.data/ops/audit)는 유지
            </label>
            <div className="mt-4">
              <Button
                disabled={working || asString(resetConfirmText) !== RESET_CONFIRM_PHRASE}
                onClick={() => void runAction("/api/ops/security/reset", {
                  confirmText: resetConfirmText,
                  keepAudit: resetKeepAudit,
                })}
                size="sm"
                type="button"
                variant="outline"
              >
                Vault 초기화 실행
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}
