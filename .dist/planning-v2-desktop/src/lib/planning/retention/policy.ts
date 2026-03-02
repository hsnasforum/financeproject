export type PlanningRetentionPolicy = {
  runs: { keepPerProfile: number; keepDays?: number };
  cache: { keepDays: number };
  opsReports: { keepCount: number };
  assumptionsHistory: { keepCount: number };
  trash: { keepDays: number };
};

export const DEFAULT_PLANNING_RETENTION_POLICY: PlanningRetentionPolicy = {
  runs: { keepPerProfile: 50 },
  cache: { keepDays: 7 },
  opsReports: { keepCount: 50 },
  assumptionsHistory: { keepCount: 200 },
  trash: { keepDays: 30 },
};

function toInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toInt(value);
  if (parsed === undefined) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  const parsed = toInt(value);
  if (parsed === undefined || parsed < 1) return undefined;
  return Math.min(36500, parsed);
}

export function loadPlanningRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): PlanningRetentionPolicy {
  const defaults = DEFAULT_PLANNING_RETENTION_POLICY;

  const runsKeepPerProfile = clamp(
    env.PLANNING_RETENTION_RUNS_PER_PROFILE,
    defaults.runs.keepPerProfile,
    1,
    5000,
  );
  const runsKeepDays = toOptionalPositiveInt(env.PLANNING_RETENTION_RUNS_KEEP_DAYS);
  const cacheKeepDays = clamp(
    env.PLANNING_RETENTION_CACHE_KEEP_DAYS,
    defaults.cache.keepDays,
    1,
    3650,
  );
  const opsReportsKeepCount = clamp(
    env.PLANNING_RETENTION_OPS_REPORTS_KEEP_COUNT,
    defaults.opsReports.keepCount,
    1,
    5000,
  );
  const assumptionsHistoryKeepCount = clamp(
    env.PLANNING_RETENTION_ASSUMPTIONS_HISTORY_KEEP_COUNT,
    defaults.assumptionsHistory.keepCount,
    1,
    5000,
  );
  const trashKeepDays = clamp(
    env.PLANNING_RETENTION_TRASH_KEEP_DAYS,
    defaults.trash.keepDays,
    1,
    3650,
  );

  return {
    runs: {
      keepPerProfile: runsKeepPerProfile,
      ...(runsKeepDays ? { keepDays: runsKeepDays } : {}),
    },
    cache: { keepDays: cacheKeepDays },
    opsReports: { keepCount: opsReportsKeepCount },
    assumptionsHistory: { keepCount: assumptionsHistoryKeepCount },
    trash: { keepDays: trashKeepDays },
  };
}
