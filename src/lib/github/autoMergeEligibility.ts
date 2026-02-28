import { getGithubClient } from "./client";
import { requireGithubEnv } from "./env";
import {
  evaluateMergeableState,
  fetchApprovalsCount,
  fetchPullWithMergeableRetry,
} from "./autoMergePolicy";
import {
  buildEffectiveAutoMergePolicy,
  type EffectiveAutoMergePolicy,
  loadAutoMergePolicy,
} from "../ops/autoMergePolicy";

type PullApiLabel = {
  name?: string;
} | null;

type PullApiResponse = {
  number?: number;
  state?: string;
  draft?: boolean;
  html_url?: string;
  mergeable_state?: string | null;
  labels?: PullApiLabel[];
  head?: {
    sha?: string;
  } | null;
} | null;

type CheckRunItem = {
  name?: string;
  status?: string;
  conclusion?: string | null;
} | null;

type CheckRunsApiResponse = {
  check_runs?: CheckRunItem[];
} | null;

type StatusItem = {
  context?: string;
  state?: string;
} | null;

type CombinedStatusApiResponse = {
  statuses?: StatusItem[];
  contexts?: StatusItem[];
} | null;

export type AutoMergeEligibilityReasonCode =
  | "ELIGIBLE"
  | "DISABLED"
  | "LABEL_MISSING"
  | "APPROVALS_MISSING"
  | "MERGE_CONFLICT"
  | "BLOCKED"
  | "BEHIND"
  | "UNKNOWN_MERGEABLE"
  | "NOT_CLEAN"
  | "CHECKS_PENDING"
  | "CHECKS_FAIL"
  | "SHA_MISMATCH"
  | "DRAFT"
  | "NOT_OPEN"
  | "UNKNOWN";

export type AutoMergeEligibilityCheckSummary = {
  name: string;
  status: string;
  conclusion?: string;
};

export type AutoMergeEligibilityResult = {
  ok: boolean;
  eligible: boolean;
  reasonCode: AutoMergeEligibilityReasonCode;
  reasonMessage: string;
  expectedConfirm: string;
  headSha: string;
  requiredChecks: string[];
  checksSummary?: AutoMergeEligibilityCheckSummary[];
  prUrl?: string;
  approvalsRequired?: number;
  approvalsCount?: number;
  mergeableState?: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: string): string {
  return asString(value).toLowerCase();
}

function buildExpectedConfirmText(prNumber: number, headSha: string, template: string): string {
  return template
    .replaceAll("{PR}", String(prNumber))
    .replaceAll("{SHA7}", headSha.slice(0, 7));
}

function normalizeLabels(pull: PullApiResponse): string[] {
  const rows = Array.isArray(pull?.labels) ? pull.labels : [];
  return rows.map((item) => asString(item?.name)).filter((item) => item.length > 0);
}

function evaluateCheckRuns(
  requiredChecks: string[],
  payload: CheckRunsApiResponse,
): { reasonCode: AutoMergeEligibilityReasonCode; reasonMessage: string; checksSummary: AutoMergeEligibilityCheckSummary[] } {
  const rows = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const checksSummary = requiredChecks.map((requiredName) => {
    const key = normalizeKey(requiredName);
    const matches = rows
      .filter((item) => item && typeof item === "object" && normalizeKey(asString(item.name)) === key)
      .map((item) => ({
        status: normalizeKey(asString(item?.status)),
        conclusion: normalizeKey(asString(item?.conclusion)),
      }));
    if (matches.length < 1) {
      return {
        name: requiredName,
        status: "missing",
        conclusion: "missing",
      };
    }
    if (matches.some((item) => item.status === "completed" && item.conclusion === "success")) {
      return {
        name: requiredName,
        status: "completed",
        conclusion: "success",
      };
    }
    if (matches.some((item) => item.status !== "completed")) {
      return {
        name: requiredName,
        status: "pending",
        conclusion: "pending",
      };
    }
    const failedConclusion = matches.find((item) => item.conclusion && item.conclusion !== "success")?.conclusion || "failed";
    return {
      name: requiredName,
      status: "completed",
      conclusion: failedConclusion,
    };
  });

  const pending = checksSummary.filter((item) => item.status === "pending");
  if (pending.length > 0) {
    return {
      reasonCode: "CHECKS_PENDING",
      reasonMessage: `체크 대기 중: ${pending.map((item) => item.name).join(", ")}`,
      checksSummary,
    };
  }

  const failed = checksSummary.filter((item) => item.conclusion !== "success");
  if (failed.length > 0) {
    return {
      reasonCode: "CHECKS_FAIL",
      reasonMessage: `체크 실패/누락: ${failed.map((item) => `${item.name}(${item.conclusion || "failed"})`).join(", ")}`,
      checksSummary,
    };
  }

  return {
    reasonCode: "ELIGIBLE",
    reasonMessage: "필수 체크 통과",
    checksSummary,
  };
}

