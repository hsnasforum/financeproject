"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { resolveClientApiError } from "@/lib/http/clientApiError";

type DoctorCheck = {
  id: string;
  title: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  fixHref?: string;
  details?: Record<string, unknown>;
};

type DoctorReport = {
  ok: boolean;
  generatedAt: string;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

type DoctorPayload = {
  ok?: boolean;
  data?: DoctorReport;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
  meta?: {
    migration?: {
      result?: string;
      summary?: {
        pending?: number;
        deferred?: number;
        failed?: number;
      };
    };
    recovery?: {
      scanned?: number;
      recoveredCommit?: number;
      recoveredRollback?: number;
      notes?: string[];
    };
  };
};

type OpsDoctorClientProps = {
  csrf: string;
  state?: string;
};

type DoctorRecoverySummary = {
  scanned?: number;
  recoveredCommit?: number;
  recoveredRollback?: number;
  notes?: string[];
} | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function statusTone(status: DoctorCheck["status"]): string {
  if (status === "PASS") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "WARN") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

export function OpsDoctorClient({ csrf, state }: OpsDoctorClientProps) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [recovery, setRecovery] = useState<DoctorRecoverySummary>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionRunning, setActionRunning] = useState<"" | "REPAIR_INDEX" | "CLEANUP_ORPHAN_BLOBS" | "RUN_MIGRATIONS">("");

  const hasCsrf = asString(csrf).length > 0;

  const loadDoctor = useCallback(async () => {
    if (!hasCsrf) {
      setError("Dev unlock/CSRF가 없어 doctor 실행이 차단됩니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("csrf", csrf);
      const response = await fetch(`/api/ops/doctor?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DoctorPayload | null;
      if (!response.ok || !payload?.ok || !payload.data) {
        const apiError = resolveClientApiError(payload, "doctor 실행에 실패했습니다.");
        throw new Error(apiError.message);
      }
      setReport(payload.data);
      setRecovery(payload.meta?.recovery ?? null);
    } catch (doctorError) {
      setError(doctorError instanceof Error ? doctorError.message : "doctor 실행에 실패했습니다.");
      setReport(null);
      setRecovery(null);
    } finally {
      setLoading(false);
    }
  }, [csrf, hasCsrf]);

  const runAction = useCallback(async (action: "REPAIR_INDEX" | "CLEANUP_ORPHAN_BLOBS" | "RUN_MIGRATIONS") => {
    if (!hasCsrf) return;
    setActionRunning(action);
    setError("");
    try {
      const response = await fetch("/api/ops/doctor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csrf,
          action,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: { message?: string } } | null;
      if (!response.ok || !payload?.ok) {
        const apiError = resolveClientApiError(payload, "doctor action 실행에 실패했습니다.");
        throw new Error(apiError.message);
      }
      await loadDoctor();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "doctor action 실행에 실패했습니다.");
    } finally {
      setActionRunning("");
    }
  }, [csrf, hasCsrf, loadDoctor]);

  const exportSupportBundle = useCallback(async () => {
    if (!hasCsrf) {
      setError("CSRF 토큰이 없어 진단 번들을 내보낼 수 없습니다.");
      return;
    }
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ops/support/export.zip?csrf=${encodeURIComponent(csrf)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "진단 번들 생성에 실패했습니다.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = /filename="?([^\";]+)"?/i.exec(disposition);
      const fileName = (match?.[1] ?? "planning-support-bundle.zip").trim();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setNotice(`진단 번들을 다운로드했습니다. (${fileName})`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "진단 번들 생성에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }, [csrf, hasCsrf]);

  useEffect(() => {
    void loadDoctor();
  }, [loadDoctor]);

  return (
    <PageShell>
      <PageHeader
        title="Ops Doctor"
        description="핵심 운영 체크를 PASS/FAIL로 빠르게 점검"
        action={(
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void loadDoctor()} disabled={loading || !hasCsrf}>
              {loading ? "실행 중..." : "재실행"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runAction("REPAIR_INDEX")}
              disabled={!hasCsrf || loading || actionRunning.length > 0}
            >
              {actionRunning === "REPAIR_INDEX" ? "수리 중..." : "Repair index"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runAction("CLEANUP_ORPHAN_BLOBS")}
              disabled={!hasCsrf || loading || actionRunning.length > 0}
            >
              {actionRunning === "CLEANUP_ORPHAN_BLOBS" ? "정리 중..." : "Cleanup orphan blobs"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runAction("RUN_MIGRATIONS")}
              disabled={!hasCsrf || loading || actionRunning.length > 0}
            >
              {actionRunning === "RUN_MIGRATIONS" ? "실행 중..." : "Run migrations"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void exportSupportBundle()}
              disabled={!hasCsrf || loading || exporting}
            >
              {exporting ? "내보내는 중..." : "진단 번들 내보내기"}
            </Button>
            <Link href="/ops/support">
              <Button type="button" size="sm" variant="outline">Support 페이지</Button>
            </Link>
            <Link href="/ops">
              <Button type="button" size="sm" variant="outline">Ops 허브</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? (
        <Card className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dev unlock/CSRF가 없어 doctor를 실행할 수 없습니다.
        </Card>
      ) : null}
      {state === "MIGRATION_REQUIRED" ? (
        <Card className="mb-4 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          MIGRATION_REQUIRED: 마이그레이션 선행 점검이 필요합니다. 아래 결과를 확인하고 필요한 조치를 진행하세요.
        </Card>
      ) : null}
      {notice ? (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {notice}
        </Card>
      ) : null}

      {loading && !report ? (
        <LoadingState className="mb-4" title="ops doctor를 실행하는 중입니다" />
      ) : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={() => void loadDoctor()} retryLabel="다시 실행" /> : null}
      {!loading && !error && !report ? (
        <EmptyState
          actionLabel="다시 실행"
          className="mb-4"
          description="점검 리포트를 아직 불러오지 못했습니다."
          icon="data"
          onAction={() => void loadDoctor()}
          title="doctor 결과가 없습니다"
        />
      ) : null}

      {report ? (
        <Card className="mb-4 p-4">
          <h2 className="text-base font-black text-slate-900">요약</h2>
          <p className="mt-2 text-sm text-slate-700">
            generatedAt: <span className="font-semibold">{formatDateTime(report.generatedAt)}</span>
          </p>
          {recovery ? (
            <p className="mt-1 text-xs text-slate-600">
              recovery: scanned {Number(recovery.scanned ?? 0)}, recovered commit {Number(recovery.recoveredCommit ?? 0)}, rollback {Number(recovery.recoveredRollback ?? 0)}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-4 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">전체 판정: <span className="font-semibold">{report.ok ? "PASS" : "FAIL"}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">PASS: <span className="font-semibold">{report.summary.pass}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">WARN: <span className="font-semibold">{report.summary.warn}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">FAIL: <span className="font-semibold">{report.summary.fail}</span></div>
          </div>
        </Card>
      ) : null}

      <div className="space-y-3">
        {report?.checks.map((check) => (
          <Card className={`p-4 border ${statusTone(check.status)}`} key={check.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black">{check.title}</h3>
              <span className="text-xs font-bold">{check.status}</span>
            </div>
            <p className="mt-2 text-sm">{check.message}</p>
            {check.fixHref ? (
              <p className="mt-2 text-xs">
                <Link className="font-semibold underline" href={check.fixHref}>{check.fixHref}</Link>
              </p>
            ) : null}
            {check.details ? (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer">details</summary>
                <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">{JSON.stringify(check.details, null, 2)}</pre>
              </details>
            ) : null}
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
