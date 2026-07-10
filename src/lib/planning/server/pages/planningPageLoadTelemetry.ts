import { roundToInteger } from "../../calc/roundingPolicy";

export type PlanningPageLoadTelemetryContext = Record<string, string | number | boolean | null | undefined>;

export type PlanningPageLoadTelemetryStep = {
  durationMs: number;
  errorName?: string;
  name: string;
  status: "ok" | "error";
};

export type PlanningPageLoadTelemetrySnapshot = {
  context: Record<string, string | number | boolean | null>;
  route: string;
  slowThresholdMs: number;
  steps: PlanningPageLoadTelemetryStep[];
  totalMs: number;
};

export type PlanningPageLoadTelemetryLogger = (snapshot: PlanningPageLoadTelemetrySnapshot) => void;

const DEFAULT_SLOW_PAGE_LOAD_THRESHOLD_MS = 5_000;

function readNowMs(): number {
  return Date.now();
}

function toDurationMs(startMs: number, endMs: number): number {
  const duration = endMs - startMs;
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return roundToInteger(duration) ?? 0;
}

function normalizeThresholdMs(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_SLOW_PAGE_LOAD_THRESHOLD_MS;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SLOW_PAGE_LOAD_THRESHOLD_MS;
  return roundToInteger(parsed) ?? DEFAULT_SLOW_PAGE_LOAD_THRESHOLD_MS;
}

function normalizeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "Error";
}

function sanitizeContext(
  context: PlanningPageLoadTelemetryContext,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    if (typeof value === "number") {
      sanitized[key] = Number.isFinite(value) ? value : null;
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

function defaultPlanningPageLoadTelemetryLogger(snapshot: PlanningPageLoadTelemetrySnapshot): void {
  console.warn("[planning/page-load] slow initial data load", snapshot);
}

export function getPlanningPageLoadSlowThresholdMs(): number {
  return normalizeThresholdMs(process.env.PLANNING_PAGE_LOAD_SLOW_MS);
}

export function createPlanningPageLoadTelemetry(input: {
  context?: PlanningPageLoadTelemetryContext;
  enabled?: boolean;
  logger?: PlanningPageLoadTelemetryLogger;
  nowMs?: () => number;
  route: string;
  slowThresholdMs?: number;
}) {
  const enabled = input.enabled ?? process.env.NODE_ENV !== "test";
  const logger = input.logger ?? defaultPlanningPageLoadTelemetryLogger;
  const nowMs = input.nowMs ?? readNowMs;
  const route = input.route;
  const slowThresholdMs = input.slowThresholdMs ?? getPlanningPageLoadSlowThresholdMs();
  const startedAt = nowMs();
  const steps: PlanningPageLoadTelemetryStep[] = [];

  async function step<T>(name: string, task: () => Promise<T>): Promise<T> {
    const stepStartedAt = nowMs();
    try {
      const result = await task();
      steps.push({
        durationMs: toDurationMs(stepStartedAt, nowMs()),
        name,
        status: "ok",
      });
      return result;
    } catch (error) {
      steps.push({
        durationMs: toDurationMs(stepStartedAt, nowMs()),
        errorName: normalizeErrorName(error),
        name,
        status: "error",
      });
      throw error;
    }
  }

  function finish(context: PlanningPageLoadTelemetryContext = {}): PlanningPageLoadTelemetrySnapshot {
    const snapshot: PlanningPageLoadTelemetrySnapshot = {
      context: sanitizeContext({
        ...input.context,
        ...context,
      }),
      route,
      slowThresholdMs,
      steps: steps.map((record) => ({ ...record })),
      totalMs: toDurationMs(startedAt, nowMs()),
    };

    if (enabled && snapshot.totalMs >= slowThresholdMs) {
      logger(snapshot);
    }

    return snapshot;
  }

  return {
    finish,
    step,
  };
}
