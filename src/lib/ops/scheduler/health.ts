import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpsDataDir } from "@/lib/planning/storage/dataDir";
import { appendScheduledTaskEvent, type ScheduledTaskCode, type ScheduledTaskName } from "@/lib/ops/scheduledTasks";
import {
  readOpsSchedulerEvents,
  summarizeOpsSchedulerEvents,
  type OpsSchedulerEvent,
  type OpsSchedulerSummary,
} from "./eventLog";

export type SchedulerHealthLevel = "OK" | "WARN" | "RISK";

export type SchedulerHealthState = {
  lastLevel: SchedulerHealthLevel | "";
  lastRiskEventId?: string;
  updatedAt?: string;
};

export type SchedulerHealthPlan = {
  riskEventId: string;
  emitRiskAlert: boolean;
  emitRecovered: boolean;
  nextState: SchedulerHealthState;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIso(value: unknown): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function isLevel(value: unknown): value is SchedulerHealthLevel {
  return value === "OK" || value === "WARN" || value === "RISK";
}

function normalizeState(raw: unknown): SchedulerHealthState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { lastLevel: "" };
  }
  const row = raw as Record<string, unknown>;
  return {
    lastLevel: isLevel(row.lastLevel) ? row.lastLevel : "",
    ...(asString(row.lastRiskEventId) ? { lastRiskEventId: asString(row.lastRiskEventId) } : {}),
    ...(asString(row.updatedAt) ? { updatedAt: toIso(row.updatedAt) } : {}),
  };
}

export function resolveSchedulerHealthStatePath(): string {
  const override = asString(process.env.PLANNING_OPS_SCHEDULER_HEALTH_STATE_PATH);
  if (override) return path.resolve(process.cwd(), override);
  return path.join(resolveOpsDataDir(), "logs", "scheduler-health.state.json");
}

export function toSchedulerRiskEventId(event: OpsSchedulerEvent | null | undefined): string {
  if (!event) return "";
  return `${event.ts}:${event.mode}:${event.exitCode}`;
}

export function planSchedulerHealthActions(input: {
  summary: OpsSchedulerSummary;
  latestEvent?: OpsSchedulerEvent;
  state: SchedulerHealthState;
  nowIso?: string;
}): SchedulerHealthPlan {
  const nowIso = toIso(input.nowIso);
  const riskEventId = toSchedulerRiskEventId(input.latestEvent);
  const inRisk = input.summary.level === "RISK";
  const emitRiskAlert = inRisk
    && input.summary.latestFailed
    && riskEventId.length > 0
    && input.state.lastRiskEventId !== riskEventId;
  const emitRecovered = input.state.lastLevel === "RISK" && !inRisk;

  return {
    riskEventId,
    emitRiskAlert,
    emitRecovered,
    nextState: {
      lastLevel: input.summary.level,
      ...(inRisk && riskEventId ? { lastRiskEventId: riskEventId } : {}),
      updatedAt: nowIso,
    },
  };
}

async function readHealthState(filePath: string): Promise<SchedulerHealthState> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!raw.trim()) return { lastLevel: "" };
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { lastLevel: "" };
  }
}

async function writeHealthState(filePath: string, state: SchedulerHealthState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

type SchedulerHealthAppendInput = {
  taskName: ScheduledTaskName;
  status: "SUCCESS" | "FAILED";
  code: ScheduledTaskCode;
  message: string;
  warningsCount: number;
  overallStatus: SchedulerHealthLevel;
};

function buildRiskAlertPayload(summary: OpsSchedulerSummary): SchedulerHealthAppendInput {
  return {
    taskName: "OPS_SCHEDULER_HEALTH",
    status: "FAILED",
    code: "RISK_STREAK",
    message: `scheduler risk streak=${summary.consecutiveFailures} (warn=${summary.thresholds.warnConsecutiveFailures}, risk=${summary.thresholds.riskConsecutiveFailures})`,
    warningsCount: summary.consecutiveFailures,
    overallStatus: summary.level,
  };
}

function buildRecoveredPayload(summary: OpsSchedulerSummary): SchedulerHealthAppendInput {
  return {
    taskName: "OPS_SCHEDULER_HEALTH",
    status: "SUCCESS",
    code: "OK",
    message: `scheduler recovered to ${summary.level}`,
    warningsCount: summary.consecutiveFailures,
    overallStatus: summary.level,
  };
}

export async function runSchedulerHealthGuard(options?: {
  limit?: number;
  statePath?: string;
  nowIso?: string;
}): Promise<{
  summary: OpsSchedulerSummary;
  latestEvent?: OpsSchedulerEvent;
  emitRiskAlert: boolean;
  emitRecovered: boolean;
  statePath: string;
}> {
  const rows = await readOpsSchedulerEvents({
    limit: typeof options?.limit === "number" ? options.limit : 40,
  });
  const summary = summarizeOpsSchedulerEvents(rows);
  const latestEvent = rows[0];
  const statePath = path.resolve(options?.statePath || resolveSchedulerHealthStatePath());
  const previous = await readHealthState(statePath);
  const plan = planSchedulerHealthActions({
    summary,
    latestEvent,
    state: previous,
    ...(options?.nowIso ? { nowIso: options.nowIso } : {}),
  });

  if (plan.emitRiskAlert) {
    const payload = buildRiskAlertPayload(summary);
    await appendScheduledTaskEvent({
      taskName: payload.taskName,
      status: payload.status,
      code: payload.code,
      message: payload.message,
      meta: {
        overallStatus: payload.overallStatus,
        warningsCount: payload.warningsCount,
      },
    }).catch(() => undefined);
  } else if (plan.emitRecovered) {
    const payload = buildRecoveredPayload(summary);
    await appendScheduledTaskEvent({
      taskName: payload.taskName,
      status: payload.status,
      code: payload.code,
      message: payload.message,
      meta: {
        overallStatus: payload.overallStatus,
        warningsCount: payload.warningsCount,
      },
    }).catch(() => undefined);
  }

  await writeHealthState(statePath, plan.nextState);
  return {
    summary,
    ...(latestEvent ? { latestEvent } : {}),
    emitRiskAlert: plan.emitRiskAlert,
    emitRecovered: plan.emitRecovered,
    statePath,
  };
}
