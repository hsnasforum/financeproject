import type { GithubClient } from "./client";

export type PullReviewApiItem = {
  state?: string;
  user?: {
    login?: string;
  } | null;
} | null;

export type PullMergeableApiItem = {
  mergeable_state?: string | null;
} | null;

export type MergeableRejectReasonCode =
  | "MERGE_CONFLICT"
  | "BLOCKED"
  | "BEHIND"
  | "UNKNOWN_MERGEABLE"
  | "NOT_CLEAN";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReviewState(value: string): string {
  return asString(value).toUpperCase();
}

function normalizeMergeableState(value: unknown): string {
  const normalized = asString(value).toLowerCase();
  return normalized || "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function countLatestApprovals(reviews: PullReviewApiItem[]): number {
  const latestStateByUser = new Map<string, string>();
  const rows = Array.isArray(reviews) ? reviews : [];

  for (const row of rows) {
    const user = asString(row?.user?.login);
    if (!user) continue;
    const state = normalizeReviewState(asString(row?.state));
    if (!state) continue;
    latestStateByUser.set(user, state);
  }

  let approvals = 0;
  for (const state of latestStateByUser.values()) {
    if (state === "APPROVED") approvals += 1;
  }
  return approvals;
}

export async function fetchApprovalsCount(github: GithubClient, prNumber: number): Promise<number> {
  const payload = await github.request<PullReviewApiItem[]>(`/pulls/${prNumber}/reviews?per_page=100`);
  const rows = Array.isArray(payload) ? payload : [];
  return countLatestApprovals(rows);
}

export async function fetchPullWithMergeableRetry<T extends PullMergeableApiItem>(
  github: GithubClient,
  prNumber: number,
  initialPull: T,
  options?: {
    maxRetries?: number;
    retryDelayMs?: number;
  },
): Promise<T> {
  const maxRetries = Number.isFinite(options?.maxRetries) ? Math.max(0, Math.trunc(options?.maxRetries as number)) : 3;
  const retryDelayMs = Number.isFinite(options?.retryDelayMs) ? Math.max(0, Math.trunc(options?.retryDelayMs as number)) : 500;

  let current = initialPull;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    if (normalizeMergeableState(current?.mergeable_state) !== "unknown") {
      return current;
    }
    if (retryDelayMs > 0) await sleep(retryDelayMs);
    current = await github.request<T>(`/pulls/${prNumber}`);
  }
  return current;
}

export function evaluateMergeableState(stateInput: unknown): {
  state: string;
  ok: boolean;
  reasonCode?: MergeableRejectReasonCode;
  reasonMessage?: string;
} {
  const state = normalizeMergeableState(stateInput);
  if (state === "clean") {
    return {
      state,
      ok: true,
    };
  }
  if (state === "dirty") {
    return {
      state,
      ok: false,
      reasonCode: "MERGE_CONFLICT",
      reasonMessage: "PR에 merge conflict가 있습니다. 충돌을 해결한 뒤 다시 시도해 주세요.",
    };
  }
  if (state === "blocked") {
    return {
      state,
      ok: false,
      reasonCode: "BLOCKED",
      reasonMessage: "브랜치 보호 규칙에 의해 PR이 blocked 상태입니다.",
    };
  }
  if (state === "behind") {
    return {
      state,
      ok: false,
      reasonCode: "BEHIND",
      reasonMessage: "PR head가 base 브랜치보다 behind 상태입니다. 최신 base 반영 후 다시 시도해 주세요.",
    };
  }
  if (state === "unknown") {
    return {
      state,
      ok: false,
      reasonCode: "UNKNOWN_MERGEABLE",
      reasonMessage: "mergeable_state를 확정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return {
    state,
    ok: false,
    reasonCode: "NOT_CLEAN",
    reasonMessage: `mergeable_state=${state} 이므로 clean 조건을 충족하지 않습니다.`,
  };
}
