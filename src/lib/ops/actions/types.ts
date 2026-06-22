export const OPS_ACTION_IDS = [
  "ASSUMPTIONS_REFRESH",
  "RUNS_CLEANUP",
  "REPAIR_INDEX",
  "RUN_MIGRATIONS",
  "DELETE_RUN",
  "DART_WATCH",
  "DAILY_REFRESH",
] as const;

export type OpsActionId = (typeof OPS_ACTION_IDS)[number];

export function isOpsActionId(value: unknown): value is OpsActionId {
  if (typeof value !== "string") return false;
  return (OPS_ACTION_IDS as readonly string[]).includes(value);
}

export type OpsActionParams = {
  keepDays?: number;
  keepCount?: number;
  profileId?: string;
  runId?: string;
  confirmText?: string;
};

export type OpsActionRunStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

export type OpsActionRunResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  errorCode?: string;
  status?: OpsActionRunStatus;
};

export type OpsActionPreviewResult = {
  ok: true;
  summary: {
    text: string;
    counts?: Record<string, number>;
    sampleIds?: string[];
    // backward compatibility for existing clients/tests
    ids?: string[];
    truncated?: boolean;
  };
};

export type OpsActionDefinition = {
  id: OpsActionId;
  title: string;
  description: string;
  dangerous?: boolean;
  requirePreview?: boolean;
  confirmText?: string;
};
