import { type OpsActionId } from "../actions/types";

export type OpsErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    fixHref?: string;
  };
} | null;

export type OpsDashboardAutoRunAction = {
  id: OpsActionId;
  label: string;
  dangerous: boolean;
  defaultEnabled: boolean;
};

export const OPS_DASHBOARD_AUTO_RUN_INTERVALS = [10, 30, 60] as const;
export type OpsDashboardAutoRunInterval = (typeof OPS_DASHBOARD_AUTO_RUN_INTERVALS)[number];

export type OpsDashboardAutoRunPolicy = {
  enabled: boolean;
  intervalMinutes: OpsDashboardAutoRunInterval;
  includeDangerous: boolean;
};

export const OPS_DASHBOARD_AUTO_RUN_ACTIONS: OpsDashboardAutoRunAction[] = [
  { id: "ASSUMPTIONS_REFRESH", label: "가정 새로고침", dangerous: false, defaultEnabled: true },
  { id: "REPAIR_INDEX", label: "인덱스 수리", dangerous: true, defaultEnabled: false },
  { id: "RUN_MIGRATIONS", label: "마이그레이션 실행", dangerous: true, defaultEnabled: false },
  { id: "RUNS_CLEANUP", label: "실행 기록 정리", dangerous: true, defaultEnabled: false },
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAllowedInterval(value: number): value is OpsDashboardAutoRunInterval {
  return OPS_DASHBOARD_AUTO_RUN_INTERVALS.includes(value as OpsDashboardAutoRunInterval);
}

export function buildDefaultAutoRunSelection(): Record<OpsActionId, boolean> {
  const selection: Partial<Record<OpsActionId, boolean>> = {};
  for (const action of OPS_DASHBOARD_AUTO_RUN_ACTIONS) {
    selection[action.id] = action.defaultEnabled;
  }
  return selection as Record<OpsActionId, boolean>;
}

export function normalizeAutoRunSelection(
  raw: unknown,
  fallback: Record<OpsActionId, boolean> = buildDefaultAutoRunSelection(),
): Record<OpsActionId, boolean> {
  const normalized = { ...fallback };
  if (!isRecord(raw)) return normalized;
  for (const action of OPS_DASHBOARD_AUTO_RUN_ACTIONS) {
    if (action.id in raw) {
      normalized[action.id] = isTrue(raw[action.id]);
    }
  }
  return normalized;
}

export function buildDefaultAutoRunPolicy(): OpsDashboardAutoRunPolicy {
  return {
    enabled: false,
    intervalMinutes: 30,
    includeDangerous: false,
  };
}

export function normalizeAutoRunPolicy(
  raw: unknown,
  fallback: OpsDashboardAutoRunPolicy = buildDefaultAutoRunPolicy(),
): OpsDashboardAutoRunPolicy {
  if (!isRecord(raw)) return { ...fallback };
  const intervalRaw = Math.trunc(Number(raw.intervalMinutes));
  return {
    enabled: isTrue(raw.enabled),
    intervalMinutes: isAllowedInterval(intervalRaw) ? intervalRaw : fallback.intervalMinutes,
    includeDangerous: isTrue(raw.includeDangerous),
  };
}

export function isAutoRunDue(lastRanAt: string | null | undefined, intervalMinutes: number, nowMs = Date.now()): boolean {
  if (intervalMinutes <= 0) return true;
  const last = asString(lastRanAt);
  if (!last) return true;
  const lastTs = Date.parse(last);
  if (!Number.isFinite(lastTs)) return true;
  if (lastTs > nowMs) return false;
  return nowMs - lastTs >= intervalMinutes * 60_000;
}

export function selectEnabledAutoRunActions(
  selection: Partial<Record<OpsActionId, boolean>>,
): OpsDashboardAutoRunAction[] {
  return OPS_DASHBOARD_AUTO_RUN_ACTIONS.filter((action) => isTrue(selection[action.id]));
}

export function resolveScheduledAutoRunActions(
  selectedActions: OpsDashboardAutoRunAction[],
  includeDangerous: boolean,
): OpsDashboardAutoRunAction[] {
  if (includeDangerous) return selectedActions;
  return selectedActions.filter((action) => !action.dangerous);
}

export type ScheduledAutoRunBlockReason =
  | "policyDisabled"
  | "csrfMissing"
  | "alreadyRunning"
  | "locked"
  | "notDue"
  | "noActions";

export type ScheduledAutoRunGateResult =
  | { ok: true; actions: OpsDashboardAutoRunAction[] }
  | { ok: false; reason: ScheduledAutoRunBlockReason };

export function gateScheduledAutoRun(options: {
  policy: OpsDashboardAutoRunPolicy;
  hasCsrf: boolean;
  autoRunning: boolean;
  actionRunningCount: number;
  lockActive: boolean;
  selectedActions: OpsDashboardAutoRunAction[];
  lastRanAt: string | null | undefined;
  nowMs?: number;
}): ScheduledAutoRunGateResult {
  if (!options.policy.enabled) return { ok: false, reason: "policyDisabled" };
  if (!options.hasCsrf) return { ok: false, reason: "csrfMissing" };
  if (options.autoRunning || options.actionRunningCount > 0) {
    return { ok: false, reason: "alreadyRunning" };
  }
  if (options.lockActive) return { ok: false, reason: "locked" };
  if (!isAutoRunDue(options.lastRanAt, options.policy.intervalMinutes, options.nowMs)) {
    return { ok: false, reason: "notDue" };
  }
  const actions = resolveScheduledAutoRunActions(options.selectedActions, options.policy.includeDangerous);
  if (actions.length < 1) return { ok: false, reason: "noActions" };
  return { ok: true, actions };
}

export function toOpsActionErrorMessage(
  status: number,
  payload: OpsErrorPayload,
  fallbackMessage: string,
): string {
  const code = asString(payload?.error?.code).toUpperCase();
  const message = asString(payload?.error?.message);
  if (status === 403 && code === "CSRF") {
    return "보안 토큰(CSRF)이 만료되었습니다. 페이지를 새로고침 후 다시 시도해 주세요.";
  }
  if (status === 403 && code === "LOCAL_ONLY") {
    return "로컬 환경에서만 실행할 수 있습니다. localhost 또는 127.0.0.1로 접속해 주세요.";
  }
  if (status === 423 || code === "LOCKED") {
    return "Vault가 잠겨 있습니다. /ops/security에서 잠금 해제 후 다시 시도해 주세요.";
  }
  return message || fallbackMessage;
}
