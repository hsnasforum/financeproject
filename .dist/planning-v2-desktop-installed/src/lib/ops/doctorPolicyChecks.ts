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
