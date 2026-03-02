import fs from "node:fs";
import path from "node:path";

const MIN_FEEDBACK_ITEMS = 50;
const MAX_FEEDBACK_ITEMS = 5000;
const MIN_FIX_HISTORY_ITEMS = 50;
const MAX_FIX_HISTORY_ITEMS = 2000;
const MIN_LOG_BYTES = 50 * 1024;
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MIN_TAIL_BYTES = 10 * 1024;
const MAX_TAIL_BYTES = 2 * 1024 * 1024;

export type RetentionPolicy = {
  version: number;
  feedbackMaxItems: number;
  fixHistoryMaxItems: number;
  refreshLogMaxBytes: number;
  refreshLogKeepTailBytes: number;
  keepBackupRestorePoint: boolean;
};

export type ValidatePolicyResult =
  | { ok: true; data: RetentionPolicy }
  | { ok: false; errors: string[] };

export function defaultPolicy(): RetentionPolicy {
  return {
    version: 1,
    feedbackMaxItems: 500,
    fixHistoryMaxItems: 200,
    refreshLogMaxBytes: 1024 * 1024,
    refreshLogKeepTailBytes: 200 * 1024,
    keepBackupRestorePoint: true,
  };
}

export function retentionPolicyPath(cwd = process.cwd()): string {
  return path.join(cwd, "config", "retention-policy.json");
}

function asInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  if (rounded !== value) return null;
  return rounded;
}

export function validatePolicy(input: unknown): ValidatePolicyResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["정책은 객체여야 합니다."] };
  }

  const row = input as Record<string, unknown>;
  const errors: string[] = [];

  const version = asInteger(row.version);
  if (version === null || version < 1 || version > 9999) {
    errors.push("version은 1~9999 정수여야 합니다.");
  }

  const feedbackMaxItems = asInteger(row.feedbackMaxItems);
  if (feedbackMaxItems === null || feedbackMaxItems < MIN_FEEDBACK_ITEMS || feedbackMaxItems > MAX_FEEDBACK_ITEMS) {
    errors.push(`feedbackMaxItems는 ${MIN_FEEDBACK_ITEMS}~${MAX_FEEDBACK_ITEMS} 정수여야 합니다.`);
  }

  const fixHistoryMaxItems = asInteger(row.fixHistoryMaxItems);
  if (fixHistoryMaxItems === null || fixHistoryMaxItems < MIN_FIX_HISTORY_ITEMS || fixHistoryMaxItems > MAX_FIX_HISTORY_ITEMS) {
    errors.push(`fixHistoryMaxItems는 ${MIN_FIX_HISTORY_ITEMS}~${MAX_FIX_HISTORY_ITEMS} 정수여야 합니다.`);
  }

  const refreshLogMaxBytes = asInteger(row.refreshLogMaxBytes);
  if (refreshLogMaxBytes === null || refreshLogMaxBytes < MIN_LOG_BYTES || refreshLogMaxBytes > MAX_LOG_BYTES) {
    errors.push(`refreshLogMaxBytes는 ${MIN_LOG_BYTES}~${MAX_LOG_BYTES} 정수여야 합니다.`);
  }

  const refreshLogKeepTailBytes = asInteger(row.refreshLogKeepTailBytes);
  if (refreshLogKeepTailBytes === null || refreshLogKeepTailBytes < MIN_TAIL_BYTES || refreshLogKeepTailBytes > MAX_TAIL_BYTES) {
    errors.push(`refreshLogKeepTailBytes는 ${MIN_TAIL_BYTES}~${MAX_TAIL_BYTES} 정수여야 합니다.`);
  }

  if (
    refreshLogMaxBytes !== null
    && refreshLogKeepTailBytes !== null
    && refreshLogKeepTailBytes > refreshLogMaxBytes
  ) {
    errors.push("refreshLogKeepTailBytes는 refreshLogMaxBytes 이하이어야 합니다.");
  }

  if (typeof row.keepBackupRestorePoint !== "boolean") {
    errors.push("keepBackupRestorePoint는 boolean 이어야 합니다.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      version: version as number,
      feedbackMaxItems: feedbackMaxItems as number,
      fixHistoryMaxItems: fixHistoryMaxItems as number,
      refreshLogMaxBytes: refreshLogMaxBytes as number,
      refreshLogKeepTailBytes: refreshLogKeepTailBytes as number,
      keepBackupRestorePoint: row.keepBackupRestorePoint as boolean,
    },
  };
}

export function loadPolicy(filePath = retentionPolicyPath()): RetentionPolicy {
  if (!fs.existsSync(filePath)) {
    return defaultPolicy();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    const validated = validatePolicy(parsed);
    if (!validated.ok) {
      return defaultPolicy();
    }
    return validated.data;
  } catch {
    return defaultPolicy();
  }
}

export function savePolicy(policy: RetentionPolicy, filePath = retentionPolicyPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(policy, null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}
