"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuditLogCard } from "@/components/AuditLogCard";
import { OpsDataQualityCard } from "@/components/OpsDataQualityCard";
import { DoctorSummaryCard } from "@/components/DoctorSummaryCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";

type RestorePointPayload = {
  ok?: boolean;
  data?: {
    exists?: boolean;
    createdAt?: string | null;
  };
  error?: {
    message?: string;
  };
};

type RetentionPolicyPayload = {
  ok?: boolean;
  data?: {
    version?: number;
    feedbackMaxItems?: number;
    fixHistoryMaxItems?: number;
    refreshLogMaxBytes?: number;
    refreshLogKeepTailBytes?: number;
    keepBackupRestorePoint?: boolean;
  };
  error?: {
    message?: string;
  };
};

type RecentErrorItem = {
  time?: string;
  traceId?: string;
  route?: string;
  source?: string;
  code?: string;
  message?: string;
  status?: number;
  elapsedMs?: number;
};

type RecentErrorsPayload = {
  ok?: boolean;
  data?: RecentErrorItem[];
  error?: {
    message?: string;
  };
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Date(parsed).toLocaleString("ko-KR", { hour12: false });
}

function shortText(value: string | null | undefined, max = 80): string {
  if (!value) return "-";
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function toMb(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "-";
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

type OpsHubClientProps = {
  csrf: string;
};

export function OpsHubClient({ csrf }: OpsHubClientProps) {
  const [loadingRestorePoint, setLoadingRestorePoint] = useState(true);
  const [restorePointError, setRestorePointError] = useState("");
  const [restorePoint, setRestorePoint] = useState<{ exists: boolean; createdAt: string | null }>({
    exists: false,
    createdAt: null,
  });

  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState("");
  const [policy, setPolicy] = useState<RetentionPolicyPayload["data"] | null>(null);

  const [loadingErrors, setLoadingErrors] = useState(true);
  const [errorsError, setErrorsError] = useState("");
  const [recentErrors, setRecentErrors] = useState<RecentErrorItem[]>([]);

  const loadRestorePoint = useCallback(async () => {
    setLoadingRestorePoint(true);
    setRestorePointError("");
    try {
      const response = await fetch("/api/dev/backup/restore-point", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RestorePointPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "restore point 상태를 불러오지 못했습니다.");
      }
      setRestorePoint({
        exists: payload.data.exists === true,
        createdAt: typeof payload.data.createdAt === "string" ? payload.data.createdAt : null,
      });
    } catch (error) {
      setRestorePointError(error instanceof Error ? error.message : "restore point 조회 중 오류가 발생했습니다.");
      setRestorePoint({ exists: false, createdAt: null });
    } finally {
      setLoadingRestorePoint(false);
    }
  }, []);

  const loadPolicy = useCallback(async () => {
    setLoadingPolicy(true);
    setPolicyError("");
    try {
      const response = await fetch("/api/dev/maintenance/retention", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RetentionPolicyPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(payload?.error?.message ?? "리텐션 정책을 불러오지 못했습니다.");
      }
      setPolicy(payload.data);
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : "리텐션 정책 조회 중 오류가 발생했습니다.");
      setPolicy(null);
    } finally {
      setLoadingPolicy(false);
    }
  }, []);

  const loadRecentErrors = useCallback(async () => {
    setLoadingErrors(true);
    setErrorsError("");
    try {
      const response = await fetch("/api/dev/errors/recent?limit=20", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as RecentErrorsPayload | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
        throw new Error(payload?.error?.message ?? "최근 오류를 불러오지 못했습니다.");
      }
      setRecentErrors(payload.data);
    } catch (error) {
      setErrorsError(error instanceof Error ? error.message : "최근 오류 조회 중 오류가 발생했습니다.");
      setRecentErrors([]);
    } finally {
      setLoadingErrors(false);
    }
  }, []);

  useEffect(() => {
    void loadRestorePoint();
    void loadPolicy();
    void loadRecentErrors();
  }, [loadRestorePoint, loadPolicy, loadRecentErrors]);

  return (
    <PageShell>
      <PageHeader
        title="Ops Hub"
        description="운영/복구/감사 도구를 한 곳에서 관리합니다. (Dev only)"
        action={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => {
              void loadRestorePoint();
              void loadPolicy();
              void loadRecentErrors();
            }}>
              새로고침
            </Button>
            <Link href="/ops/labels">
              <Button variant="outline" size="sm">DART 라벨링</Button>
            </Link>
            <Link href="/ops/rules">
              <Button variant="outline" size="sm">DART 룰 튜닝</Button>
            </Link>
            <Link href="/ops/assumptions">
              <Button variant="outline" size="sm">가정 스냅샷</Button>
            </Link>
            <Link href="/ops/planning">
              <Button variant="outline" size="sm">플래닝 운영</Button>
            </Link>
            <Link href="/ops/runs">
              <Button variant="outline" size="sm">Runs 운영</Button>
            </Link>
            <Link href="/ops/backup">
              <Button variant="outline" size="sm">Backup Vault</Button>
            </Link>
            <Link href="/ops/security">
              <Button variant="outline" size="sm">Vault Security</Button>
            </Link>
            <Link href="/ops/audit">
              <Button variant="outline" size="sm">Ops Audit</Button>
            </Link>
            <Link href="/ops/metrics">
              <Button variant="outline" size="sm">Ops Metrics</Button>
            </Link>
            <Link href="/ops/doctor">
              <Button variant="outline" size="sm">OPS Doctor</Button>
            </Link>
            <Link href="/ops/planning-eval">
              <Button variant="outline" size="sm">플래닝 회귀평가</Button>
            </Link>
            <Link href="/ops/planning-cache">
              <Button variant="outline" size="sm">플래닝 캐시</Button>
            </Link>
            <Link href="/ops/planning-cleanup">
              <Button variant="outline" size="sm">플래닝 정리</Button>
            </Link>
            <Link href="/ops/feedback/planning">
              <Button variant="outline" size="sm">플래닝 피드백</Button>
            </Link>
            <Link href="/ops/auto-merge">
              <Button variant="outline" size="sm">Auto Merge</Button>
            </Link>
            <Link href="/ops/auto-merge/policy">
              <Button variant="outline" size="sm">Auto Merge Policy</Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="sm">설정 홈</Button>
            </Link>
          </div>
        }
      />

      <DoctorSummaryCard />
      <OpsDataQualityCard csrf={csrf} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-black text-slate-900">Backup / Restore</h2>
          <p className="mt-2 text-sm text-slate-600">restore point 상태를 확인하고 백업/복원 도구로 이동합니다.</p>

          {loadingRestorePoint ? (
            <LoadingState className="mt-4" title="restore point 상태를 불러오는 중입니다" />
          ) : restorePointError ? (
            <ErrorState
              className="mt-4"
              message={restorePointError}
              onRetry={() => {
                void loadRestorePoint();
              }}
              retryLabel="다시 시도"
            />
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-slate-700">존재 여부: <span className="font-semibold">{restorePoint.exists ? "있음" : "없음"}</span></p>
              <p className="text-slate-700">생성 시각: <span className="font-semibold">{formatDateTime(restorePoint.createdAt)}</span></p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/ops/backup"><Button variant="outline" size="sm">Ops Backup Vault 열기</Button></Link>
            <Link href="/settings/backup"><Button variant="outline" size="sm">Backup / Restore 열기</Button></Link>
            <Link href="/settings/recovery"><Button variant="outline" size="sm">Recovery 열기</Button></Link>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-black text-slate-900">Retention / Cleanup</h2>
          <p className="mt-2 text-sm text-slate-600">현재 리텐션 정책을 확인하고 정리 도구로 이동합니다.</p>

          {loadingPolicy ? (
            <LoadingState className="mt-4" title="리텐션 정책을 불러오는 중입니다" />
          ) : policyError ? (
            <ErrorState
              className="mt-4"
              message={policyError}
              onRetry={() => {
                void loadPolicy();
              }}
              retryLabel="다시 시도"
            />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">version: <span className="font-semibold">{policy?.version ?? "-"}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">feedbackMaxItems: <span className="font-semibold">{policy?.feedbackMaxItems ?? "-"}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">fixHistoryMaxItems: <span className="font-semibold">{policy?.fixHistoryMaxItems ?? "-"}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">logMax: <span className="font-semibold">{toMb(policy?.refreshLogMaxBytes)}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">tailKeep: <span className="font-semibold">{toMb(policy?.refreshLogKeepTailBytes)}</span></div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">keepRestorePoint: <span className="font-semibold">{policy?.keepBackupRestorePoint ? "true" : "false"}</span></div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/settings/maintenance"><Button variant="outline" size="sm">Maintenance 열기</Button></Link>
          </div>
        </Card>
      </div>

      <AuditLogCard limit={30} />

      <Card className="mt-6">
        <h2 className="text-base font-black text-slate-900">Recent Errors</h2>
        <p className="mt-2 text-sm text-slate-600">최근 오류 ring-buffer를 요약합니다.</p>

        {loadingErrors ? <LoadingState className="mt-4" title="최근 오류를 불러오는 중입니다" /> : null}
        {!loadingErrors && errorsError ? (
          <ErrorState
            className="mt-4"
            message={errorsError}
            onRetry={() => {
              void loadRecentErrors();
            }}
            retryLabel="다시 시도"
          />
        ) : null}
        {!loadingErrors && !errorsError && recentErrors.length < 1 ? (
          <EmptyState
            className="mt-4"
            description="최근 오류 ring-buffer에 항목이 없습니다."
            icon="data"
            title="최근 오류가 없습니다"
          />
        ) : null}

        {!loadingErrors && !errorsError && recentErrors.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">시각</th>
                  <th className="px-3 py-2 font-semibold">코드</th>
                  <th className="px-3 py-2 font-semibold">소스/경로</th>
                  <th className="px-3 py-2 font-semibold">메시지</th>
                  <th className="px-3 py-2 font-semibold">추적</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((item, index) => (
                  <tr key={`${item.traceId ?? "trace"}-${index}`} className="border-t border-slate-200 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatDateTime(item.time)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{item.code ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{shortText(`${item.source ?? "-"} / ${item.route ?? "-"}`, 50)}</td>
                    <td className="px-3 py-2 text-slate-700">{shortText(item.message, 120)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{shortText(item.traceId, 28)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}
