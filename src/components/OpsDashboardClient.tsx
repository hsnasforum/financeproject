"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { type DoctorIssue } from "@/lib/ops/doctor/types";
import { type OpsActionId } from "@/lib/ops/actions/types";

type DoctorReport = {
  generatedAt: string;
  status: "OK" | "WARN" | "RISK";
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

type DoctorPayload = {
  ok?: boolean;
  data?: {
    generatedAt?: string;
    summary?: {
      pass?: number;
      warn?: number;
      fail?: number;
    };
    status?: string;
    issues?: DoctorIssue[];
  };
  issues?: DoctorIssue[]; // backward compatibility
  error?: { message?: string };
};

type OpsAuditRow = {
  eventType: string;
  at: string;
};

type OpsMetricRow = {
  type: string;
  at: string;
  meta?: {
    status?: string;
  };
};

type AuditPayload = {
  ok?: boolean;
  data?: OpsAuditRow[];
  error?: { message?: string };
};

type MetricsPayload = {
  ok?: boolean;
  data?: OpsMetricRow[];
  error?: { message?: string };
};

type ActionRunPayload = {
  ok?: boolean;
  message?: string;
  error?: { message?: string };
};

type ActionPreviewData = {
  actionId: OpsActionId;
  title: string;
  requirePreview: boolean;
  dangerous: boolean;
  confirmText?: string;
  previewToken?: string;
  summary?: {
    text?: string;
    counts?: Record<string, number>;
    sampleIds?: string[];
    ids?: string[];
    truncated?: boolean;
  };
};

type ActionPreviewPayload = {
  ok?: boolean;
  data?: ActionPreviewData;
  error?: { message?: string };
};

type QuickAction = {
  id: OpsActionId;
  label: string;
};

type ConfirmModalState =
  | {
      type: "action";
      title: string;
      description: string;
      actionId: OpsActionId;
      previewToken?: string;
      confirmText?: string;
      summary?: ActionPreviewData["summary"];
    }
  | {
      type: "link";
      title: string;
      description: string;
      href: string;
      confirmText?: string;
    }
  | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

function statusBadgeClass(ok: boolean, warnCount: number): string {
  if (!ok) return "border-rose-200 bg-rose-50 text-rose-700";
  if (warnCount > 0) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function issueBadgeClass(severity: DoctorIssue["severity"]): string {
  if (severity === "risk") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function severityText(severity: DoctorIssue["severity"]): string {
  if (severity === "risk") return "RISK";
  if (severity === "warn") return "WARN";
  return "INFO";
}

function toSafeDomId(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized || "unknown";
}

function normalizeDoctorStatus(raw: string, fail: number, warn: number): "OK" | "WARN" | "RISK" {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "RISK") return "RISK";
  if (normalized === "WARN") return "WARN";
  if (normalized === "OK") return "OK";
  if (fail > 0) return "RISK";
  if (warn > 0) return "WARN";
  return "OK";
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "ASSUMPTIONS_REFRESH", label: "가정 새로고침" },
  { id: "REPAIR_INDEX", label: "인덱스 수리" },
  { id: "RUN_MIGRATIONS", label: "마이그레이션 실행" },
  { id: "RUNS_CLEANUP", label: "실행 기록 정리" },
];

export function OpsDashboardClient({ csrf }: { csrf: string }) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [issues, setIssues] = useState<DoctorIssue[]>([]);
  const [auditRows, setAuditRows] = useState<OpsAuditRow[]>([]);
  const [metricRows, setMetricRows] = useState<OpsMetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionRunning, setActionRunning] = useState<OpsActionId | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [confirmInput, setConfirmInput] = useState("");

  const hasCsrf = asString(csrf).length > 0;

  const loadDashboard = useCallback(async () => {
    if (!hasCsrf) {
      setError("Dev unlock/CSRF가 없어 OPS 대시보드를 불러올 수 없습니다.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [doctorRes, auditRes, metricRes] = await Promise.all([
        fetch(`/api/ops/doctor?csrf=${encodeURIComponent(csrf)}`, { cache: "no-store" }),
        fetch(`/api/ops/audit?csrf=${encodeURIComponent(csrf)}&limit=12`, { cache: "no-store" }),
        fetch(`/api/ops/metrics?csrf=${encodeURIComponent(csrf)}&limit=12`, { cache: "no-store" }),
      ]);

      const doctor = (await doctorRes.json().catch(() => null)) as DoctorPayload | null;
      const audit = (await auditRes.json().catch(() => null)) as AuditPayload | null;
      const metrics = (await metricRes.json().catch(() => null)) as MetricsPayload | null;

      if (!doctorRes.ok || !doctor?.ok || !doctor.data) {
        throw new Error(doctor?.error?.message ?? "doctor 결과를 불러오지 못했습니다.");
      }

      const reportData = doctor.data;
      const pass = Number(reportData.summary?.pass ?? 0);
      const warn = Number(reportData.summary?.warn ?? 0);
      const fail = Number(reportData.summary?.fail ?? 0);
      const status = normalizeDoctorStatus(asString(reportData.status), fail, warn);
      setReport({
        generatedAt: asString(reportData.generatedAt) || new Date().toISOString(),
        status,
        summary: {
          pass: Number.isFinite(pass) ? Math.max(0, Math.trunc(pass)) : 0,
          warn: Number.isFinite(warn) ? Math.max(0, Math.trunc(warn)) : 0,
          fail: Number.isFinite(fail) ? Math.max(0, Math.trunc(fail)) : 0,
        },
      });
      setIssues(Array.isArray(reportData.issues) ? reportData.issues : (Array.isArray(doctor.issues) ? doctor.issues : []));
      setAuditRows(Array.isArray(audit?.data) ? audit?.data.slice(0, 12) : []);
      setMetricRows(Array.isArray(metrics?.data) ? metrics?.data.slice(0, 12) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "OPS 대시보드 로딩 실패");
      setReport(null);
      setIssues([]);
      setAuditRows([]);
      setMetricRows([]);
    } finally {
      setLoading(false);
    }
  }, [csrf, hasCsrf]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const runAction = useCallback(async (actionId: OpsActionId, params?: Record<string, unknown>, previewToken?: string) => {
    if (!hasCsrf) return;
    setActionRunning(actionId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ops/actions/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csrf,
          actionId,
          params: params ?? {},
          ...(previewToken ? { previewToken } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as ActionRunPayload | null;
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? payload?.message ?? "ops action 실행 실패");
      }
      setNotice(payload.message ?? `${actionId} 완료`);
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "ops action 실행 실패");
    } finally {
      setActionRunning("");
    }
  }, [csrf, hasCsrf, loadDashboard]);

  const previewAction = useCallback(async (actionId: OpsActionId): Promise<ActionPreviewData> => {
    const response = await fetch("/api/ops/actions/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        csrf,
        actionId,
      }),
    });

    const payload = (await response.json().catch(() => null)) as ActionPreviewPayload | null;
    if (!response.ok || !payload?.ok || !payload.data) {
      throw new Error(payload?.error?.message ?? "미리보기를 불러오지 못했습니다.");
    }

    return payload.data;
  }, [csrf]);

  const openDangerousLinkConfirm = useCallback((href: string, title: string, confirmText?: string) => {
    setConfirmInput("");
    setConfirmModal({
      type: "link",
      title,
      description: "되돌릴 수 없는 작업 페이지로 이동합니다.",
      href,
      ...(confirmText ? { confirmText } : {}),
    });
  }, []);

  const startActionWithPreview = useCallback(async (actionId: OpsActionId, label: string) => {
    if (!hasCsrf || actionRunning.length > 0) return;
    setError("");
    try {
      const preview = await previewAction(actionId);
      if (preview.requirePreview || preview.dangerous) {
        setConfirmInput("");
        setConfirmModal({
          type: "action",
          title: `${preview.title || label} 실행 확인`,
          description: preview.summary?.text || "미리보기 결과를 확인한 후 실행하세요.",
          actionId,
          ...(preview.previewToken ? { previewToken: preview.previewToken } : {}),
          ...(preview.confirmText ? { confirmText: preview.confirmText } : {}),
          ...(preview.summary ? { summary: preview.summary } : {}),
        });
        return;
      }
      await runAction(actionId, {}, preview.previewToken);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "미리보기를 불러오지 못했습니다.");
    }
  }, [actionRunning.length, hasCsrf, previewAction, runAction]);

  const executeModal = useCallback(async () => {
    if (!confirmModal) return;
    const expected = asString(confirmModal.confirmText);
    if (expected && confirmInput.trim() !== expected) return;

    const modal = confirmModal;
    setConfirmModal(null);
    setConfirmInput("");

    if (modal.type === "link") {
      window.location.href = modal.href;
      return;
    }

    const params: Record<string, unknown> = {};
    if (modal.confirmText) {
      params.confirmText = modal.confirmText;
    }
    await runAction(modal.actionId, params, modal.previewToken);
  }, [confirmInput, confirmModal, runAction]);

  const summaryLabel = useMemo(() => {
    if (!report) return "UNKNOWN";
    if (report.status === "RISK") return "RISK";
    if (report.status === "WARN") return "WARN";
    return "OK";
  }, [report]);

  return (
    <PageShell>
      <div data-testid="ops-home">
      <PageHeader
        title="Ops Dashboard"
        description="Doctor SSOT 기반 운영 이슈와 즉시 조치 액션을 한 곳에서 관리합니다."
        action={(
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void loadDashboard();
              }}
              disabled={loading || !hasCsrf}
            >
              {loading ? "새로고침 중..." : "새로고침"}
            </Button>
            <Link href="/ops/about">
              <Button type="button" size="sm" variant="outline">Ops About</Button>
            </Link>
            <Link href="/ops/support">
              <Button type="button" size="sm" variant="outline">진단 번들 내보내기</Button>
            </Link>
          </div>
        )}
      />

      {!hasCsrf ? <ErrorState className="mb-4" message="Dev unlock/CSRF가 필요합니다." /> : null}
      {error ? <ErrorState className="mb-4" message={error} onRetry={() => void loadDashboard()} retryLabel="다시 시도" /> : null}
      {notice ? (
        <Card className="mb-4 border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{notice}</span>
            <Link href="/ops/audit" className="underline">/ops/audit</Link>
          </div>
        </Card>
      ) : null}

      {loading && !report ? <LoadingState className="mb-4" title="OPS 대시보드를 로딩하는 중입니다." /> : null}

      {report ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">운영 상태 요약</h2>
            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-bold ${statusBadgeClass(report.summary.fail < 1, report.summary.warn)}`} data-testid="ops-status-badge">
              {summaryLabel}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4 text-sm">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">generatedAt: <span className="font-semibold">{formatDateTime(report.generatedAt)}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">PASS: <span className="font-semibold">{report.summary.pass}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">WARN: <span className="font-semibold">{report.summary.warn}</span></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">FAIL: <span className="font-semibold">{report.summary.fail}</span></div>
          </div>
        </Card>
      ) : null}

      {issues.length < 1 && !loading ? (
        <EmptyState
          className="mb-4"
          icon="default"
          title="표시할 운영 이슈가 없습니다"
          description="doctor 결과가 없거나 모든 항목이 정상입니다."
        />
      ) : null}

      {issues.length > 0 ? (
        <Card className="mb-4 p-4" data-testid="ops-issues">
          <h2 className="text-base font-black text-slate-900">우선순위 이슈 큐</h2>
          <div className="mt-3 space-y-2">
            {issues.map((issue) => {
              const fixHref = issue.fix?.href;
              const fixActionId = issue.fix?.actionId as OpsActionId | undefined;
              const fixLabel = issue.fix?.label ?? "Fix";
              return (
                <div key={issue.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`ops-issue-${toSafeDomId(issue.id)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                    <p className="text-xs text-slate-600">{issue.id}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${issueBadgeClass(issue.severity)}`}>
                    {severityText(issue.severity)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{issue.message}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {fixHref ? (
                    <Link href={fixHref}>
                      <Button type="button" size="sm" variant="outline" data-testid={`ops-fix-${toSafeDomId(issue.id)}`}>{fixLabel}</Button>
                    </Link>
                  ) : null}
                  {fixActionId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid={`ops-fix-${toSafeDomId(issue.id)}`}
                      disabled={actionRunning.length > 0}
                      onClick={() => {
                        void startActionWithPreview(fixActionId, fixLabel);
                      }}
                    >
                      {actionRunning === fixActionId ? "실행 중..." : fixLabel}
                    </Button>
                  ) : null}
                </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-base font-black text-slate-900">원클릭 액션</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={actionRunning.length > 0 || !hasCsrf}
                onClick={() => {
                  void startActionWithPreview(action.id, action.label);
                }}
              >
                {actionRunning === action.id ? "실행 중..." : action.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openDangerousLinkConfirm("/ops/security", "Vault reset 페이지 이동 확인", "OPEN OPS_SECURITY")}
            >
              Vault reset 페이지 열기
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-base font-black text-slate-900">최근 이벤트 미리보기</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-slate-700">Audit</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {auditRows.slice(0, 6).map((row, index) => (
                  <li key={`${row.eventType}:${row.at}:${index}`}>{row.eventType} · {formatDateTime(row.at)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700">Metrics</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {metricRows.slice(0, 6).map((row, index) => (
                  <li key={`${row.type}:${row.at}:${index}`}>{row.type} · {asString(row.meta?.status) || "-"}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {confirmModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ops-danger-title"
          data-testid="ops-preview-modal"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 id="ops-danger-title" className="text-base font-black text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-sm text-slate-700">{confirmModal.description}</p>
            {confirmModal.type === "action" && confirmModal.summary ? (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {confirmModal.summary.counts ? (
                  <p>
                    {Object.entries(confirmModal.summary.counts).map(([key, value]) => `${key}=${value}`).join(", ")}
                  </p>
                ) : null}
                {Array.isArray(confirmModal.summary.ids) && confirmModal.summary.ids.length > 0 ? (
                  <p className="mt-1">ids: {confirmModal.summary.ids.join(", ")}{confirmModal.summary.truncated ? " ..." : ""}</p>
                ) : null}
                {!Array.isArray(confirmModal.summary.ids) && Array.isArray((confirmModal.summary as { sampleIds?: string[] }).sampleIds) && (confirmModal.summary as { sampleIds?: string[] }).sampleIds!.length > 0 ? (
                  <p className="mt-1">ids: {(confirmModal.summary as { sampleIds?: string[] }).sampleIds!.join(", ")}{confirmModal.summary.truncated ? " ..." : ""}</p>
                ) : null}
              </div>
            ) : null}
            {confirmModal.confirmText ? (
              <>
                <p className="mt-3 text-xs font-semibold text-slate-800">확인 문구: <span className="font-black">{confirmModal.confirmText}</span></p>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={confirmInput}
                  onChange={(event) => setConfirmInput(event.target.value)}
                  placeholder={confirmModal.confirmText}
                />
              </>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmModal(null)} data-testid="ops-preview-cancel">취소</Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                data-testid="ops-preview-confirm"
                onClick={() => {
                  void executeModal();
                }}
                disabled={Boolean(confirmModal.confirmText) && confirmInput.trim() !== asString(confirmModal.confirmText)}
              >
                계속 진행
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </PageShell>
  );
}
