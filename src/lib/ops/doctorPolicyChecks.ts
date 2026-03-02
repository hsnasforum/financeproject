import { type DoctorCheck } from "./doctorChecks";

export type DoctorRunLike = {
  id?: unknown;
  createdAt?: unknown;
  overallStatus?: unknown;
  outputs?: unknown;
};

export type DoctorSnapshotLike = {
  asOf?: unknown;
  fetchedAt?: unknown;
};

export type DoctorMetricLike = {
  type?: unknown;
  at?: unknown;
  meta?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toUtcDayMs(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function computeStaleDays(fetchedAt?: unknown, now = new Date()): number | undefined {
  const raw = asString(fetchedAt);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const diff = Math.floor((toUtcDayMs(now) - toUtcDayMs(parsed)) / 86_400_000);
  return Math.max(0, diff);
}

export function buildAssumptionsFreshnessDoctorCheck(input: {
  snapshot: DoctorSnapshotLike | null;
  staleCautionDays: number;
  staleRiskDays: number;
  now?: Date;
}): DoctorCheck {
  if (!input.snapshot) {
    return {
      id: "assumptions-latest",
      title: "Assumptions latest snapshot",
      status: "FAIL",
      message: "latest assumptions snapshot이 없습니다.",
      fixHref: "/ops/assumptions",
    };
  }

  const staleDays = computeStaleDays(input.snapshot.fetchedAt, input.now);
  if (typeof staleDays !== "number") {
    return {
      id: "assumptions-latest",
      title: "Assumptions latest snapshot",
      status: "WARN",
      message: "snapshot fetchedAt을 해석할 수 없습니다.",
      fixHref: "/ops/assumptions",
      details: {
        fetchedAt: input.snapshot.fetchedAt,
      },
    };
  }

  const status = staleDays > input.staleCautionDays ? "WARN" : "PASS";
  return {
    id: "assumptions-latest",
    title: "Assumptions latest snapshot",
    status,
    message: status === "WARN"
      ? `latest snapshot staleDays=${staleDays} (기준 ${input.staleCautionDays}일)`
      : `latest snapshot staleDays=${staleDays}`,
    fixHref: "/ops/assumptions",
    details: {
      asOf: asString(input.snapshot.asOf),
      fetchedAt: asString(input.snapshot.fetchedAt),
      staleDays,
      staleCautionDays: input.staleCautionDays,
      staleRiskDays: input.staleRiskDays,
    },
  };
}

function runHasResultDto(run: DoctorRunLike): boolean {
  const outputs = isRecord(run.outputs) ? run.outputs : {};
  return isRecord(outputs.resultDto);
}

function isFailureMetricEvent(event: DoctorMetricLike): boolean {
  const meta = isRecord(event.meta) ? event.meta : {};
  const status = asString(meta.status).toUpperCase();
  return status === "FAILED" || status === "ERROR" || status === "FAIL";
}

function isAssumptionsRefreshFailure(event: DoctorMetricLike): boolean {
  const type = asString(event.type).toUpperCase();
  if (type !== "ASSUMPTIONS_REFRESH") return false;
  return isFailureMetricEvent(event);
}

function getDurationMs(event: DoctorMetricLike): number | undefined {
  const meta = isRecord(event.meta) ? event.meta : {};
  const duration = Number(meta.durationMs);
  if (!Number.isFinite(duration) || duration < 0) return undefined;
  return duration;
}

function inWindow(event: DoctorMetricLike, fromMs: number, toMs: number): boolean {
  const at = asString(event.at);
  const atMs = Date.parse(at);
  return Number.isFinite(atMs) && atMs >= fromMs && atMs <= toMs;
}

function averageDuration(rows: DoctorMetricLike[]): number | undefined {
  const durations = rows
    .map((row) => getDurationMs(row))
    .filter((row): row is number => typeof row === "number");
  if (durations.length < 1) return undefined;
  return durations.reduce((sum, value) => sum + value, 0) / durations.length;
}

function isScheduledTaskFailure(event: DoctorMetricLike, taskName: string): { failed: boolean; code?: string } {
  const type = asString(event.type).toUpperCase();
  if (type !== "SCHEDULED_TASK") return { failed: false };
  const meta = isRecord(event.meta) ? event.meta : {};
  const eventTask = asString(meta.taskName).toUpperCase();
  if (!eventTask || eventTask !== taskName.toUpperCase()) return { failed: false };
  const status = asString(meta.status).toUpperCase();
  if (!(status === "FAILED" || status === "ERROR" || status === "FAIL")) return { failed: false };
  const code = asString(meta.code).toUpperCase();
  return { failed: true, ...(code ? { code } : {}) };
}

export function isSuccessfulRun(run: DoctorRunLike): boolean {
  const status = asString(run.overallStatus).toUpperCase();
  if (status === "SUCCESS" || status === "PARTIAL_SUCCESS") return true;
  // Legacy runs may not have overallStatus; keep them eligible if DTO exists.
  if (!status && runHasResultDto(run)) return true;
  return false;
}

export function buildRecentSuccessfulRunDoctorCheck(input: {
  runs: DoctorRunLike[];
  successRunWarnDays: number;
  now?: Date;
}): DoctorCheck {
  const successful = input.runs
    .filter((run) => isSuccessfulRun(run))
    .map((run) => {
      const createdAt = asString(run.createdAt);
      const createdAtMs = Date.parse(createdAt);
      return {
        id: asString(run.id),
        createdAt,
        createdAtMs,
      };
    })
    .filter((run) => Number.isFinite(run.createdAtMs))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  if (successful.length < 1) {
    return {
      id: "runs-recent-success",
      title: "Recent successful run",
      status: "WARN",
      message: "최근 성공 run이 없습니다. /planning에서 실행 후 저장하세요.",
      fixHref: "/planning/runs",
      details: {
        successRunWarnDays: input.successRunWarnDays,
      },
    };
  }

  const latest = successful[0];
  const staleDays = computeStaleDays(latest.createdAt, input.now);
  if (typeof staleDays !== "number") {
    return {
      id: "runs-recent-success",
      title: "Recent successful run",
      status: "WARN",
      message: "최근 성공 run 시각을 해석할 수 없습니다.",
      fixHref: "/planning/runs",
      details: {
        latestRunId: latest.id,
        latestCreatedAt: latest.createdAt,
      },
    };
  }

  const status = staleDays > input.successRunWarnDays ? "WARN" : "PASS";
  return {
    id: "runs-recent-success",
    title: "Recent successful run",
    status,
    message: status === "WARN"
      ? `최근 성공 run이 ${staleDays}일 전입니다. (${input.successRunWarnDays}일 기준 초과)`
      : `최근 성공 run이 ${staleDays}일 전입니다.`,
    fixHref: "/planning/runs",
    details: {
      latestRunId: latest.id,
      latestCreatedAt: latest.createdAt,
      staleDays,
      successRunWarnDays: input.successRunWarnDays,
      successfulRunCount: successful.length,
    },
  };
}

export function buildMetricsDoctorChecks(input: {
  events: DoctorMetricLike[];
  failureRateWarnPct: number;
  latencyRegressionWarnMs: number;
  refreshFailureWarnCount: number;
  shortWindowHours: number;
  longWindowDays: number;
  now?: Date;
}): DoctorCheck[] {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const shortFromMs = nowMs - input.shortWindowHours * 60 * 60 * 1000;
  const longFromMs = nowMs - input.longWindowDays * 24 * 60 * 60 * 1000;

  const shortRows = input.events.filter((row) => inWindow(row, shortFromMs, nowMs));
  const longRows = input.events.filter((row) => inWindow(row, longFromMs, nowMs));
  const shortFailures = shortRows.filter((row) => isFailureMetricEvent(row)).length;
  const shortFailureRatePct = shortRows.length > 0 ? (shortFailures / shortRows.length) * 100 : 0;

  const shortAvg = averageDuration(shortRows);
  const longAvg = averageDuration(longRows);
  const latencyDelta = typeof shortAvg === "number" && typeof longAvg === "number"
    ? shortAvg - longAvg
    : undefined;
  const refreshFailures = shortRows.filter((row) => isAssumptionsRefreshFailure(row)).length;

  const failureRateCheck: DoctorCheck = {
    id: "metrics-failure-rate",
    title: "Metrics failure rate",
    status: shortRows.length > 0 && shortFailureRatePct >= input.failureRateWarnPct ? "WARN" : "PASS",
    message: shortRows.length > 0
      ? `최근 ${input.shortWindowHours}시간 실패율 ${shortFailureRatePct.toFixed(1)}% (${shortFailures}/${shortRows.length})`
      : `최근 ${input.shortWindowHours}시간 metrics 이벤트가 없습니다.`,
    fixHref: "/ops/metrics",
    details: {
      windowHours: input.shortWindowHours,
      total: shortRows.length,
      failed: shortFailures,
      failureRatePct: Number(shortFailureRatePct.toFixed(2)),
      warnThresholdPct: input.failureRateWarnPct,
    },
  };

  const latencyStatus = typeof latencyDelta === "number" && latencyDelta >= input.latencyRegressionWarnMs ? "WARN" : "PASS";
  const latencyCheck: DoctorCheck = {
    id: "metrics-latency-regression",
    title: "Metrics latency regression",
    status: latencyStatus,
    message: typeof latencyDelta === "number"
      ? `최근 ${input.shortWindowHours}시간 평균 지연 ${shortAvg?.toFixed(1)}ms / ${input.longWindowDays}일 평균 ${longAvg?.toFixed(1)}ms`
      : "지연 회귀 판단에 필요한 duration 데이터가 부족합니다.",
    fixHref: "/ops/metrics",
    details: {
      shortWindowHours: input.shortWindowHours,
      longWindowDays: input.longWindowDays,
      shortAvgMs: typeof shortAvg === "number" ? Number(shortAvg.toFixed(2)) : null,
      longAvgMs: typeof longAvg === "number" ? Number(longAvg.toFixed(2)) : null,
      deltaMs: typeof latencyDelta === "number" ? Number(latencyDelta.toFixed(2)) : null,
      warnThresholdMs: input.latencyRegressionWarnMs,
    },
  };

  const refreshFailureCheck: DoctorCheck = {
    id: "metrics-refresh-failures",
    title: "Assumptions refresh failures",
    status: refreshFailures >= input.refreshFailureWarnCount ? "WARN" : "PASS",
    message: `최근 ${input.shortWindowHours}시간 refresh 실패 ${refreshFailures}건`,
    fixHref: "/ops/assumptions",
    details: {
      windowHours: input.shortWindowHours,
      refreshFailures,
      warnThreshold: input.refreshFailureWarnCount,
    },
  };

  return [failureRateCheck, latencyCheck, refreshFailureCheck];
}

export function buildScheduledRunFailureDoctorCheck(input: {
  events: DoctorMetricLike[];
  taskName: string;
  failureWarnCount: number;
  windowDays: number;
  now?: Date;
}): DoctorCheck {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const fromMs = nowMs - input.windowDays * 24 * 60 * 60 * 1000;
  const scoped = input.events.filter((event) => inWindow(event, fromMs, nowMs));
  const failures = scoped
    .map((event) => {
      const result = isScheduledTaskFailure(event, input.taskName);
      if (!result.failed) return null;
      return {
        at: asString(event.at),
        ...(result.code ? { code: result.code } : {}),
      };
    })
    .filter((row): row is { at: string; code?: string } => row !== null);
  failures.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const recentCodes = Array.from(new Set(
    failures
      .map((row) => asString(row.code))
      .filter((row) => row.length > 0),
  )).slice(0, 5);
  const latestFailureAt = failures[0]?.at;
  const warn = failures.length >= input.failureWarnCount;

  return {
    id: "scheduled-run-failures",
    title: "Scheduled monthly run failures",
    status: warn ? "WARN" : "PASS",
    message: warn
      ? `최근 ${input.windowDays}일 동안 스케줄 실행 실패 ${failures.length}건`
      : `최근 ${input.windowDays}일 스케줄 실행 실패 ${failures.length}건`,
    fixHref: "/ops/metrics",
    details: {
      taskName: input.taskName,
      windowDays: input.windowDays,
      failureCount: failures.length,
      warnThreshold: input.failureWarnCount,
      latestFailureAt: latestFailureAt || null,
      recentCodes,
    },
  };
}
