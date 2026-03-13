"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DevUnlockShortcutMessage } from "@/components/DevUnlockShortcutLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { type DoctorIssue } from "@/lib/ops/doctor/types";
import {
  OPS_DASHBOARD_AUTO_RUN_ACTIONS,
  OPS_DASHBOARD_AUTO_RUN_INTERVALS,
  buildDefaultAutoRunPolicy,
  buildDefaultAutoRunSelection,
  gateScheduledAutoRun,
  normalizeAutoRunPolicy,
  normalizeAutoRunSelection,
  selectEnabledAutoRunActions,
  toOpsActionErrorMessage,
  type OpsDashboardAutoRunPolicy,
} from "@/lib/ops/dashboard/autoRun";
import { isOpsActionId, type OpsActionId } from "@/lib/ops/actions/types";

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
  error?: { code?: string; message?: string; fixHref?: string };
};

type OpsAuditRow = {
  eventType: string;
  at: string;
  meta?: {
    taskName?: string;
    reset?: boolean;
    before?: {
      warnConsecutiveFailures?: number;
      riskConsecutiveFailures?: number;
    };
    after?: {
      warnConsecutiveFailures?: number;
      riskConsecutiveFailures?: number;
    };
  };
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
  error?: { code?: string; message?: string; fixHref?: string };
};

type MetricsPayload = {
  ok?: boolean;
  data?: OpsMetricRow[];
  error?: { code?: string; message?: string; fixHref?: string };
};

type SchedulerEventRow = {
  ts: string;
  mode: string;
  ok: boolean;
  exitCode: number;
  startedAt: string;
  endedAt: string;
  host?: string;
  message?: string;
};

