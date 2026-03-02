export type OpsActionId =
  | "ASSUMPTIONS_REFRESH"
  | "RUNS_CLEANUP"
  | "REPAIR_INDEX"
  | "RUN_MIGRATIONS";

export type OpsActionParams = {
  keepDays?: number;
  keepCount?: number;
  profileId?: string;
  confirmText?: string;
};

export type OpsActionRunResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
};

export type OpsActionPreviewResult = {
  ok: true;
  summary: {
    text: string;
    counts?: Record<string, number>;
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
