import type { AutoMergeEligibilityReasonCode } from "./autoMergeEligibility";

export const AUTO_MERGE_ARM_SESSION_KEY = "ops:auto-merge:armed";
export const AUTO_MERGE_ARM_SESSION_VERSION = 1;

export type AutoMergeArmPersistEntry = {
  expectedHeadSha: string;
  confirmText: string;
  armedAt: string;
  lastCheckAt?: string;
  lastReasonCode?: string;
};

export type AutoMergeArmPersistPayload = {
  version: number;
  armed: Record<string, AutoMergeArmPersistEntry>;
};

export type AutoMergeArmCandidate = {
  number: number;
  headSha: string;
};

export type PruneArmedStateResult = {
  armed: Record<string, AutoMergeArmPersistEntry>;
  removedMissing: number[];
  removedShaMismatch: number[];
};

export type PollIntervalInput = {
  reasonCode?: string;
  requestError?: boolean;
  previousBackoffMs?: number;
  baseIntervalMs?: number;
};

export type PollIntervalResult = {
  intervalMs: number;
  nextBackoffMs: number;
};

const DEFAULT_BASE_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 120_000;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReasonCode(value: string): AutoMergeEligibilityReasonCode | "UNKNOWN" {
  const code = asString(value).toUpperCase();
  if (
    code === "ELIGIBLE"
    || code === "DISABLED"
    || code === "LABEL_MISSING"
    || code === "APPROVALS_MISSING"
    || code === "MERGE_CONFLICT"
    || code === "BLOCKED"
    || code === "BEHIND"
    || code === "UNKNOWN_MERGEABLE"
    || code === "NOT_CLEAN"
    || code === "CHECKS_PENDING"
    || code === "CHECKS_FAIL"
    || code === "SHA_MISMATCH"
    || code === "DRAFT"
    || code === "NOT_OPEN"
    || code === "UNKNOWN"
  ) {
    return code;
  }
  return "UNKNOWN";
}

function normalizePrNumberKey(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.trunc(parsed);
}

export function parseArmPersistPayload(raw: string | null | undefined): AutoMergeArmPersistPayload {
  if (!raw) {
    return {
      version: AUTO_MERGE_ARM_SESSION_VERSION,
      armed: {},
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AutoMergeArmPersistPayload>;
    const version = typeof parsed.version === "number" ? parsed.version : AUTO_MERGE_ARM_SESSION_VERSION;
    const armedRows = parsed.armed && typeof parsed.armed === "object" ? parsed.armed : {};
    const armed: Record<string, AutoMergeArmPersistEntry> = {};

    for (const [rawKey, rawEntry] of Object.entries(armedRows)) {
      const prNumber = normalizePrNumberKey(rawKey);
      if (!prNumber) continue;
      const entry = rawEntry as Partial<AutoMergeArmPersistEntry> | null;
      const expectedHeadSha = asString(entry?.expectedHeadSha);
      const confirmText = asString(entry?.confirmText);
      const armedAt = asString(entry?.armedAt);
      if (!expectedHeadSha || !confirmText || !armedAt) continue;
      const lastCheckAt = asString(entry?.lastCheckAt);
      const lastReasonCode = asString(entry?.lastReasonCode);
      armed[String(prNumber)] = {
        expectedHeadSha,
        confirmText,
        armedAt,
        ...(lastCheckAt ? { lastCheckAt } : {}),
        ...(lastReasonCode ? { lastReasonCode } : {}),
      };
    }

    return {
      version,
      armed,
    };
  } catch {
    return {
      version: AUTO_MERGE_ARM_SESSION_VERSION,
      armed: {},
    };
  }
}

export function pruneArmedState(
  armed: Record<string, AutoMergeArmPersistEntry>,
  candidates: AutoMergeArmCandidate[],
): PruneArmedStateResult {
  const byPr = new Map<number, string>();
  for (const candidate of candidates) {
    const prNumber = Number.isFinite(candidate.number) ? Math.trunc(candidate.number) : 0;
    if (!prNumber) continue;
    byPr.set(prNumber, asString(candidate.headSha));
  }

  const nextArmed: Record<string, AutoMergeArmPersistEntry> = {};
  const removedMissing: number[] = [];
  const removedShaMismatch: number[] = [];

  for (const [rawPr, entry] of Object.entries(armed)) {
    const prNumber = normalizePrNumberKey(rawPr);
    if (!prNumber) continue;
    const candidateHeadSha = byPr.get(prNumber);
    if (!candidateHeadSha) {
      removedMissing.push(prNumber);
      continue;
    }
    if (candidateHeadSha !== asString(entry.expectedHeadSha)) {
      removedShaMismatch.push(prNumber);
      continue;
    }
    nextArmed[String(prNumber)] = entry;
  }

  return {
    armed: nextArmed,
    removedMissing,
    removedShaMismatch,
  };
}

export function computeNextPollInterval(input: PollIntervalInput): PollIntervalResult {
  const reasonCode = normalizeReasonCode(asString(input.reasonCode));
  const previousBackoffMs = Number.isFinite(input.previousBackoffMs)
    ? Math.max(0, Math.trunc(input.previousBackoffMs as number))
    : 0;
  const baseIntervalMs = Number.isFinite(input.baseIntervalMs)
    ? Math.max(5_000, Math.min(120_000, Math.trunc(input.baseIntervalMs as number)))
    : DEFAULT_BASE_INTERVAL_MS;
  const pendingIntervalMs = Math.max(5_000, Math.min(baseIntervalMs, 10_000));
  const slowIntervalMs = Math.max(60_000, baseIntervalMs * 4);

  if (input.requestError) {
    const nextBackoffMs = previousBackoffMs > 0
      ? Math.min(previousBackoffMs * 2, MAX_BACKOFF_MS)
      : baseIntervalMs;
    return {
      intervalMs: nextBackoffMs,
      nextBackoffMs,
    };
  }

  if (reasonCode === "CHECKS_PENDING") {
    return {
      intervalMs: pendingIntervalMs,
      nextBackoffMs: 0,
    };
  }

  if (
    reasonCode === "CHECKS_FAIL"
    || reasonCode === "LABEL_MISSING"
    || reasonCode === "APPROVALS_MISSING"
    || reasonCode === "MERGE_CONFLICT"
    || reasonCode === "BLOCKED"
    || reasonCode === "BEHIND"
    || reasonCode === "UNKNOWN_MERGEABLE"
    || reasonCode === "NOT_CLEAN"
    || reasonCode === "DISABLED"
    || reasonCode === "DRAFT"
    || reasonCode === "NOT_OPEN"
    || reasonCode === "SHA_MISMATCH"
  ) {
    return {
      intervalMs: slowIntervalMs,
      nextBackoffMs: 0,
    };
  }

  return {
    intervalMs: baseIntervalMs,
    nextBackoffMs: 0,
  };
}
