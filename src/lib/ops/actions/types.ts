export type OpsActionId =
  | "ASSUMPTIONS_REFRESH"
  | "RUNS_CLEANUP"
  | "REPAIR_INDEX"
  | "RUN_MIGRATIONS"
  | "DELETE_RUN";

export type OpsActionParams = {
  keepDays?: number;
  keepCount?: number;
  profileId?: string;
  runId?: string;
  confirmText?: string;
};

export type OpsActionRunResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  errorCode?: string;
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