type SchedulerPayload = {
  ok?: boolean;
  data?: SchedulerEventRow[];
  meta?: {
    summary?: {
      total?: number;
      success?: number;
      failed?: number;
      latestAt?: string;
      lastSuccessAt?: string;
      lastFailedAt?: string;
      latestFailed?: boolean;
      consecutiveFailures?: number;
      level?: "OK" | "WARN" | "RISK";
      thresholds?: {
        warnConsecutiveFailures?: number;
        riskConsecutiveFailures?: number;
      };
    };
    policy?: {
      version?: number;
      warnConsecutiveFailures?: number;
      riskConsecutiveFailures?: number;
      updatedAt?: string;
    };
    policySource?: "file" | "default";
    policyValid?: boolean;
    policyErrors?: string[];
    logs?: {
      stdout?: string[];
      stderr?: string[];
    };
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type SchedulerPolicySavePayload = {
  ok?: boolean;
  data?: {
    version?: number;
    warnConsecutiveFailures?: number;
    riskConsecutiveFailures?: number;
    updatedAt?: string;
  };
  meta?: {
    source?: "file" | "default";
    valid?: boolean;
    errors?: string[];
  };
  error?: { code?: string; message?: string; fixHref?: string };
};

type ActionRunPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
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
  error?: { code?: string; message?: string; fixHref?: string };
};

type QuickAction = {
  id: OpsActionId;
  label: string;
  dangerous: boolean;
};

type AutoRunSummary = {
  ranAt: string;
  total: number;
  completed: string[];
  failedLabel?: string;
  errorMessage?: string;
};

type AutoRunSource = "manual" | "scheduled";

type AutoRunAlert = {
  at: string;
  source: AutoRunSource;
  total: number;
  completedCount: number;
  failedLabel?: string;
  message: string;
};

type ToastState = {
  type: "info" | "success" | "error";
  message: string;
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
  | {
      type: "autoRun";
      title: string;
      description: string;
      actions: QuickAction[];
      dangerous: boolean;
      confirmText?: string;
    }
  | null;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readInt(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
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

function schedulerModeText(mode: string): string {
  const normalized = mode.trim().toLowerCase();
  if (normalized === "weekly") return "주간";
  if (normalized === "regress") return "회귀";
  if (normalized === "monthly") return "월간";
  if (normalized === "prune") return "정리";
  return "기타";
}

function schedulerStatusBadgeClass(level: "OK" | "WARN" | "RISK"): string {
  if (level === "RISK") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "WARN") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function schedulerDeltaBadgeClass(delta: number): string {
  if (delta > 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (delta < 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function readSchedulerPolicyDelta(row: OpsAuditRow): {
  warnDelta?: number;
  riskDelta?: number;
  warnBefore?: number;
  warnAfter?: number;
  riskBefore?: number;
  riskAfter?: number;
} {
  const beforeWarn = readInt(row.meta?.before?.warnConsecutiveFailures);
  const beforeRisk = readInt(row.meta?.before?.riskConsecutiveFailures);
  const afterWarn = readInt(row.meta?.after?.warnConsecutiveFailures);
  const afterRisk = readInt(row.meta?.after?.riskConsecutiveFailures);
  return {
    ...(beforeWarn !== null ? { warnBefore: beforeWarn } : {}),
    ...(afterWarn !== null ? { warnAfter: afterWarn } : {}),
    ...(beforeRisk !== null ? { riskBefore: beforeRisk } : {}),
    ...(afterRisk !== null ? { riskAfter: afterRisk } : {}),
    ...(beforeWarn !== null && afterWarn !== null ? { warnDelta: afterWarn - beforeWarn } : {}),
    ...(beforeRisk !== null && afterRisk !== null ? { riskDelta: afterRisk - beforeRisk } : {}),
  };
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
  ...OPS_DASHBOARD_AUTO_RUN_ACTIONS,
];
const AUTO_RUN_STORAGE_KEY = "ops.dashboard.auto_run.last_result.v1";
const AUTO_RUN_SELECTION_STORAGE_KEY = "ops.dashboard.auto_run.selection.v1";
const AUTO_RUN_POLICY_STORAGE_KEY = "ops.dashboard.auto_run.policy.v1";
const SCHEDULER_FAILURE_NOTIFY_KEY = "ops.dashboard.scheduler.failure.last_notified.v1";

export function OpsDashboardClient({ csrf }: { csrf: string }) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [issues, setIssues] = useState<DoctorIssue[]>([]);
  const [auditRows, setAuditRows] = useState<OpsAuditRow[]>([]);
  const [schedulerPolicyHistoryRows, setSchedulerPolicyHistoryRows] = useState<OpsAuditRow[]>([]);
  const [metricRows, setMetricRows] = useState<OpsMetricRow[]>([]);
  const [schedulerRows, setSchedulerRows] = useState<SchedulerEventRow[]>([]);
  const [schedulerSummary, setSchedulerSummary] = useState<{
    total: number;
    success: number;
    failed: number;
    latestAt?: string;
    lastSuccessAt?: string;
    lastFailedAt?: string;
    latestFailed: boolean;
    consecutiveFailures: number;
    level: "OK" | "WARN" | "RISK";
    thresholds: {
      warnConsecutiveFailures: number;
      riskConsecutiveFailures: number;
    };
  } | null>(null);
  const [schedulerLogs, setSchedulerLogs] = useState<{
    stdout: string[];
    stderr: string[];
  }>({
    stdout: [],
    stderr: [],
  });
  const [schedulerPolicyMeta, setSchedulerPolicyMeta] = useState<{
    version: number;
    updatedAt?: string;
    source: "file" | "default";
    valid: boolean;
    errors: string[];
  } | null>(null);
  const [schedulerPolicyDraft, setSchedulerPolicyDraft] = useState<{
    warnConsecutiveFailures: string;
    riskConsecutiveFailures: string;
  }>({
    warnConsecutiveFailures: "1",
    riskConsecutiveFailures: "3",
  });
  const [schedulerPolicySaving, setSchedulerPolicySaving] = useState(false);
  const [schedulerPolicyError, setSchedulerPolicyError] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionRunning, setActionRunning] = useState<OpsActionId | "">("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoRunSelection, setAutoRunSelection] = useState<Record<OpsActionId, boolean>>(() => buildDefaultAutoRunSelection());
  const [autoRunPolicy, setAutoRunPolicy] = useState<OpsDashboardAutoRunPolicy>(() => buildDefaultAutoRunPolicy());
  const [autoRunSummary, setAutoRunSummary] = useState<AutoRunSummary | null>(null);
  const [autoRunAlert, setAutoRunAlert] = useState<AutoRunAlert | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const scheduledAutoRunLockRef = useRef(false);

  const hasCsrf = asString(csrf).length > 0;

  const loadDashboard = useCallback(async () => {
    if (!hasCsrf) {
      setError("Dev unlock/CSRF가 없어 OPS 대시보드를 불러올 수 없습니다.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [doctorRes, auditRes, schedulerPolicyAuditRes, metricRes, schedulerRes] = await Promise.all([
        fetch(`/api/ops/doctor?csrf=${encodeURIComponent(csrf)}`, { cache: "no-store" }),
        fetch(`/api/ops/audit?csrf=${encodeURIComponent(csrf)}&limit=12`, { cache: "no-store" }),
        fetch(`/api/ops/audit?csrf=${encodeURIComponent(csrf)}&eventType=OPS_SCHEDULER_POLICY_UPDATE&limit=6`, { cache: "no-store" }),
        fetch(`/api/ops/metrics?csrf=${encodeURIComponent(csrf)}&limit=12`, { cache: "no-store" }),
        fetch("/api/ops/scheduler?limit=6&includeLogs=1&logLines=5", { cache: "no-store" }).catch(() => null),
      ]);

      const doctor = (await doctorRes.json().catch(() => null)) as DoctorPayload | null;
      const audit = (await auditRes.json().catch(() => null)) as AuditPayload | null;
      const schedulerPolicyAudit = (await schedulerPolicyAuditRes.json().catch(() => null)) as AuditPayload | null;
      const metrics = (await metricRes.json().catch(() => null)) as MetricsPayload | null;
      const scheduler = schedulerRes
        ? (await schedulerRes.json().catch(() => null)) as SchedulerPayload | null
        : null;

      if (!doctorRes.ok || !doctor?.ok || !doctor.data) {
        throw new Error(toOpsActionErrorMessage(doctorRes.status, doctor, "doctor 결과를 불러오지 못했습니다."));
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
      setSchedulerPolicyHistoryRows(
        Array.isArray(schedulerPolicyAudit?.data)
          ? schedulerPolicyAudit.data.filter((row) => row.eventType === "OPS_SCHEDULER_POLICY_UPDATE").slice(0, 6)
          : [],
      );
      setMetricRows(Array.isArray(metrics?.data) ? metrics?.data.slice(0, 12) : []);
      if (scheduler?.ok && Array.isArray(scheduler.data)) {
        const rows = scheduler.data.slice(0, 6);
        const consecutiveFailures = Number(scheduler.meta?.summary?.consecutiveFailures ?? (
          (() => {
            let count = 0;
            for (const row of rows) {
              if (!row.ok) {
                count += 1;
                continue;
              }
              break;
            }
            return count;
          })()
        ));
        const warnThreshold = Number(scheduler.meta?.summary?.thresholds?.warnConsecutiveFailures ?? 1);
        const riskThreshold = Number(scheduler.meta?.summary?.thresholds?.riskConsecutiveFailures ?? 3);
        const level = scheduler.meta?.summary?.level ?? (
          consecutiveFailures >= riskThreshold
            ? "RISK"
            : consecutiveFailures >= warnThreshold
              ? "WARN"
              : "OK"
        );
        setSchedulerRows(rows);
        setSchedulerSummary({
          total: Number(scheduler.meta?.summary?.total ?? rows.length),
          success: Number(scheduler.meta?.summary?.success ?? rows.filter((row) => row.ok).length),
          failed: Number(scheduler.meta?.summary?.failed ?? rows.filter((row) => !row.ok).length),
          ...(typeof scheduler.meta?.summary?.lastSuccessAt === "string" ? { lastSuccessAt: scheduler.meta.summary.lastSuccessAt } : {}),
          ...(typeof scheduler.meta?.summary?.lastFailedAt === "string" ? { lastFailedAt: scheduler.meta.summary.lastFailedAt } : {}),
          latestFailed: scheduler.meta?.summary?.latestFailed === true || (rows[0] ? !rows[0].ok : false),
          consecutiveFailures,
          level,
          thresholds: {
            warnConsecutiveFailures: warnThreshold,
            riskConsecutiveFailures: riskThreshold,
          },
          ...(typeof scheduler.meta?.summary?.latestAt === "string" ? { latestAt: scheduler.meta.summary.latestAt } : {}),
        });
        setSchedulerLogs({
          stdout: Array.isArray(scheduler.meta?.logs?.stdout) ? scheduler.meta.logs.stdout.slice(0, 5).map((row) => asString(row)).filter((row) => row.length > 0) : [],
          stderr: Array.isArray(scheduler.meta?.logs?.stderr) ? scheduler.meta.logs.stderr.slice(0, 5).map((row) => asString(row)).filter((row) => row.length > 0) : [],
        });
        const policyWarnRaw = Number(scheduler.meta?.policy?.warnConsecutiveFailures);
        const policyRiskRaw = Number(scheduler.meta?.policy?.riskConsecutiveFailures);
        const policyWarn = Number.isFinite(policyWarnRaw) ? Math.max(1, Math.trunc(policyWarnRaw)) : warnThreshold;
        const policyRisk = Number.isFinite(policyRiskRaw) ? Math.max(policyWarn, Math.trunc(policyRiskRaw)) : riskThreshold;
        setSchedulerPolicyDraft({
          warnConsecutiveFailures: String(policyWarn),
          riskConsecutiveFailures: String(policyRisk),
        });
        const policySource = scheduler.meta?.policySource === "file" ? "file" : "default";
        const policyValid = scheduler.meta?.policyValid !== false;
        const policyErrors = Array.isArray(scheduler.meta?.policyErrors)
          ? scheduler.meta.policyErrors.map((row) => asString(row)).filter((row) => row.length > 0)
          : [];
        if (
          typeof scheduler.meta?.policy?.version === "number"
          || typeof scheduler.meta?.policy?.updatedAt === "string"
          || policyErrors.length > 0
        ) {
          setSchedulerPolicyMeta({
            version: Number(scheduler.meta?.policy?.version ?? 1),
            ...(typeof scheduler.meta?.policy?.updatedAt === "string" ? { updatedAt: scheduler.meta.policy.updatedAt } : {}),
            source: policySource,
            valid: policyValid,
            errors: policyErrors,
          });
        } else {
          setSchedulerPolicyMeta(null);
        }
        setSchedulerPolicyError("");
      } else {
        setSchedulerRows([]);
        setSchedulerSummary(null);
        setSchedulerLogs({ stdout: [], stderr: [] });
        setSchedulerPolicyMeta(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "OPS 대시보드 로딩 실패");
      setReport(null);
      setIssues([]);
      setAuditRows([]);
      setSchedulerPolicyHistoryRows([]);
      setMetricRows([]);
      setSchedulerRows([]);
      setSchedulerSummary(null);
      setSchedulerLogs({ stdout: [], stderr: [] });
      setSchedulerPolicyMeta(null);
    } finally {
      setLoading(false);
    }
  }, [csrf, hasCsrf]);

  const saveSchedulerPolicy = useCallback(async () => {
    if (!hasCsrf) {
      setSchedulerPolicyError("Dev unlock/CSRF가 없어 scheduler 임계치를 저장할 수 없습니다.");
      return;
    }
    const warn = Math.trunc(Number(schedulerPolicyDraft.warnConsecutiveFailures));
    const risk = Math.trunc(Number(schedulerPolicyDraft.riskConsecutiveFailures));
    if (!Number.isFinite(warn) || !Number.isFinite(risk)) {
      setSchedulerPolicyError("주의/위험 임계치는 정수로 입력해 주세요.");
      return;
    }
    if (warn < 1 || warn > 100) {
      setSchedulerPolicyError("주의 임계치는 1~100 사이여야 합니다.");
      return;
    }
    if (risk < warn || risk > 100) {
      setSchedulerPolicyError("위험 임계치는 주의 이상, 100 이하로 입력해 주세요.");
      return;
    }

    setSchedulerPolicySaving(true);
    setSchedulerPolicyError("");
    setError("");
    try {
      const response = await fetch("/api/ops/scheduler", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csrf,
          warnConsecutiveFailures: warn,
          riskConsecutiveFailures: risk,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SchedulerPolicySavePayload | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(toOpsActionErrorMessage(response.status, payload, "scheduler 임계치 저장 실패"));
      }
      setNotice(`스케줄러 임계치를 저장했습니다 (주의 ${payload.data.warnConsecutiveFailures} / 위험 ${payload.data.riskConsecutiveFailures})`);
      await loadDashboard();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "scheduler 임계치 저장 실패";
      setSchedulerPolicyError(message);
    } finally {
      setSchedulerPolicySaving(false);
    }
  }, [csrf, hasCsrf, loadDashboard, schedulerPolicyDraft.riskConsecutiveFailures, schedulerPolicyDraft.warnConsecutiveFailures]);

  const resetSchedulerPolicyToDefaults = useCallback(async () => {
    if (!hasCsrf) {
      setSchedulerPolicyError("Dev unlock/CSRF가 없어 scheduler 임계치를 초기화할 수 없습니다.");
      return;
    }
    setSchedulerPolicySaving(true);
    setSchedulerPolicyError("");
    setError("");
    try {
      const response = await fetch("/api/ops/scheduler", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csrf,
          resetToEnvDefaults: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as SchedulerPolicySavePayload | null;
      if (!response.ok || payload?.ok !== true || !payload.data) {
        throw new Error(toOpsActionErrorMessage(response.status, payload, "scheduler 임계치 초기화 실패"));
      }
      setNotice("스케줄러 임계치를 ENV 기본값으로 초기화했습니다.");
      await loadDashboard();
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : "scheduler 임계치 초기화 실패";
      setSchedulerPolicyError(message);
    } finally {
      setSchedulerPolicySaving(false);
    }
  }, [csrf, hasCsrf, loadDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && "Notification" in window) {
        setNotificationPermission(window.Notification.permission);
      }
      const raw = window.localStorage.getItem(AUTO_RUN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AutoRunSummary;
        if (
          parsed
          && typeof parsed === "object"
          && typeof parsed.ranAt === "string"
          && typeof parsed.total === "number"
          && Array.isArray(parsed.completed)
        ) {
          setAutoRunSummary(parsed);
        }
      }

      const savedSelection = window.localStorage.getItem(AUTO_RUN_SELECTION_STORAGE_KEY);
      if (savedSelection) {
        const parsedSelection = JSON.parse(savedSelection) as unknown;
        setAutoRunSelection((previous) => normalizeAutoRunSelection(parsedSelection, previous));
      }

      const savedPolicy = window.localStorage.getItem(AUTO_RUN_POLICY_STORAGE_KEY);
      if (savedPolicy) {
        const parsedPolicy = JSON.parse(savedPolicy) as unknown;
        setAutoRunPolicy((previous) => normalizeAutoRunPolicy(parsedPolicy, previous));
      }
    } catch {
      // localStorage 파싱 오류는 화면 동작에 영향 주지 않음
    }
  }, []);

  useEffect(() => {
    if (!autoRunSummary) return;
    try {
      window.localStorage.setItem(AUTO_RUN_STORAGE_KEY, JSON.stringify(autoRunSummary));
    } catch {
      // localStorage 저장 실패는 무시
    }
  }, [autoRunSummary]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_RUN_SELECTION_STORAGE_KEY, JSON.stringify(autoRunSelection));
    } catch {
      // localStorage 저장 실패는 무시
    }
  }, [autoRunSelection]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_RUN_POLICY_STORAGE_KEY, JSON.stringify(autoRunPolicy));
    } catch {
      // localStorage 저장 실패는 무시
    }
  }, [autoRunPolicy]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3200);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (notificationPermission !== "granted") return;
    if (schedulerSummary?.level !== "RISK") return;
    const latest = schedulerRows[0];
    if (!latest || latest.ok) return;
    const eventId = `${latest.ts}:${latest.mode}:${latest.exitCode}`;
    try {
      const alreadyNotified = window.localStorage.getItem(SCHEDULER_FAILURE_NOTIFY_KEY);
      if (alreadyNotified === eventId) return;
      new window.Notification("MMD Ops Scheduler 실패", {
        body: `${schedulerModeText(latest.mode)} · exit=${latest.exitCode} · ${formatDateTime(latest.ts)}`,
      });
      window.localStorage.setItem(SCHEDULER_FAILURE_NOTIFY_KEY, eventId);
    } catch {
      // 브라우저 알림 실패/저장 실패는 무시
    }
  }, [notificationPermission, schedulerRows, schedulerSummary?.level]);

  const runActionRequest = useCallback(async (
    actionId: OpsActionId,
    params?: Record<string, unknown>,
    previewToken?: string,
  ): Promise<string> => {
    if (!hasCsrf) {
      throw new Error("Dev unlock/CSRF가 없어 action을 실행할 수 없습니다.");
    }
    setActionRunning(actionId);
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
        throw new Error(
          toOpsActionErrorMessage(
            response.status,
            payload,
            payload?.message ?? "ops action 실행 실패",
          ),
        );
      }
      return payload.message ?? `${actionId} 완료`;
    } finally {
      setActionRunning("");
    }
  }, [csrf, hasCsrf]);

  const runAction = useCallback(async (actionId: OpsActionId, params?: Record<string, unknown>, previewToken?: string) => {
    if (!hasCsrf) return;
    setError("");
    setNotice("");
    try {
      const message = await runActionRequest(actionId, params, previewToken);
      setNotice(message);
      await loadDashboard();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "ops action 실행 실패");
    }
  }, [hasCsrf, loadDashboard, runActionRequest]);

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
      throw new Error(toOpsActionErrorMessage(response.status, payload, "미리보기를 불러오지 못했습니다."));
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

  const selectedAutoRunActions = useMemo(() => selectEnabledAutoRunActions(autoRunSelection), [autoRunSelection]);

  const hasDangerousAutoRunSelection = useMemo(
    () => selectedAutoRunActions.some((action) => action.dangerous),
    [selectedAutoRunActions],
  );

  const toggleAutoRunAction = useCallback((actionId: OpsActionId) => {
    setAutoRunSelection((previous) => ({
      ...previous,
      [actionId]: !previous[actionId],
    }));
  }, []);

  const openToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
  }, []);

  const emitBrowserNotification = useCallback((title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission !== "granted") return;
    try {
      new window.Notification(title, { body });
    } catch {
      // 브라우저 알림 실패는 무시
    }
  }, []);

  const requestBrowserNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        openToast({ type: "success", message: "브라우저 알림이 활성화되었습니다." });
      } else {
        openToast({ type: "info", message: "브라우저 알림 권한이 허용되지 않았습니다." });
      }
    } catch {
      openToast({ type: "error", message: "브라우저 알림 권한 요청에 실패했습니다." });
    }
  }, [openToast]);

  const executeAutoRun = useCallback(async (actionsToRun: QuickAction[], source: AutoRunSource = "manual") => {
    setAutoRunning(true);
    setError("");
    setNotice("");
    const completedLabels: string[] = [];
    const startedAt = new Date().toISOString();
    try {
      for (const action of actionsToRun) {
        const preview = await previewAction(action.id);
        const params: Record<string, unknown> = {};
        if (preview.confirmText) {
          params.confirmText = preview.confirmText;
        }
        await runActionRequest(action.id, params, preview.previewToken);
        completedLabels.push(action.label);
      }
      await loadDashboard();
      setAutoRunSummary({
        ranAt: startedAt,
        total: actionsToRun.length,
        completed: completedLabels,
      });
      setAutoRunAlert(null);
      if (source === "manual") {
        openToast({ type: "success", message: `자동 실행 완료 (${completedLabels.length}/${actionsToRun.length})` });
        setNotice(`자동 실행 완료 (${completedLabels.length}/${actionsToRun.length}): ${completedLabels.join(", ")}`);
      }
    } catch (autoError) {
      const message = autoError instanceof Error ? autoError.message : "Ops 자동 실행 실패";
      const failedAction = actionsToRun[completedLabels.length];
      setAutoRunSummary({
        ranAt: startedAt,
        total: actionsToRun.length,
        completed: completedLabels,
        ...(failedAction ? { failedLabel: failedAction.label } : {}),
        errorMessage: message,
      });
      setAutoRunAlert({
        at: startedAt,
        source,
        total: actionsToRun.length,
        completedCount: completedLabels.length,
        ...(failedAction ? { failedLabel: failedAction.label } : {}),
        message,
      });
      setError(message);
      const toastMessage = failedAction
        ? `자동 실행 실패: ${failedAction.label} · ${message}`
        : `자동 실행 실패: ${message}`;
      openToast({
        type: "error",
        message: toastMessage,
      });
      emitBrowserNotification("MMD Ops 자동 실행 실패", toastMessage);
    } finally {
      setAutoRunning(false);
    }
  }, [
    emitBrowserNotification,
    loadDashboard,
    openToast,
    previewAction,
    runActionRequest,
  ]);

  const runQuickActionsAuto = useCallback(async () => {
    if (!hasCsrf) {
      openToast({ type: "error", message: "Dev unlock/CSRF가 필요합니다." });
      return;
    }
    if (autoRunning || actionRunning.length > 0) return;
    const actionsToRun = selectedAutoRunActions;
    if (actionsToRun.length < 1) {
      openToast({ type: "info", message: "자동 실행할 액션을 최소 1개 이상 선택해 주세요." });
      return;
    }

    setConfirmInput("");
    setConfirmModal({
      type: "autoRun",
      title: hasDangerousAutoRunSelection ? "자동 실행 확인 (위험 작업 포함)" : "자동 실행 확인",
      description: `선택된 ${actionsToRun.length}개 액션을 순차 실행합니다.`,
      actions: actionsToRun,
      dangerous: hasDangerousAutoRunSelection,
    });
  }, [
    actionRunning.length,
    autoRunning,
    hasCsrf,
    hasDangerousAutoRunSelection,
    openToast,
    selectedAutoRunActions,
  ]);

  const runScheduledAutoRun = useCallback(async () => {
    const gate = gateScheduledAutoRun({
      policy: autoRunPolicy,
      hasCsrf,
      autoRunning,
      actionRunningCount: actionRunning.length,
      lockActive: scheduledAutoRunLockRef.current,
      selectedActions: selectedAutoRunActions,
      lastRanAt: autoRunSummary?.ranAt,
    });
    if (!gate.ok) return;

    scheduledAutoRunLockRef.current = true;
    try {
      await executeAutoRun(gate.actions, "scheduled");
    } finally {
      scheduledAutoRunLockRef.current = false;
    }
  }, [
    actionRunning.length,
    autoRunPolicy,
    autoRunSummary?.ranAt,
    autoRunning,
    executeAutoRun,
    hasCsrf,
    selectedAutoRunActions,
  ]);

  useEffect(() => {
    if (!autoRunPolicy.enabled) return;
    void runScheduledAutoRun();
    const timer = window.setInterval(() => {
      void runScheduledAutoRun();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoRunPolicy.enabled, runScheduledAutoRun]);

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
    if (modal.type === "autoRun") {
      await executeAutoRun(modal.actions);
      return;
    }

    const params: Record<string, unknown> = {};
    if (modal.confirmText) {
      params.confirmText = modal.confirmText;
    }
    await runAction(modal.actionId, params, modal.previewToken);
  }, [confirmInput, confirmModal, executeAutoRun, runAction]);

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
      {autoRunAlert ? (
        <Card className="mb-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black">자동 실행 오류 알림</p>
              <p className="mt-1 text-xs font-semibold">
                {formatDateTime(autoRunAlert.at)} · {autoRunAlert.source === "scheduled" ? "스케줄 실행" : "수동 실행"}
              </p>
              <p className="mt-1 text-sm">
                {autoRunAlert.failedLabel ? `${autoRunAlert.failedLabel} · ` : ""}{autoRunAlert.message}
              </p>
              <p className="mt-1 text-xs">
                완료 {autoRunAlert.completedCount}/{autoRunAlert.total}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setAutoRunAlert(null)}>닫기</Button>
          </div>
        </Card>
      ) : null}
      {toast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[60]">
          <div
            className={`pointer-events-auto min-w-[280px] max-w-[440px] rounded-xl border px-3 py-2 text-sm shadow-xl ${
              toast.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : toast.type === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : "border-slate-300 bg-slate-50 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{toast.message}</p>
              <button
                type="button"
                className="rounded-md border border-current/20 px-2 py-0.5 text-xs"
                onClick={() => setToast(null)}
                aria-label="알림 닫기"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {autoRunSummary ? (
        <Card className="mb-4 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">
              최근 자동 실행: {formatDateTime(autoRunSummary.ranAt)}
            </p>
            <span className="text-xs text-slate-600">
              완료 {autoRunSummary.completed.length}/{autoRunSummary.total}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            완료 항목: {autoRunSummary.completed.length > 0 ? autoRunSummary.completed.join(", ") : "-"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            스케줄: {autoRunPolicy.enabled ? `ON · ${autoRunPolicy.intervalMinutes}분` : "OFF"} · 위험 작업 자동 포함: {autoRunPolicy.includeDangerous ? "ON" : "OFF"}
          </p>
          {autoRunSummary.errorMessage ? (
            <p className="mt-1 text-xs font-semibold text-rose-700">
              실패: {autoRunSummary.failedLabel ?? "-"} · {autoRunSummary.errorMessage}
            </p>
          ) : null}
        </Card>
      ) : null}
      <Card className="mb-4 border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid="ops-scheduler-summary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">스케줄러 최근 실행</p>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerStatusBadgeClass(schedulerSummary?.level ?? "OK")}`}>
              {schedulerSummary?.level === "RISK" ? "위험" : schedulerSummary?.level === "WARN" ? "주의" : "정상"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <Link href="/ops/metrics?type=SCHEDULED_TASK" className="underline">
              metrics 보기
            </Link>
            <Link href="/ops/audit?eventType=SCHEDULED_TASK&taskName=OPS_SCHEDULER_HEALTH" className="underline">
              audit 보기
            </Link>
            <Link href="/ops/audit?eventType=OPS_SCHEDULER_POLICY_UPDATE" className="underline">
              임계치 변경 로그
            </Link>
          </div>
        </div>
        {schedulerRows.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-slate-600">
              성공 {schedulerSummary?.success ?? 0} · 실패 {schedulerSummary?.failed ?? 0}
              {typeof schedulerSummary?.consecutiveFailures === "number" ? ` · 연속 실패 ${schedulerSummary.consecutiveFailures}` : ""}
              {schedulerSummary?.thresholds ? ` (주의 ${schedulerSummary.thresholds.warnConsecutiveFailures} / 위험 ${schedulerSummary.thresholds.riskConsecutiveFailures})` : ""}
              {schedulerSummary?.latestAt ? ` · 마지막 ${formatDateTime(schedulerSummary.latestAt)}` : ""}
            </p>
            <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">연속 실패 임계치 설정</p>
                <p className="text-[11px] text-slate-500">
                  {schedulerPolicyMeta?.source === "file"
                    ? (schedulerPolicyMeta.updatedAt ? `정책 파일 적용 · 업데이트 ${formatDateTime(schedulerPolicyMeta.updatedAt)}` : "정책 파일 적용")
                    : schedulerPolicyMeta?.valid === false
                      ? "정책 파일 오류로 ENV 기본값 사용 중"
                      : "정책 파일 미저장(ENV 기본값 사용)"}
                </p>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                <label className="text-xs text-slate-700">
                  <span className="font-semibold">주의(WARN)</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={schedulerPolicyDraft.warnConsecutiveFailures}
                    onChange={(event) => {
                      setSchedulerPolicyDraft((previous) => ({
                        ...previous,
                        warnConsecutiveFailures: event.target.value,
                      }));
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2 text-xs"
                    disabled={schedulerPolicySaving}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  <span className="font-semibold">위험(RISK)</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={schedulerPolicyDraft.riskConsecutiveFailures}
                    onChange={(event) => {
                      setSchedulerPolicyDraft((previous) => ({
                        ...previous,
                        riskConsecutiveFailures: event.target.value,
                      }));
                    }}
                    className="mt-1 h-8 w-full rounded-md border border-slate-300 px-2 text-xs"
                    disabled={schedulerPolicySaving}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void saveSchedulerPolicy();
                    }}
                    disabled={schedulerPolicySaving || !hasCsrf}
                  >
                    {schedulerPolicySaving ? "저장 중..." : "임계치 저장"}
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSchedulerPolicyDraft({
                        warnConsecutiveFailures: String(schedulerSummary?.thresholds.warnConsecutiveFailures ?? 1),
                        riskConsecutiveFailures: String(schedulerSummary?.thresholds.riskConsecutiveFailures ?? 3),
                      });
                      setSchedulerPolicyError("");
                    }}
                    disabled={schedulerPolicySaving}
                  >
                    현재값으로 되돌리기
                  </Button>
                </div>
              </div>
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void resetSchedulerPolicyToDefaults();
                  }}
                  disabled={schedulerPolicySaving || !hasCsrf}
                >
                  ENV 기본값으로 초기화
                </Button>
              </div>
              {schedulerPolicyMeta?.valid === false && schedulerPolicyMeta.errors.length > 0 ? (
                <p className="mt-2 text-xs font-semibold text-amber-700">
                  정책 파일 오류: {schedulerPolicyMeta.errors.join(", ")}
                </p>
              ) : null}
              {schedulerPolicyError ? (
                <DevUnlockShortcutMessage
                  className="mt-2 text-xs font-semibold text-rose-700"
                  linkClassName="text-rose-700"
                  message={schedulerPolicyError}
                />
              ) : null}
            </div>
            {schedulerPolicyHistoryRows.length > 0 ? (
              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2.5">
                <p className="text-xs font-semibold text-slate-700">최근 임계치 변경 히스토리</p>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {schedulerPolicyHistoryRows.map((row, index) => {
                    const diff = readSchedulerPolicyDelta(row);
                    return (
                      <li
                        key={`${row.eventType}:${row.at}:${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-800">{row.meta?.reset ? "초기화" : "변경"}</span>
                          {typeof diff.warnDelta === "number" ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.warnDelta)}`}>
                              WARN {formatDelta(diff.warnDelta)}
                            </span>
                          ) : null}
                          {typeof diff.riskDelta === "number" ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${schedulerDeltaBadgeClass(diff.riskDelta)}`}>
                              RISK {formatDelta(diff.riskDelta)}
                            </span>
                          ) : null}
                          {typeof diff.warnBefore === "number" && typeof diff.warnAfter === "number" && typeof diff.riskBefore === "number" && typeof diff.riskAfter === "number" ? (
                            <span className="text-slate-500">
                              ({diff.warnBefore}/{diff.riskBefore} → {diff.warnAfter}/{diff.riskAfter})
                            </span>
                          ) : null}
                        </div>
                        <span className="text-slate-500">{formatDateTime(row.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <p className="mt-1 text-xs text-slate-600">
              마지막 성공 {schedulerSummary?.lastSuccessAt ? formatDateTime(schedulerSummary.lastSuccessAt) : "-"} · 마지막 실패 {schedulerSummary?.lastFailedAt ? formatDateTime(schedulerSummary.lastFailedAt) : "-"}
            </p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {schedulerRows.map((row, index) => (
                <li
                  key={`${row.ts}:${row.mode}:${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${row.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                      {row.ok ? "SUCCESS" : "FAILED"}
                    </span>
                    <span className="font-semibold text-slate-800">{schedulerModeText(row.mode)}</span>
                    <span className="text-slate-500">exit={row.exitCode}</span>
                  </div>
                  <span className="text-slate-500">{formatDateTime(row.ts)}</span>
                </li>
              ))}
            </ul>
            {(schedulerLogs.stdout.length > 0 || schedulerLogs.stderr.length > 0) ? (
              <details className="mt-3 rounded-md border border-slate-200 bg-white p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">scheduler 로그 미리보기</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600">stdout</p>
                    <pre className="mt-1 max-h-36 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                      {schedulerLogs.stdout.length > 0 ? schedulerLogs.stdout.join("\n") : "-"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600">stderr</p>
                    <pre className="mt-1 max-h-36 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                      {schedulerLogs.stderr.length > 0 ? schedulerLogs.stderr.join("\n") : "-"}
                    </pre>
                  </div>
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-xs text-slate-600">표시할 스케줄러 실행 로그가 없습니다.</p>
        )}
      </Card>

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
              const fixActionId = isOpsActionId(issue.fix?.actionId) ? issue.fix.actionId : undefined;
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
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-700">자동 실행 대상 선택</p>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  autoRunPolicy.enabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-600"
                }`}>
                  {autoRunPolicy.enabled ? "스케줄 ON" : "스케줄 OFF"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAutoRunSelection(buildDefaultAutoRunSelection());
                    setAutoRunPolicy(buildDefaultAutoRunPolicy());
                  }}
                  disabled={autoRunning || actionRunning.length > 0}
                >
                  안전 기본값 복원
                </Button>
              </div>
            </div>
            <div className="mt-2 grid gap-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-2">
                <span className="font-semibold">주기 자동 실행</span>
                <input
                  type="checkbox"
                  checked={autoRunPolicy.enabled}
                  disabled={!hasCsrf || autoRunning}
                  onChange={(event) => {
                    setAutoRunPolicy((previous) => ({ ...previous, enabled: event.target.checked }));
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="font-semibold">주기</span>
                <select
                  value={String(autoRunPolicy.intervalMinutes)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  onChange={(event) => {
                    const parsed = Math.trunc(Number(event.target.value));
                    if (!OPS_DASHBOARD_AUTO_RUN_INTERVALS.includes(parsed as (typeof OPS_DASHBOARD_AUTO_RUN_INTERVALS)[number])) return;
                    setAutoRunPolicy((previous) => ({ ...previous, intervalMinutes: parsed as OpsDashboardAutoRunPolicy["intervalMinutes"] }));
                  }}
                  disabled={autoRunning}
                >
                  {OPS_DASHBOARD_AUTO_RUN_INTERVALS.map((minutes) => (
                    <option key={`auto-run-interval-${minutes}`} value={minutes}>
                      {minutes}분
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="font-semibold">위험 작업 포함</span>
                <input
                  type="checkbox"
                  checked={autoRunPolicy.includeDangerous}
                  disabled={autoRunning}
                  onChange={(event) => {
                    setAutoRunPolicy((previous) => ({ ...previous, includeDangerous: event.target.checked }));
                  }}
                />
              </label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {QUICK_ACTIONS.map((action) => (
                <label
                  key={`auto-select-${action.id}`}
                  className="flex cursor-pointer items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <span className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={Boolean(autoRunSelection[action.id])}
                      disabled={autoRunning || actionRunning.length > 0}
                      onChange={() => toggleAutoRunAction(action.id)}
                    />
                    {action.label}
                  </span>
                  {action.dangerous ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      위험
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <p>기본값은 안전 작업만 선택됩니다.</p>
              <div className="flex items-center gap-2">
                <span>
                  브라우저 알림: {notificationPermission === "granted" ? "허용" : notificationPermission === "denied" ? "차단" : notificationPermission === "default" ? "미결정" : "미지원"}
                </span>
                {notificationPermission !== "unsupported" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { void requestBrowserNotificationPermission(); }}>
                    알림 권한 요청
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant="outline"
                disabled={actionRunning.length > 0 || autoRunning || !hasCsrf}
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
              variant="primary"
              disabled={autoRunning || actionRunning.length > 0 || !hasCsrf || selectedAutoRunActions.length < 1}
              onClick={() => {
                void runQuickActionsAuto();
              }}
            >
              {autoRunning ? "자동 실행 중..." : `선택 항목 자동 실행 (${selectedAutoRunActions.length})`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openDangerousLinkConfirm("/ops/security", "Vault reset 페이지 이동 확인", "OPEN OPS_SECURITY")}
              disabled={autoRunning}
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
            {confirmModal.type === "autoRun" ? (
              <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  실행 대상: {confirmModal.actions.length}개
                </p>
                <ul className="mt-1 space-y-1">
                  {confirmModal.actions.map((item) => (
                    <li key={`auto-run-confirm-${item.id}`} className="flex items-center justify-between gap-2">
                      <span>{item.label}</span>
                      {item.dangerous ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          위험
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {confirmModal.dangerous ? (
                  <p className="mt-2 font-semibold text-amber-700">
                    위험 작업이 포함되어 있습니다. 실행 전 대상 항목을 다시 확인해 주세요.
                  </p>
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
                {confirmModal.type === "autoRun" ? "자동 실행 시작" : "계속 진행"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </PageShell>
  );
}
