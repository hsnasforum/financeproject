"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type DoctorIssue } from "@/lib/ops/doctor/types";
import {
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
import { type OpsActionId } from "@/lib/ops/actions/types";
import {
  asString,
  AUTO_RUN_POLICY_STORAGE_KEY,
  AUTO_RUN_SELECTION_STORAGE_KEY,
  AUTO_RUN_STORAGE_KEY,
  type ActionPreviewData,
  type ActionPreviewPayload,
  type ActionRunPayload,
  type AuditPayload,
  type AutoRunSource,
  type AutoRunSummary,
  type ConfirmModalState,
  type DoctorPayload,
  type DoctorReport,
  type MetricsPayload,
  type OpsAuditRow,
  type OpsDashboardDialogsState,
  type OpsDashboardDoctorState,
  type OpsDashboardPageHeaderState,
  type OpsDashboardQuickActionsState,
  type OpsDashboardRecentEventsState,
  type OpsDashboardSchedulerState,
  type OpsDashboardTopNoticesState,
  type OpsMetricRow,
  QUICK_ACTIONS,
  resetSchedulerPolicyDraftFromSummary,
  SCHEDULER_FAILURE_NOTIFY_KEY,
  type SchedulerEventRow,
  type SchedulerPayload,
  type SchedulerPolicyMeta,
  type SchedulerPolicySavePayload,
  type SchedulerSummary,
  normalizeDoctorStatus,
} from "./shared";

type UseOpsDashboardControllerInput = {
  csrf: string;
};

export type OpsDashboardController = {
  pageHeader: OpsDashboardPageHeaderState;
  topNotices: OpsDashboardTopNoticesState;
  scheduler: OpsDashboardSchedulerState;
  doctor: OpsDashboardDoctorState;
  quickActions: OpsDashboardQuickActionsState;
  recentEvents: OpsDashboardRecentEventsState;
  dialogs: OpsDashboardDialogsState;
};

export function useOpsDashboardController({
  csrf,
}: UseOpsDashboardControllerInput): OpsDashboardController {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [issues, setIssues] = useState<DoctorIssue[]>([]);
  const [auditRows, setAuditRows] = useState<OpsAuditRow[]>([]);
  const [schedulerPolicyHistoryRows, setSchedulerPolicyHistoryRows] = useState<OpsAuditRow[]>([]);
  const [metricRows, setMetricRows] = useState<OpsMetricRow[]>([]);
  const [schedulerRows, setSchedulerRows] = useState<SchedulerEventRow[]>([]);
  const [schedulerSummary, setSchedulerSummary] = useState<SchedulerSummary | null>(null);
  const [schedulerLogs, setSchedulerLogs] = useState<{
    stdout: string[];
    stderr: string[];
  }>({
    stdout: [],
    stderr: [],
  });
  const [schedulerPolicyMeta, setSchedulerPolicyMeta] = useState<SchedulerPolicyMeta | null>(null);
  const [schedulerPolicyDraft, setSchedulerPolicyDraft] = useState({
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
  const [autoRunAlert, setAutoRunAlert] = useState<OpsDashboardTopNoticesState["autoRunAlert"]>(null);
  const [toast, setToast] = useState<OpsDashboardTopNoticesState["toast"]>(null);
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
      setAuditRows(Array.isArray(audit?.data) ? audit.data.slice(0, 12) : []);
      setSchedulerPolicyHistoryRows(
        Array.isArray(schedulerPolicyAudit?.data)
          ? schedulerPolicyAudit.data.filter((row) => row.eventType === "OPS_SCHEDULER_POLICY_UPDATE").slice(0, 6)
          : [],
      );
      setMetricRows(Array.isArray(metrics?.data) ? metrics.data.slice(0, 12) : []);
      if (scheduler?.ok && Array.isArray(scheduler.data)) {
        const rows = scheduler.data.slice(0, 6);
        const consecutiveFailures = Number(scheduler.meta?.summary?.consecutiveFailures ?? (() => {
          let count = 0;
          for (const row of rows) {
            if (!row.ok) {
              count += 1;
              continue;
            }
            break;
          }
          return count;
        })());
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
        const nextSummary: SchedulerSummary = {
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
        };
        setSchedulerSummary(nextSummary);
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
        body: `${latest.mode} · exit=${latest.exitCode} · ${latest.ts}`,
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

  const openToast = useCallback((nextToast: NonNullable<typeof toast>) => {
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

  const executeAutoRun = useCallback(async (actionsToRun: typeof QUICK_ACTIONS, source: AutoRunSource = "manual") => {
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

  return {
    pageHeader: {
      hasCsrf,
      loading,
      onRefresh: loadDashboard,
    },
    topNotices: {
      hasCsrf,
      hasReport: report !== null,
      error,
      notice,
      autoRunAlert,
      autoRunSummary,
      autoRunPolicy,
      toast,
      onRetry: loadDashboard,
      onDismissAutoRunAlert: () => setAutoRunAlert(null),
      onDismissToast: () => setToast(null),
    },
    scheduler: {
      schedulerRows,
      schedulerSummary,
      schedulerLogs,
      schedulerPolicyMeta,
      schedulerPolicyDraft,
      schedulerPolicySaving,
      schedulerPolicyError,
      schedulerPolicyHistoryRows,
      hasCsrf,
      onSchedulerPolicyDraftChange: (key, value) => {
        setSchedulerPolicyDraft((previous) => ({
          ...previous,
          [key]: value,
        }));
      },
      onSaveSchedulerPolicy: saveSchedulerPolicy,
      onResetSchedulerPolicyToDefaults: resetSchedulerPolicyToDefaults,
      onResetSchedulerPolicyDraft: () => {
        setSchedulerPolicyDraft(resetSchedulerPolicyDraftFromSummary(schedulerSummary));
        setSchedulerPolicyError("");
      },
    },
    doctor: {
      loading,
      report,
      summaryLabel,
      issues,
      actionRunning,
      onStartActionWithPreview: startActionWithPreview,
    },
    quickActions: {
      hasCsrf,
      autoRunning,
      actionRunning,
      autoRunSelection,
      autoRunPolicy,
      selectedAutoRunActions,
      notificationPermission,
      onRestoreSafeDefaults: () => {
        setAutoRunSelection(buildDefaultAutoRunSelection());
        setAutoRunPolicy(buildDefaultAutoRunPolicy());
      },
      onAutoRunPolicyEnabledChange: (value) => {
        setAutoRunPolicy((previous) => ({ ...previous, enabled: value }));
      },
      onAutoRunPolicyIntervalChange: (value) => {
        setAutoRunPolicy((previous) => ({ ...previous, intervalMinutes: value }));
      },
      onAutoRunPolicyIncludeDangerousChange: (value) => {
        setAutoRunPolicy((previous) => ({ ...previous, includeDangerous: value }));
      },
      onToggleAutoRunAction: toggleAutoRunAction,
      onRequestBrowserNotificationPermission: requestBrowserNotificationPermission,
      onStartActionWithPreview: startActionWithPreview,
      onRunQuickActionsAuto: runQuickActionsAuto,
      onOpenDangerousLinkConfirm: openDangerousLinkConfirm,
    },
    recentEvents: {
      auditRows,
      metricRows,
    },
    dialogs: {
      confirmModal,
      confirmInput,
      onConfirmInputChange: setConfirmInput,
      onCloseConfirmModal: () => setConfirmModal(null),
      onExecuteModal: executeModal,
    },
  };
}

export {
  OPS_DASHBOARD_AUTO_RUN_INTERVALS,
  QUICK_ACTIONS,
};
