export type OpsPolicy = {
  assumptions: {
    staleCautionDays: number;
    staleRiskDays: number;
  };
  runs: {
    defaultPageSize: number;
    maxPageSize: number;
    defaultKeepDays: number;
    defaultKeepCount: number;
    maxKeepDays: number;
    maxKeepCount: number;
  };
  doctor: {
    requiredEnvVars: string[];
    successRunWarnDays: number;
    scheduledRunFailureWarnCount: number;
    scheduledRunFailureWindowDays: number;
  };
  backup: {
    maxUploadBytes: number;
    maxEntries: number;
    maxPreviewIds: number;
  };
  metrics: {
    runFailRateWarnPct: number;
    runFailRateRiskPct: number;
    simulateLatencyWarnMultiplier: number;
    assumptionsRefreshConsecutiveFailRisk: number;
    failureRateWarnPct: number;
    latencyRegressionWarnMs: number;
    refreshFailureWarnCount: number;
    shortWindowHours: number;
    longWindowDays: number;
  };
  dataQuality: {
    finlifeSnapshotStaleWarnDays: number;
    dartCorpIndexStaleWarnDays: number;
  };
};

// v2 freeze defaults: update only with explicit release note and regression proof.
export const DEFAULT_OPS_POLICY: OpsPolicy = {
  assumptions: {
    staleCautionDays: 45,
    staleRiskDays: 120,
  },
  runs: {
    defaultPageSize: 20,
    maxPageSize: 200,
    defaultKeepDays: 90,
    defaultKeepCount: 50,
    maxKeepDays: 3650,
    maxKeepCount: 5000,
  },
  doctor: {
    requiredEnvVars: ["NODE_ENV"],
    successRunWarnDays: 30,
    scheduledRunFailureWarnCount: 3,
    scheduledRunFailureWindowDays: 14,
  },
  backup: {
    maxUploadBytes: 25 * 1024 * 1024,
    maxEntries: 10000,
    maxPreviewIds: 200,
  },
  metrics: {
    runFailRateWarnPct: 20,
    runFailRateRiskPct: 50,
    simulateLatencyWarnMultiplier: 1.8,
    assumptionsRefreshConsecutiveFailRisk: 3,
    failureRateWarnPct: 20,
    latencyRegressionWarnMs: 2_500,
    refreshFailureWarnCount: 3,
    shortWindowHours: 24,
    longWindowDays: 7,
  },
  dataQuality: {
    finlifeSnapshotStaleWarnDays: 30,
    dartCorpIndexStaleWarnDays: 14,
  },
};

