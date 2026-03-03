export type DraftPreflightChange = {
  path: string;
  before?: unknown;
  after?: unknown;
  kind: "set" | "add" | "remove";
};

export type DraftPreflightMessage = {
  code: string;
  message: string;
};

export type DraftPreflightError = {
  path: string;
  message: string;
};

export type DraftPreflightResult = {
  ok: boolean;
  targetProfileId?: string;
  changes: DraftPreflightChange[];
  warnings: DraftPreflightMessage[];
  errors: DraftPreflightError[];
  summary: {
    changedCount: number;
    errorCount: number;
    warningCount: number;
  };
};