function evaluateCombinedStatus(
  requiredChecks: string[],
  payload: CombinedStatusApiResponse,
): { reasonCode: AutoMergeEligibilityReasonCode; reasonMessage: string; checksSummary: AutoMergeEligibilityCheckSummary[] } {
  const rows = [
    ...(Array.isArray(payload?.statuses) ? payload.statuses : []),
    ...(Array.isArray(payload?.contexts) ? payload.contexts : []),
  ];

  const checksSummary = requiredChecks.map((requiredName) => {
    const key = normalizeKey(requiredName);
    const matches = rows
      .filter((item) => item && typeof item === "object" && normalizeKey(asString(item.context)) === key)
      .map((item) => normalizeKey(asString(item?.state)));

    if (matches.length < 1) {
      return {
        name: requiredName,
        status: "missing",
        conclusion: "missing",
      };
    }
    if (matches.some((state) => state === "success")) {
      return {
        name: requiredName,
        status: "completed",
        conclusion: "success",
      };
    }
    if (matches.some((state) => state === "pending")) {
      return {
        name: requiredName,
        status: "pending",
        conclusion: "pending",
      };
    }
    const failedState = matches.find((state) => state && state !== "success") || "failed";
    return {
      name: requiredName,
      status: "completed",
      conclusion: failedState,
    };
  });

  const pending = checksSummary.filter((item) => item.status === "pending");
  if (pending.length > 0) {
    return {
      reasonCode: "CHECKS_PENDING",
      reasonMessage: `체크 대기 중: ${pending.map((item) => item.name).join(", ")}`,
      checksSummary,
    };
  }

  const failed = checksSummary.filter((item) => item.conclusion !== "success");
  if (failed.length > 0) {
    return {
      reasonCode: "CHECKS_FAIL",
      reasonMessage: `체크 실패/누락: ${failed.map((item) => `${item.name}(${item.conclusion || "failed"})`).join(", ")}`,
      checksSummary,
    };
  }

  return {
    reasonCode: "ELIGIBLE",
    reasonMessage: "필수 체크 통과",
    checksSummary,
  };
}