function toInt(value: unknown): number | undefined {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = toInt(value);
  if (parsed === undefined) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseEnvList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

export function loadOpsPolicy(env: NodeJS.ProcessEnv = process.env): OpsPolicy {
  const defaults = DEFAULT_OPS_POLICY;
  const staleCautionDays = clampInt(env.PLANNING_OPS_STALE_CAUTION_DAYS, defaults.assumptions.staleCautionDays, 1, 3650);
  const staleRiskDays = clampInt(env.PLANNING_OPS_STALE_RISK_DAYS, defaults.assumptions.staleRiskDays, staleCautionDays + 1, 3650);

  const defaultPageSize = clampInt(env.PLANNING_OPS_RUNS_PAGE_SIZE, defaults.runs.defaultPageSize, 1, defaults.runs.maxPageSize);
  const maxPageSize = clampInt(env.PLANNING_OPS_RUNS_MAX_PAGE_SIZE, defaults.runs.maxPageSize, defaultPageSize, 1000);
  const defaultKeepDays = clampInt(env.PLANNING_OPS_RUNS_KEEP_DAYS, defaults.runs.defaultKeepDays, 1, defaults.runs.maxKeepDays);
  const defaultKeepCount = clampInt(env.PLANNING_OPS_RUNS_KEEP_COUNT, defaults.runs.defaultKeepCount, 1, defaults.runs.maxKeepCount);
  const maxKeepDays = clampInt(env.PLANNING_OPS_RUNS_MAX_KEEP_DAYS, defaults.runs.maxKeepDays, defaultKeepDays, 36500);
  const maxKeepCount = clampInt(env.PLANNING_OPS_RUNS_MAX_KEEP_COUNT, defaults.runs.maxKeepCount, defaultKeepCount, 20000);

  const envRequired = parseEnvList(env.PLANNING_OPS_DOCTOR_REQUIRED_ENVS);
  const requiredEnvVars = envRequired.length > 0 ? envRequired : defaults.doctor.requiredEnvVars;
  const successRunWarnDays = clampInt(
    env.PLANNING_OPS_DOCTOR_SUCCESS_RUN_WARN_DAYS,
    defaults.doctor.successRunWarnDays,
    1,
    3650,
  );
  const scheduledRunFailureWarnCount = clampInt(
    env.PLANNING_OPS_DOCTOR_SCHEDULED_RUN_FAILURE_WARN_COUNT,
    defaults.doctor.scheduledRunFailureWarnCount,
    1,
    1000,
  );
  const scheduledRunFailureWindowDays = clampInt(
    env.PLANNING_OPS_DOCTOR_SCHEDULED_RUN_FAILURE_WINDOW_DAYS,
    defaults.doctor.scheduledRunFailureWindowDays,
    1,
    3650,
  );
  const maxUploadBytes = clampInt(
    env.PLANNING_OPS_BACKUP_MAX_UPLOAD_BYTES,
    defaults.backup.maxUploadBytes,
    1024,
    500 * 1024 * 1024,
  );
  const maxEntries = clampInt(
    env.PLANNING_OPS_BACKUP_MAX_ENTRIES,
    defaults.backup.maxEntries,
    1,
    100000,
  );
  const maxPreviewIds = clampInt(
    env.PLANNING_OPS_BACKUP_MAX_PREVIEW_IDS,
    defaults.backup.maxPreviewIds,
    1,
    2000,
  );
  const failureRateWarnPct = clampInt(
    env.PLANNING_OPS_METRICS_FAILURE_RATE_WARN_PCT,
    defaults.metrics.failureRateWarnPct,
    1,
    100,
  );
  const runFailRateWarnPct = clampInt(
    env.PLANNING_OPS_METRICS_RUN_FAIL_RATE_WARN_PCT,
    defaults.metrics.runFailRateWarnPct,
    1,
    100,
  );
  const runFailRateRiskPct = clampInt(
    env.PLANNING_OPS_METRICS_RUN_FAIL_RATE_RISK_PCT,
    defaults.metrics.runFailRateRiskPct,
    runFailRateWarnPct,
    100,
  );
  const simulateLatencyWarnMultiplierRaw = Number(env.PLANNING_OPS_METRICS_SIMULATE_LATENCY_WARN_MULTIPLIER);
  const simulateLatencyWarnMultiplier = Number.isFinite(simulateLatencyWarnMultiplierRaw)
    ? Math.max(1, Math.min(10, simulateLatencyWarnMultiplierRaw))
    : defaults.metrics.simulateLatencyWarnMultiplier;
  const assumptionsRefreshConsecutiveFailRisk = clampInt(
    env.PLANNING_OPS_METRICS_ASSUMPTIONS_REFRESH_CONSECUTIVE_FAIL_RISK,
    defaults.metrics.assumptionsRefreshConsecutiveFailRisk,
    1,
    100,
  );
  const latencyRegressionWarnMs = clampInt(
    env.PLANNING_OPS_METRICS_LATENCY_REGRESSION_WARN_MS,
    defaults.metrics.latencyRegressionWarnMs,
    1,
    60 * 60 * 1000,
  );
  const refreshFailureWarnCount = clampInt(
    env.PLANNING_OPS_METRICS_REFRESH_FAILURE_WARN_COUNT,
    defaults.metrics.refreshFailureWarnCount,
    1,
    1000,
  );
  const shortWindowHours = clampInt(
    env.PLANNING_OPS_METRICS_SHORT_WINDOW_HOURS,
    defaults.metrics.shortWindowHours,
    1,
    24 * 30,
  );
  const longWindowDays = clampInt(
    env.PLANNING_OPS_METRICS_LONG_WINDOW_DAYS,
    defaults.metrics.longWindowDays,
    1,
    365,
  );
  const finlifeSnapshotStaleWarnDays = clampInt(
    env.PLANNING_OPS_DATA_QUALITY_FINLIFE_STALE_WARN_DAYS,
    defaults.dataQuality.finlifeSnapshotStaleWarnDays,
    1,
    3650,
  );
  const dartCorpIndexStaleWarnDays = clampInt(
    env.PLANNING_OPS_DATA_QUALITY_DART_STALE_WARN_DAYS,
    defaults.dataQuality.dartCorpIndexStaleWarnDays,
    1,
    3650,
  );

  return {
    assumptions: {
      staleCautionDays,
      staleRiskDays,
    },
    runs: {
      defaultPageSize,
      maxPageSize,
      defaultKeepDays,
      defaultKeepCount,
      maxKeepDays,
      maxKeepCount,
    },
    doctor: {
      requiredEnvVars,
      successRunWarnDays,
      scheduledRunFailureWarnCount,
      scheduledRunFailureWindowDays,
    },
    backup: {
      maxUploadBytes,
      maxEntries,
      maxPreviewIds,
    },
    metrics: {
      runFailRateWarnPct,
      runFailRateRiskPct,
      simulateLatencyWarnMultiplier,
      assumptionsRefreshConsecutiveFailRisk,
      failureRateWarnPct,
      latencyRegressionWarnMs,
      refreshFailureWarnCount,
      shortWindowHours,
      longWindowDays,
    },
    dataQuality: {
      finlifeSnapshotStaleWarnDays,
      dartCorpIndexStaleWarnDays,
    },
  };
}
