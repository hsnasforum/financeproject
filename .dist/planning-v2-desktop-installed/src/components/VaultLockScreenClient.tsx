"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LoadingState } from "@/components/ui/LoadingState";

type VaultStatus = {
  configured: boolean;
  unlocked: boolean;
  autoLockMinutes: number;
  failedAttempts: number;
  backoffRemainingSeconds?: number;
};

type VaultStatusPayload = {
  ok?: boolean;
  data?: VaultStatus;
  csrfToken?: string;
  error?: {
    message?: string;
  };
};

type VaultLockScreenClientProps = {
  scope: "planning" | "ops";
};

export function VaultLockScreenClient({ scope }: VaultLockScreenClientProps) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [csrf, setCsrf] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await fetch("/api/ops/security/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as VaultStatusPayload | null;
        if (!mounted) return;
        if (!response.ok || !payload?.ok || !payload.data) {
          throw new Error(payload?.error?.message ?? "vault 상태를 확인하지 못했습니다.");
        }
        setStatus(payload.data);
        setCsrf(typeof payload.csrfToken === "string" ? payload.csrfToken : "");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "vault 상태를 확인하지 못했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function unlock(path: "/api/ops/security/configure" | "/api/ops/security/unlock"): Promise<void> {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf,
          passphrase,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? "잠금 해제에 실패했습니다.");
      }
      window.location.reload();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "잠금 해제에 실패했습니다.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <LoadingState className="m-6" title="vault 상태를 확인하는 중입니다." />;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <h1 className="text-lg font-black text-slate-900">Vault 잠금 상태</h1>
        <p className="mt-2 text-sm text-slate-600">
          {scope === "planning" ? "플래닝 데이터를 열기 전에 vault 잠금 해제가 필요합니다." : "OPS 화면 접근 전에 vault 잠금 해제가 필요합니다."}
        </p>
        {error ? <p className="mt-3 text-xs font-semibold text-rose-700">{error}</p> : null}
        {status?.failedAttempts ? (
          <p className="mt-3 text-xs text-slate-600">
            실패 횟수: {status.failedAttempts}
            {status.backoffRemainingSeconds ? ` (재시도 대기 ${status.backoffRemainingSeconds}s)` : ""}
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold text-slate-700" htmlFor="vault_unlock_passphrase">암호</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            id="vault_unlock_passphrase"
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="암호 입력"
            type="password"
            value={passphrase}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {status?.configured ? (
            <Button
              disabled={working || passphrase.trim().length < 1}
              onClick={() => void unlock("/api/ops/security/unlock")}
              size="sm"
              type="button"
              variant="primary"
            >
              잠금 해제
            </Button>
          ) : (
            <Button
              disabled={working || passphrase.trim().length < 1}
              onClick={() => void unlock("/api/ops/security/configure")}
              size="sm"
              type="button"
              variant="primary"
            >
              암호 설정 후 시작
            </Button>
          )}
          <Link href="/ops/security">
            <Button size="sm" type="button" variant="outline">보안 설정 화면</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