export async function getAutoMergeEligibility(
  prNumber: number,
  expectedHeadSha: string,
): Promise<AutoMergeEligibilityResult> {
  const safePrNumber = Number.isFinite(prNumber) && prNumber > 0 ? Math.trunc(prNumber) : 0;
  if (!safePrNumber) {
    return {
      ok: false,
      eligible: false,
      reasonCode: "UNKNOWN",
      reasonMessage: "유효한 prNumber가 필요합니다.",
      expectedConfirm: "",
      headSha: "",
      requiredChecks: [],
    };
  }

  let effectivePolicy: EffectiveAutoMergePolicy | null = null;
  try {
    const githubEnv = requireGithubEnv();
    const policy = await loadAutoMergePolicy();
    effectivePolicy = buildEffectiveAutoMergePolicy(githubEnv, policy);
  } catch (error) {
    return {
      ok: false,
      eligible: false,
      reasonCode: "UNKNOWN",
      reasonMessage: error instanceof Error ? error.message : "GitHub 환경변수 확인에 실패했습니다.",
      expectedConfirm: "",
      headSha: "",
      requiredChecks: [],
    };
  }
  if (!effectivePolicy) {
    return {
      ok: false,
      eligible: false,
      reasonCode: "UNKNOWN",
      reasonMessage: "Auto-merge policy를 불러오지 못했습니다.",
      expectedConfirm: "",
      headSha: "",
      requiredChecks: [],
    };
  }

  const requiredChecks = effectivePolicy.requiredChecks;
  const approvalsRequired = effectivePolicy.minApprovals;
  const github = getGithubClient();
  let pull: PullApiResponse;
  try {
    pull = await github.request<PullApiResponse>(`/pulls/${safePrNumber}`);
  } catch (error) {
    return {
      ok: false,
      eligible: false,
      reasonCode: "UNKNOWN",
      reasonMessage: error instanceof Error ? error.message : "PR 조회에 실패했습니다.",
      expectedConfirm: "",
      headSha: "",
      requiredChecks,
      approvalsRequired,
    };
  }

  const state = asString(pull?.state);
  const isDraft = pull?.draft === true;
  const headSha = asString(pull?.head?.sha);
  const prUrl = asString(pull?.html_url);
  const mergeableStateInitial = asString(pull?.mergeable_state).toLowerCase() || "unknown";
  const expectedConfirm = buildExpectedConfirmText(safePrNumber, headSha, effectivePolicy.confirmTemplate);

  if (!effectivePolicy.enabled) {
    return {
      ok: true,
      eligible: false,
      reasonCode: "DISABLED",
      reasonMessage: `AUTO_MERGE_DISABLED: env=${String(effectivePolicy.envEnabledFlag)}, policy.enabled=${String(effectivePolicy.policyEnabled)}`,
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  if (state !== "open") {
    return {
      ok: true,
      eligible: false,
      reasonCode: "NOT_OPEN",
      reasonMessage: `PR 상태가 open이 아닙니다. (state=${state || "-"})`,
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  if (isDraft) {
    return {
      ok: true,
      eligible: false,
      reasonCode: "DRAFT",
      reasonMessage: "Draft PR은 병합할 수 없습니다.",
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  const labelSet = new Set(normalizeLabels(pull).map((label) => normalizeKey(label)));
  if (!labelSet.has(normalizeKey(effectivePolicy.requiredLabel))) {
    return {
      ok: true,
      eligible: false,
      reasonCode: "LABEL_MISSING",
      reasonMessage: `필수 라벨 누락: ${effectivePolicy.requiredLabel}`,
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  const expectedSha = asString(expectedHeadSha);
  if (expectedSha && expectedSha !== headSha) {
    return {
      ok: true,
      eligible: false,
      reasonCode: "SHA_MISMATCH",
      reasonMessage: "PR head SHA가 변경되었습니다.",
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  let checksEvaluated:
    | { reasonCode: AutoMergeEligibilityReasonCode; reasonMessage: string; checksSummary: AutoMergeEligibilityCheckSummary[] }
    | null = null;
  try {
    const checkRuns = await github.request<CheckRunsApiResponse>(`/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`);
    checksEvaluated = evaluateCheckRuns(requiredChecks, checkRuns);
  } catch {
    try {
      const combined = await github.request<CombinedStatusApiResponse>(`/commits/${encodeURIComponent(headSha)}/status`);
      checksEvaluated = evaluateCombinedStatus(requiredChecks, combined);
    } catch (error) {
      return {
        ok: false,
        eligible: false,
        reasonCode: "UNKNOWN",
        reasonMessage: error instanceof Error ? error.message : "체크 상태 조회에 실패했습니다.",
        expectedConfirm,
        headSha,
        requiredChecks,
        prUrl,
        approvalsRequired,
        mergeableState: mergeableStateInitial,
      };
    }
  }

  if (!checksEvaluated) {
    return {
      ok: false,
      eligible: false,
      reasonCode: "UNKNOWN",
      reasonMessage: "체크 상태를 평가하지 못했습니다.",
      expectedConfirm,
      headSha,
      requiredChecks,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  if (checksEvaluated.reasonCode !== "ELIGIBLE") {
    return {
      ok: true,
      eligible: false,
      reasonCode: checksEvaluated.reasonCode,
      reasonMessage: checksEvaluated.reasonMessage,
      expectedConfirm,
      headSha,
      requiredChecks,
      checksSummary: checksEvaluated.checksSummary,
      prUrl,
      approvalsRequired,
      mergeableState: mergeableStateInitial,
    };
  }

  let finalPull = pull;
  let mergeableState = mergeableStateInitial;
  if (effectivePolicy.requireClean) {
    try {
      finalPull = await fetchPullWithMergeableRetry(github, safePrNumber, pull, {
        maxRetries: 3,
        retryDelayMs: 500,
      });
    } catch (error) {
      return {
        ok: false,
        eligible: false,
        reasonCode: "UNKNOWN",
        reasonMessage: error instanceof Error ? error.message : "mergeable_state 확인에 실패했습니다.",
        expectedConfirm,
        headSha,
        requiredChecks,
        checksSummary: checksEvaluated.checksSummary,
        prUrl,
        approvalsRequired,
        mergeableState,
      };
    }
    mergeableState = asString(finalPull?.mergeable_state).toLowerCase() || "unknown";
    const mergeable = evaluateMergeableState(mergeableState);
    if (!mergeable.ok) {
      return {
        ok: true,
        eligible: false,
        reasonCode: mergeable.reasonCode ?? "NOT_CLEAN",
        reasonMessage: mergeable.reasonMessage || "mergeable_state clean 조건 미충족",
        expectedConfirm,
        headSha,
        requiredChecks,
        checksSummary: checksEvaluated.checksSummary,
        prUrl,
        approvalsRequired,
        mergeableState: mergeable.state,
      };
    }
  }

  let approvalsCount = 0;
  if (approvalsRequired > 0) {
    try {
      approvalsCount = await fetchApprovalsCount(github, safePrNumber);
    } catch (error) {
      return {
        ok: false,
        eligible: false,
        reasonCode: "UNKNOWN",
        reasonMessage: error instanceof Error ? error.message : "리뷰 승인 상태 조회에 실패했습니다.",
        expectedConfirm,
        headSha,
        requiredChecks,
        checksSummary: checksEvaluated.checksSummary,
        prUrl,
        approvalsRequired,
        mergeableState,
      };
    }
    if (approvalsCount < approvalsRequired) {
      return {
        ok: true,
        eligible: false,
        reasonCode: "APPROVALS_MISSING",
        reasonMessage: `리뷰 승인 부족: approvals ${approvalsCount}/${approvalsRequired}`,
        expectedConfirm,
        headSha,
        requiredChecks,
        checksSummary: checksEvaluated.checksSummary,
        prUrl,
        approvalsRequired,
        approvalsCount,
        mergeableState,
      };
    }
  }

  return {
    ok: true,
    eligible: true,
    reasonCode: "ELIGIBLE",
    reasonMessage: "머지 가능한 상태입니다.",
    expectedConfirm,
    headSha,
    requiredChecks,
    checksSummary: checksEvaluated.checksSummary,
    prUrl,
    approvalsRequired,
    approvalsCount: approvalsRequired > 0 ? approvalsCount : undefined,
    mergeableState,
  };
}
