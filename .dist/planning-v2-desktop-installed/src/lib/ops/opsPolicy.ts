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
  };
  backup: {
    maxUploadBytes: number;
    maxEntries: number;
    maxPreviewIds: number;
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
  },
  backup: {
    maxUploadBytes: 25 * 1024 * 1024,
    maxEntries: 10000,
    maxPreviewIds: 200,
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
    },
    backup: {
      maxUploadBytes,
      maxEntries,
      maxPreviewIds,
    },
  };
}
