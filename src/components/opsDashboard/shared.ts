import { type DoctorIssue } from "@/lib/ops/doctor/types";
import {
  OPS_DASHBOARD_AUTO_RUN_ACTIONS,
  type OpsDashboardAutoRunPolicy,
} from "@/lib/ops/dashboard/autoRun";
import { isOpsActionId, type OpsActionId } from "@/lib/ops/actions/types";

export type DoctorReport = {
  generatedAt: string;
  status: "OK" | "WARN" | "RISK";
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

export type DoctorPayload = {
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
  issues?: DoctorIssue[];
  error?: { code?: string; message?: string; fixHref?: string };
};

export type OpsAuditRow = {
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

export type OpsMetricRow = {
  type: string;
  at: string;
  meta?: {
    status?: string;
  };
};

export type AuditPayload = {
  ok?: boolean;
  data?: OpsAuditRow[];
  error?: { code?: string; message?: string; fixHref?: string };
};

export type MetricsPayload = {
  ok?: boolean;
  data?: OpsMetricRow[];
  error?: { code?: string; message?: string; fixHref?: string };
};

export type SchedulerEventRow = {
  ts: string;
  mode: string;
  ok: boolean;
  exitCode: number;
  startedAt: string;
  endedAt: string;
  host?: string;
  message?: string;
};

export type SchedulerSummary = {
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
};

export type SchedulerPolicyMeta = {
  version: number;
  updatedAt?: string;
  source: "file" | "default";
  valid: boolean;
  errors: string[];
};

export type SchedulerPolicyDraft = {
  warnConsecutiveFailures: string;
  riskConsecutiveFailures: string;
};

export type SchedulerPayload = {
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

export type SchedulerPolicySavePayload = {
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

export type ActionRunPayload = {
  ok?: boolean;
  message?: string;
  error?: { code?: string; message?: string; fixHref?: string };
};

export type ActionPreviewData = {
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

export type ActionPreviewPayload = {
  ok?: boolean;
  data?: ActionPreviewData;
  error?: { code?: string; message?: string; fixHref?: string };
};

export type QuickAction = {
  id: OpsActionId;
  label: string;
  dangerous: boolean;
};

export type AutoRunSummary = {
  ranAt: string;
  total: number;
  completed: string[];
  failedLabel?: string;
  errorMessage?: string;
};

export type AutoRunSource = "manual" | "scheduled";

export type AutoRunAlert = {
  at: string;
  source: AutoRunSource;
  total: number;
  completedCount: number;
  failedLabel?: string;
  message: string;
};

export type ToastState = {
  type: "info" | "success" | "error";
  message: string;
};

export type ConfirmModalState =
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

export type SchedulerPolicyDelta = {
  warnDelta?: number;
  riskDelta?: number;
  warnBefore?: number;
  warnAfter?: number;
  riskBefore?: number;
  riskAfter?: number;
};

export const QUICK_ACTIONS: QuickAction[] = [...OPS_DASHBOARD_AUTO_RUN_ACTIONS];
export const AUTO_RUN_STORAGE_KEY = "ops.dashboard.auto_run.last_result.v1";
export const AUTO_RUN_SELECTION_STORAGE_KEY = "ops.dashboard.auto_run.selection.v1";
export const AUTO_RUN_POLICY_STORAGE_KEY = "ops.dashboard.auto_run.policy.v1";
export const SCHEDULER_FAILURE_NOTIFY_KEY = "ops.dashboard.scheduler.failure.last_notified.v1";

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readInt(value: unknown): number | null {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function formatDateTime(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString("ko-KR", { hour12: false });
}

export function statusBadgeClass(ok: boolean, warnCount: number): string {
  if (!ok) return "border-rose-200 bg-rose-50 text-rose-700";
  if (warnCount > 0) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-primary/20 bg-primary/5 text-navy";
}

export function issueBadgeClass(severity: DoctorIssue["severity"]): string {
  if (severity === "risk") return "border-rose-200 bg-rose-50 text-rose-700";
  if (severity === "warn") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-primary/20 bg-primary/5 text-navy";
}

export function severityText(severity: DoctorIssue["severity"]): string {
  if (severity === "risk") return "치명";
  if (severity === "warn") return "경고";
  return "정보";
}

export function schedulerModeText(mode: string): string {
  if (mode === "daily") return "daily";
  if (mode === "manual") return "manual";
  if (mode === "health") return "health";
  if (mode === "retry") return "retry";
  return mode;
}

export function schedulerStatusBadgeClass(level: "OK" | "WARN" | "RISK"): string {
  if (level === "RISK") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "WARN") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-primary/20 bg-primary/5 text-navy";
}

export function schedulerDeltaBadgeClass(delta: number): string {
  if (delta > 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (delta < 0) return "border-primary/20 bg-primary/5 text-navy";
  return "border-slate-200 bg-white text-slate-600";
}

export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

export function readSchedulerPolicyDelta(row: OpsAuditRow): SchedulerPolicyDelta {
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

export function toSafeDomId(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized || "unknown";
}

export function normalizeDoctorStatus(raw: string, fail: number, warn: number): "OK" | "WARN" | "RISK" {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "RISK") return "RISK";
  if (normalized === "WARN") return "WARN";
  if (normalized === "OK") return "OK";
  if (fail > 0) return "RISK";
  if (warn > 0) return "WARN";
  return "OK";
}

export function resetSchedulerPolicyDraftFromSummary(summary: SchedulerSummary | null): SchedulerPolicyDraft {
  return {
    warnConsecutiveFailures: String(summary?.thresholds.warnConsecutiveFailures ?? 1),
    riskConsecutiveFailures: String(summary?.thresholds.riskConsecutiveFailures ?? 3),
  };
}

export type OpsDashboardPageHeaderState = {
  hasCsrf: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
};

export type OpsDashboardTopNoticesState = {
  hasCsrf: boolean;
  hasReport: boolean;
  error: string;
  notice: string;
  autoRunAlert: AutoRunAlert | null;
  autoRunSummary: AutoRunSummary | null;
  autoRunPolicy: OpsDashboardAutoRunPolicy;
  toast: ToastState | null;
  onRetry: () => Promise<void>;
  onDismissAutoRunAlert: () => void;
  onDismissToast: () => void;
};

export type OpsDashboardSchedulerState = {
  schedulerRows: SchedulerEventRow[];
  schedulerSummary: SchedulerSummary | null;
  schedulerLogs: {
    stdout: string[];
    stderr: string[];
  };
  schedulerPolicyMeta: SchedulerPolicyMeta | null;
  schedulerPolicyDraft: SchedulerPolicyDraft;
  schedulerPolicySaving: boolean;
  schedulerPolicyError: string;
  schedulerPolicyHistoryRows: OpsAuditRow[];
  hasCsrf: boolean;
  onSchedulerPolicyDraftChange: (key: keyof SchedulerPolicyDraft, value: string) => void;
  onSaveSchedulerPolicy: () => Promise<void>;
  onResetSchedulerPolicyToDefaults: () => Promise<void>;
  onResetSchedulerPolicyDraft: () => void;
};

export type OpsDashboardDoctorState = {
  loading: boolean;
  report: DoctorReport | null;
  summaryLabel: string;
  issues: DoctorIssue[];
  actionRunning: OpsActionId | "";
  onStartActionWithPreview: (actionId: OpsActionId, label: string) => Promise<void>;
};

export type OpsDashboardQuickActionsState = {
  hasCsrf: boolean;
  autoRunning: boolean;
  actionRunning: OpsActionId | "";
  autoRunSelection: Record<OpsActionId, boolean>;
  autoRunPolicy: OpsDashboardAutoRunPolicy;
  selectedAutoRunActions: QuickAction[];
  notificationPermission: NotificationPermission | "unsupported";
  onRestoreSafeDefaults: () => void;
  onAutoRunPolicyEnabledChange: (value: boolean) => void;
  onAutoRunPolicyIntervalChange: (value: OpsDashboardAutoRunPolicy["intervalMinutes"]) => void;
  onAutoRunPolicyIncludeDangerousChange: (value: boolean) => void;
  onToggleAutoRunAction: (actionId: OpsActionId) => void;
  onRequestBrowserNotificationPermission: () => Promise<void>;
  onStartActionWithPreview: (actionId: OpsActionId, label: string) => Promise<void>;
  onRunQuickActionsAuto: () => Promise<void>;
  onOpenDangerousLinkConfirm: (href: string, title: string, confirmText?: string) => void;
};

export type OpsDashboardRecentEventsState = {
  auditRows: OpsAuditRow[];
  metricRows: OpsMetricRow[];
};

export type OpsDashboardDialogsState = {
  confirmModal: ConfirmModalState;
  confirmInput: string;
  onConfirmInputChange: (value: string) => void;
  onCloseConfirmModal: () => void;
  onExecuteModal: () => Promise<void>;
};

export { isOpsActionId };
